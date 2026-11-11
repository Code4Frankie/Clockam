import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { planSchema, pickTier, computeCharge, billingState, extendPaidUntil, paystackSignatureOk, transactionMatches, GRACE_DAYS } from '../src/utils/billing.js';

const plan = {
  setupFee: 5000000, vatPercent: 7.5, trialDays: 14,
  tiers: [
    { name: 'Small', minWorkers: 1, maxWorkers: 20, monthlyPrice: 1000000 },
    { name: 'Medium', minWorkers: 21, maxWorkers: 100, monthlyPrice: 3000000 },
    { name: 'Large', minWorkers: 101, maxWorkers: null, monthlyPrice: 8000000 },
  ],
};
const D = 24 * 3600 * 1000;

test('a plan with contiguous ranges is accepted', () => {
  assert.ok(planSchema.safeParse(plan).success);
  assert.ok(planSchema.safeParse({ ...plan, tiers: [] }).success, 'no tiers = billing off');
});

test('gaps, overlaps, bad starts and duplicate names are refused with a clear message', () => {
  const t = (tiers) => planSchema.safeParse({ ...plan, tiers });
  const msg = (r) => r.error.issues[0].message;
  assert.match(msg(t([{ name: 'A', minWorkers: 2, maxWorkers: null, monthlyPrice: 1 }])), /start at 1/);
  assert.match(msg(t([{ name: 'A', minWorkers: 1, maxWorkers: 10, monthlyPrice: 1 }, { name: 'B', minWorkers: 15, maxWorkers: null, monthlyPrice: 1 }])), /should start at 11/);
  assert.match(msg(t([{ name: 'A', minWorkers: 1, maxWorkers: 10, monthlyPrice: 1 }, { name: 'B', minWorkers: 8, maxWorkers: null, monthlyPrice: 1 }])), /should start at 11/);
  assert.match(msg(t([{ name: 'A', minWorkers: 1, maxWorkers: null, monthlyPrice: 1 }, { name: 'B', minWorkers: 5, maxWorkers: null, monthlyPrice: 1 }])), /last range/);
  assert.match(msg(t([{ name: 'A', minWorkers: 1, maxWorkers: 10, monthlyPrice: 1 }, { name: 'a', minWorkers: 11, maxWorkers: null, monthlyPrice: 1 }])), /different name/);
  assert.ok(!t([{ name: 'A', minWorkers: 5, maxWorkers: 2, monthlyPrice: 1 }]).success);
  assert.ok(!planSchema.safeParse({ ...plan, vatPercent: 120 }).success);
  assert.ok(!planSchema.safeParse({ ...plan, setupFee: 12.5 }).success, 'whole kobo only');
  assert.ok(!planSchema.safeParse({ ...plan, extra: 1 }).success);
});

test('the right range is picked at the edges', () => {
  assert.equal(pickTier(plan.tiers, 0).name, 'Small');
  assert.equal(pickTier(plan.tiers, 20).name, 'Small');
  assert.equal(pickTier(plan.tiers, 21).name, 'Medium');
  assert.equal(pickTier(plan.tiers, 5000).name, 'Large');
  assert.equal(pickTier([{ name: 'S', minWorkers: 1, maxWorkers: 10, monthlyPrice: 1 }], 11), null);
});

test('charge: first payment includes the setup fee once, VAT on the total', () => {
  const first = computeCharge({ plan, workers: 15, setupPaid: false });
  assert.deepEqual([first.monthly, first.setupFee, first.subtotal, first.vat, first.total], [1000000, 5000000, 6000000, 450000, 6450000]);
  const next = computeCharge({ plan, workers: 15, setupPaid: true });
  assert.equal(next.setupFee, 0);
  assert.equal(next.total, 1075000);
  assert.equal(computeCharge({ plan: { ...plan, vatPercent: 0 }, workers: 50, setupPaid: true }).total, 3000000);
  assert.equal(computeCharge({ plan: { ...plan, tiers: [] }, workers: 5, setupPaid: true }), null);
});

