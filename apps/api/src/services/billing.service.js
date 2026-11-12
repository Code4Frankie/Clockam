import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { Organization } from '../models/Organization.js';
import { PlanConfig } from '../models/PlanConfig.js';
import { Payment } from '../models/Payment.js';
import { User } from '../models/User.js';
import { HttpError } from '../utils/http.js';
import { billingState, computeCharge, extendPaidUntil, transactionMatches } from '../utils/billing.js';

let cache = { at: 0, plan: null };
export function clearPlanCache() { cache = { at: 0, plan: null }; }

export async function getPlan() {
  if (Date.now() - cache.at < 30000 && cache.plan) return cache.plan;
  const doc = await PlanConfig.findOne({ key: 'default' }).lean();
  let packages = doc?.packages ?? [];
  // Prices saved before packages existed (worker-count tiers with one global setup fee) are carried over as packages.
  if (!packages.length && doc?.tiers?.length) {
    packages = doc.tiers.map((t) => ({ name: t.name, description: '', monthlyPrice: t.monthlyPrice, setupFee: doc.setupFee ?? 0, maxPeople: t.maxWorkers ?? null }));
  }
  const plan = { vatPercent: doc?.vatPercent ?? 0, trialDays: doc?.trialDays ?? 0, packages };
  cache = { at: Date.now(), plan };
  return plan;
}

export const countWorkers = (orgId) => User.countDocuments({ organization: orgId, active: true, role: { $ne: 'owner' } });

// Frankiecode staff and workplaces with billing waived are never charged or locked.
export async function isBillingExempt(org) {
  if (org.billing?.exempt) return true;
  if (!env.platformAdminIds.length) return false;
  return !!(await User.exists({ organization: org._id, _id: { $in: env.platformAdminIds.filter((id) => /^[a-f0-9]{24}$/i.test(id)) } }));
}

// Everything the billing screens need for one workplace. Only the subscribed package produces a charge.
export async function billingSummary(org) {
  const plan = await getPlan();
  const workers = await countWorkers(org._id);
  const exempt = await isBillingExempt(org);
  const state = billingState({ plan, billing: org.billing, createdAt: org.createdAt, enforced: env.billingEnforced, exempt });
  const subscribed = org.billing?.packageName || null;
  const charge = exempt ? null : computeCharge({ plan, packageName: subscribed, workers, setupPaid: !!org.billing?.setupPaid });
  return {
    plan, workers, state, charge, exempt, subscribed,
    trialEndsAt: org.billing?.trialEndsAt || null, setupPaid: !!org.billing?.setupPaid,
  };
}

const PAYSTACK = 'https://api.paystack.co';
async function paystack(path, init = {}) {
  if (!env.paystackSecretKey) throw new HttpError(503, 'Online payment is not switched on yet');
  const res = await fetch(`${PAYSTACK}${path}`, { ...init, headers: { Authorization: `Bearer ${env.paystackSecretKey}`, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(15000) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.status === false) throw new HttpError(502, 'The payment service did not accept the request. Try again shortly.');
  return body.data;
}

// Creates a pending payment for exactly what the server says is owed, then asks Paystack for a checkout link.
export async function startCheckout({ org, user }) {
  const { charge } = await billingSummary(org);
  if (!charge) throw new HttpError(400, 'Choose a package first.');
  if (charge.overCapacity) throw new HttpError(400, `Your package allows up to ${charge.maxPeople} people and you have ${charge.workers}. Choose a bigger package.`);
  if (charge.total <= 0) throw new HttpError(400, 'Nothing to pay');
  const reference = `ca_${crypto.randomBytes(12).toString('hex')}`;
  const payment = await Payment.create({
    organization: org._id, provider: 'paystack', reference, amount: charge.total,
    breakdown: { tierName: charge.packageName, workers: charge.workers, monthly: charge.monthly, setupFee: charge.setupFee, vat: charge.vat },
  });
  const data = await paystack('/transaction/initialize', {
    method: 'POST',
    body: JSON.stringify({ email: user.email, amount: charge.total, currency: 'NGN', reference, callback_url: `${env.webAppUrl}/billing`, metadata: { organization: String(org._id) } }),
  });
  return { url: data.authorization_url, reference: payment.reference };
}

// Marks a payment paid and extends the subscription. Safe to call twice (webhook and return page): only the first call counts.
export async function settleFromTransaction(tx) {
  const payment = await Payment.findOne({ reference: tx?.reference });
  if (!payment) return null;
  if (!transactionMatches(payment, tx)) return payment;
  const won = await Payment.findOneAndUpdate({ _id: payment._id, status: 'pending' }, { status: 'success', paidAt: new Date() }, { new: true });
  if (!won) return payment; // already settled
  const org = await Organization.findById(payment.organization);
  org.set('billing.paidUntil', extendPaidUntil(org.billing?.paidUntil));
  org.set('billing.setupPaid', true);
  await org.save();
  return won;
}

export async function verifyReference(reference, orgId) {
  const payment = await Payment.findOne({ reference, organization: orgId });
  if (!payment) throw new HttpError(404, 'Payment not found');
  if (payment.status === 'success') return payment;
  const tx = await paystack(`/transaction/verify/${encodeURIComponent(reference)}`);
  return (await settleFromTransaction(tx)) || payment;
}
