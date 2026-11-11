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
  const plan = { setupFee: doc?.setupFee ?? 0, vatPercent: doc?.vatPercent ?? 0, trialDays: doc?.trialDays ?? 0, tiers: doc?.tiers ?? [] };
  cache = { at: Date.now(), plan };
  return plan;
}

export const countWorkers = (orgId) => User.countDocuments({ organization: orgId, active: true, role: { $ne: 'owner' } });

export async function orgBilling(org) {
  const plan = await getPlan();
  const workers = await countWorkers(org._id);
  const state = billingState({ plan, billing: org.billing, createdAt: org.createdAt, enforced: env.billingEnforced });
  const charge = plan.tiers.length ? computeCharge({ plan, workers, setupPaid: !!org.billing?.setupPaid }) : null;
  return { plan, workers, state, charge };
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
  const { charge } = await orgBilling(org);
  if (!charge) throw new HttpError(400, 'No price applies to your number of staff yet. Contact Frankiecode Solutions.');
  if (charge.total <= 0) throw new HttpError(400, 'Nothing to pay');
  const reference = `ca_${crypto.randomBytes(12).toString('hex')}`;
  const payment = await Payment.create({
    organization: org._id, provider: 'paystack', reference, amount: charge.total,
    breakdown: { tierName: charge.tierName, workers: charge.workers, monthly: charge.monthly, setupFee: charge.setupFee, vat: charge.vat },
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
  org.billing = { paidUntil: extendPaidUntil(org.billing?.paidUntil), setupPaid: true };
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
