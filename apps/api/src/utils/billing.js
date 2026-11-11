import crypto from 'node:crypto';
import { z } from 'zod';

// All money is in kobo (1 naira = 100 kobo) as whole numbers, so there are no rounding surprises.
export const GRACE_DAYS = 3; // after the paid period ends, admin features keep working this long
export const PERIOD_DAYS = 30; // each payment buys 30 days
const DAY = 24 * 3600 * 1000;

const tierSchema = z.object({
  name: z.string().trim().min(1).max(40),
  minWorkers: z.number().int().min(1),
  maxWorkers: z.number().int().min(1).nullable(), // null = no upper limit
  monthlyPrice: z.number().int().min(0).max(1_000_000_000),
}).strict();

// The plan prices are set by Frankiecode in the app, never in code. Tiers must cover worker counts with no gaps or overlaps.
export const planSchema = z
  .object({
    setupFee: z.number().int().min(0).max(1_000_000_000),
    vatPercent: z.number().min(0).max(100),
    trialDays: z.number().int().min(0).max(90),
    tiers: z.array(tierSchema).max(12),
  })
  .strict()
  .superRefine((plan, ctx) => {
    const t = [...plan.tiers].sort((a, b) => a.minWorkers - b.minWorkers);
    const bad = (message) => ctx.addIssue({ code: 'custom', path: ['tiers'], message });
    t.forEach((x, i) => {
      if (x.maxWorkers !== null && x.maxWorkers < x.minWorkers) bad(`"${x.name}": the top of the range is below the bottom`);
      if (i === 0 && x.minWorkers !== 1) bad('The first range must start at 1 worker');
      if (i > 0) {
        const prev = t[i - 1];
        if (prev.maxWorkers === null) bad('Only the last range can have no upper limit');
        else if (x.minWorkers !== prev.maxWorkers + 1) bad(`Ranges must follow on from each other: "${x.name}" should start at ${prev.maxWorkers + 1}`);
      }
    });
    if (new Set(t.map((x) => x.name.toLowerCase())).size !== t.length) bad('Each range needs a different name');
  });

export function pickTier(tiers, workers) {
  const n = Math.max(1, workers);
  return [...tiers].sort((a, b) => a.minWorkers - b.minWorkers).find((t) => n >= t.minWorkers && (t.maxWorkers === null || n <= t.maxWorkers)) || null;
}

// What an organisation owes for its next period. The setup fee is charged once, with the first payment.
export function computeCharge({ plan, workers, setupPaid }) {
  const tier = pickTier(plan.tiers, workers);
  if (!tier) return null;
  const setupFee = setupPaid ? 0 : plan.setupFee;
  const subtotal = tier.monthlyPrice + setupFee;
  const vat = Math.round((subtotal * plan.vatPercent) / 100);
  return { tierName: tier.name, workers, monthly: tier.monthlyPrice, setupFee, subtotal, vat, total: subtotal + vat };
}

// free: no prices configured yet, nothing is charged. trial / active: fine. grace: overdue but still working. locked: admin features off.
export function billingState({ plan, billing, createdAt, now = new Date(), enforced = false }) {
  if (!plan?.tiers?.length) return { status: 'free', locked: false };
  const paidUntil = billing?.paidUntil ? new Date(billing.paidUntil) : null;
  if (paidUntil && paidUntil > now) return { status: 'active', locked: false, until: paidUntil, daysLeft: Math.ceil((paidUntil - now) / DAY) };
  const trialEnds = new Date(new Date(createdAt).getTime() + plan.trialDays * DAY);
  if (!paidUntil && now < trialEnds) return { status: 'trial', locked: false, until: trialEnds, daysLeft: Math.ceil((trialEnds - now) / DAY) };
  const since = paidUntil || trialEnds;
  if (now - since <= GRACE_DAYS * DAY) return { status: 'grace', locked: false, until: new Date(since.getTime() + GRACE_DAYS * DAY) };
  return { status: 'overdue', locked: !!enforced, since };
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