test('billing state: free, trial, active, grace, then locked only when enforced', () => {
  const created = new Date('2026-01-01T00:00:00Z');
  const at = (days) => new Date(created.getTime() + days * D);
  assert.equal(billingState({ plan: { ...plan, tiers: [] }, billing: {}, createdAt: created, now: at(400), enforced: true }).status, 'free');
  assert.equal(billingState({ plan, billing: {}, createdAt: created, now: at(3), enforced: true }).status, 'trial');
  assert.equal(billingState({ plan, billing: {}, createdAt: created, now: at(15), enforced: true }).status, 'grace');
  const late = billingState({ plan, billing: {}, createdAt: created, now: at(14 + GRACE_DAYS + 1), enforced: true });
  assert.deepEqual([late.status, late.locked], ['overdue', true]);
  assert.equal(billingState({ plan, billing: {}, createdAt: created, now: at(60), enforced: false }).locked, false, 'not enforced = never locked');
  const paid = { paidUntil: at(60) };
  assert.equal(billingState({ plan, billing: paid, createdAt: created, now: at(40), enforced: true }).status, 'active');
  assert.equal(billingState({ plan, billing: paid, createdAt: created, now: at(61), enforced: true }).status, 'grace');
  assert.equal(billingState({ plan, billing: paid, createdAt: created, now: at(70), enforced: true }).locked, true);
  assert.equal(billingState({ plan: { ...plan, trialDays: 0 }, billing: {}, createdAt: created, now: at(1), enforced: true }).status, 'grace');
});

test('a payment adds 30 days from the end of the current period, or from now if it already ended', () => {
  const now = new Date('2026-06-01T00:00:00Z');
  assert.equal(extendPaidUntil(null, now).getTime(), now.getTime() + 30 * D);
  assert.equal(extendPaidUntil(new Date(now.getTime() - 5 * D), now).getTime(), now.getTime() + 30 * D);
  assert.equal(extendPaidUntil(new Date(now.getTime() + 10 * D), now).getTime(), now.getTime() + 40 * D);
});

test('paystack signature must match the raw body and secret', () => {
  const raw = Buffer.from('{"event":"charge.success"}');
  const sig = crypto.createHmac('sha512', 'sk_test_x').update(raw).digest('hex');
  assert.ok(paystackSignatureOk(raw, sig, 'sk_test_x'));
  assert.ok(!paystackSignatureOk(raw, sig, 'other'));
  assert.ok(!paystackSignatureOk(Buffer.from('{"event":"x"}'), sig, 'sk_test_x'));
  assert.ok(!paystackSignatureOk(raw, 'abc', 'sk_test_x'));
  assert.ok(!paystackSignatureOk(raw, undefined, 'sk_test_x'));
  assert.ok(!paystackSignatureOk(undefined, sig, 'sk_test_x'));
  assert.ok(!paystackSignatureOk(raw, sig, ''));
});

test('a paid transaction must match amount, currency, reference and success', () => {
  const p = { amount: 6450000, reference: 'ca_1' };
  assert.ok(transactionMatches(p, { status: 'success', currency: 'NGN', amount: 6450000, reference: 'ca_1' }));
  assert.ok(!transactionMatches(p, { status: 'success', currency: 'NGN', amount: 100, reference: 'ca_1' }), 'underpaid');
  assert.ok(!transactionMatches(p, { status: 'failed', currency: 'NGN', amount: 6450000, reference: 'ca_1' }));
  assert.ok(!transactionMatches(p, { status: 'success', currency: 'USD', amount: 6450000, reference: 'ca_1' }));
  assert.ok(!transactionMatches(p, { status: 'success', currency: 'NGN', amount: 6450000, reference: 'ca_2' }));
  assert.ok(!transactionMatches(p, null));
});
