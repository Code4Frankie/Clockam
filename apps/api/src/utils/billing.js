import crypto from 'node:crypto';
import { z } from 'zod';

// All money is in kobo (1 naira = 100 kobo) as whole numbers, so there are no rounding surprises.
export const GRACE_DAYS = 3; // after the paid period ends, admin features keep working this long
export const PERIOD_DAYS = 30; // each payment buys 30 days
const DAY = 24 * 3600 * 1000;

const packageSchema = z.object({
  name: z.string().trim().min(1).max(40),
  description: z.string().trim().max(120).default(''),
  monthlyPrice: z.number().int().min(0).max(1_000_000_000),
  setupFee: z.number().int().min(0).max(1_000_000_000), // charged once, with the first payment on this package
  maxPeople: z.number().int().min(1).nullable(), // null = no limit
}).strict();

// Packages are made by Frankiecode in the app, never in code. An owner subscribes to one, and only that one is billed.
export const planSchema = z
  .object({
    vatPercent: z.number().min(0).max(100),
    trialDays: z.number().int().min(0).max(365),
    packages: z.array(packageSchema).max(12),
  })
  .strict()
  .superRefine((plan, ctx) => {
    const names = plan.packages.map((x) => x.name.toLowerCase());
    if (new Set(names).size !== names.length) ctx.addIssue({ code: 'custom', path: ['packages'], message: 'Each package needs a different name' });
  });

// What the subscribed package costs for the next period. The package's setup fee is charged once, with the first payment.
// Nothing else is added: no subscription means no charge.
export function computeCharge({ plan, packageName, workers, setupPaid }) {
  const pkg = plan.packages.find((x) => x.name === packageName);
  if (!pkg) return null;
  const setupFee = setupPaid ? 0 : pkg.setupFee;
  const subtotal = pkg.monthlyPrice + setupFee;
  const vat = Math.round((subtotal * plan.vatPercent) / 100);
  const overCapacity = pkg.maxPeople != null && workers > pkg.maxPeople;
  return { packageName: pkg.name, workers, monthly: pkg.monthlyPrice, setupFee, subtotal, vat, total: subtotal + vat, maxPeople: pkg.maxPeople, overCapacity };
}

// exempt: Frankiecode's own accounts or a workplace with billing waived. free: no packages made yet, nothing is charged.
// trial / active: fine. grace: overdue but still working. overdue: admin features lock, but only when billing is enforced.
export function billingState({ plan, billing, createdAt, now = new Date(), enforced = false, exempt = false }) {
  if (exempt || billing?.exempt) return { status: 'exempt', locked: false };
  if (!plan?.packages?.length) return { status: 'free', locked: false };
  const paidUntil = billing?.paidUntil ? new Date(billing.paidUntil) : null;
  if (paidUntil && paidUntil > now) return { status: 'active', locked: false, until: paidUntil, daysLeft: Math.ceil((paidUntil - now) / DAY) };
  const trialEnds = trialEndDate({ billing, createdAt, plan });
  if ((!paidUntil || billing?.trialEndsAt) && now < trialEnds) return { status: 'trial', locked: false, until: trialEnds, daysLeft: Math.ceil((trialEnds - now) / DAY) };
  const since = paidUntil && paidUntil > trialEnds ? paidUntil : trialEnds;
  if (now - since <= GRACE_DAYS * DAY) return { status: 'grace', locked: false, until: new Date(since.getTime() + GRACE_DAYS * DAY) };
  return { status: 'overdue', locked: !!enforced, since };
}

// The trial normally lasts trialDays from sign-up. A platform admin can extend it, which is stored as an explicit end date.
export const trialEndDate = ({ billing, createdAt, plan }) =>
  billing?.trialEndsAt ? new Date(billing.trialEndsAt) : new Date(new Date(createdAt).getTime() + (plan?.trialDays ?? 0) * DAY);

// Adding days starts from the end of the current trial, or from today if the trial is already over.
export function extendTrial({ current, days, now = new Date() }) {
  const start = current && new Date(current) > now ? new Date(current) : now;
  return new Date(start.getTime() + days * DAY);
}

// A payment extends from the end of the current period if still running, otherwise from today.
export function extendPaidUntil(paidUntil, now = new Date()) {
  const start = paidUntil && new Date(paidUntil) > now ? new Date(paidUntil) : now;
  return new Date(start.getTime() + PERIOD_DAYS * DAY);
}

// Paystack signs the raw request body with the secret key (HMAC SHA-512, hex) in the x-paystack-signature header.
export function paystackSignatureOk(rawBody, header, secret) {
  if (!rawBody || !header || !secret) return false;
  const want = Buffer.from(crypto.createHmac('sha512', secret).update(rawBody).digest('hex'));
  const got = Buffer.from(String(header));
  return want.length === got.length && crypto.timingSafeEqual(want, got);
}

// The paid transaction must be for exactly what we asked for, in naira, and be marked successful.
export const transactionMatches = (payment, tx) =>
  tx?.status === 'success' && String(tx.currency).toUpperCase() === 'NGN' && Number(tx.amount) === payment.amount && tx.reference === payment.reference;
