import test from 'node:test';
import { buildRows, filterRows } from '../src/utils/workplaces.js';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { planSchema, computeCharge, billingState, extendPaidUntil, extendTrial, trialEndDate, paystackSignatureOk, transactionMatches, GRACE_DAYS } from '../src/utils/billing.js';

const plan = {
  vatPercent: 7.5, trialDays: 14,
  packages: [
    { name: 'Starter', description: '', monthlyPrice: 1000000, setupFee: 5000000, maxPeople: 20 },
    { name: 'Business', description: 'Most workplaces', monthlyPrice: 3000000, setupFee: 0, maxPeople: null },
  ],
};
const D = 24 * 3600 * 1000;

test('packages are accepted; duplicate names, bad money and unknown fields are refused', () => {
  assert.ok(planSchema.safeParse(plan).success);
  assert.ok(planSchema.safeParse({ ...plan, packages: [] }).success, 'no packages = billing off');
  const dup = planSchema.safeParse({ ...plan, packages: [plan.packages[0], { ...plan.packages[1], name: 'starter' }] });
  assert.match(dup.error.issues[0].message, /different name/);
  assert.ok(!planSchema.safeParse({ ...plan, vatPercent: 120 }).success);
  assert.ok(!planSchema.safeParse({ ...plan, packages: [{ ...plan.packages[0], monthlyPrice: 12.5 }] }).success, 'whole kobo only');
  assert.ok(!planSchema.safeParse({ ...plan, setupFee: 1 }).success, 'no global setup fee any more');
  assert.ok(!planSchema.safeParse({ ...plan, packages: [{ ...plan.packages[0], maxPeople: 0 }] }).success);
});

test('charge shows only the subscribed package; its own setup fee once; VAT on the total', () => {
  const first = computeCharge({ plan, packageName: 'Starter', workers: 15, setupPaid: false });
  assert.deepEqual([first.packageName, first.monthly, first.setupFee, first.subtotal, first.vat, first.total], ['Starter', 1000000, 5000000, 6000000, 450000, 6450000]);
  assert.equal(computeCharge({ plan, packageName: 'Starter', workers: 15, setupPaid: true }).total, 1075000);
  const biz = computeCharge({ plan, packageName: 'Business', workers: 500, setupPaid: false });
  assert.equal(biz.setupFee, 0, 'a package with no setup fee charges none');
  assert.equal(biz.total, 3225000);
  assert.equal(computeCharge({ plan, packageName: null, workers: 5, setupPaid: false }), null, 'no subscription, no charge');
  assert.equal(computeCharge({ plan, packageName: 'Gone', workers: 5, setupPaid: false }), null);
  assert.equal(computeCharge({ plan, packageName: 'Starter', workers: 21, setupPaid: true }).overCapacity, true);
  assert.equal(computeCharge({ plan, packageName: 'Starter', workers: 20, setupPaid: true }).overCapacity, false);
});

test('billing state: free, trial, active, grace, then locked only when enforced', () => {
  const created = new Date('2026-01-01T00:00:00Z');
  const at = (days) => new Date(created.getTime() + days * D);
  assert.equal(billingState({ plan: { ...plan, packages: [] }, billing: {}, createdAt: created, now: at(400), enforced: true }).status, 'free');
  assert.equal(billingState({ plan, billing: {}, createdAt: created, now: at(3), enforced: true }).status, 'trial');
  assert.equal(billingState({ plan, billing: {}, createdAt: created, now: at(15), enforced: true }).status, 'grace');
  const late = billingState({ plan, billing: {}, createdAt: created, now: at(14 + GRACE_DAYS + 1), enforced: true });
  assert.deepEqual([late.status, late.locked], ['overdue', true]);
  assert.equal(billingState({ plan, billing: {}, createdAt: created, now: at(60), enforced: false }).locked, false, 'not enforced = never locked');
  const paid = { paidUntil: at(60) };
  assert.equal(billingState({ plan, billing: paid, createdAt: created, now: at(40), enforced: true }).status, 'active');
  assert.equal(billingState({ plan, billing: paid, createdAt: created, now: at(61), enforced: true }).status, 'grace');
  assert.equal(billingState({ plan, billing: paid, createdAt: created, now: at(70), enforced: true }).locked, true);
});

test('platform admins can extend a trial, and exempt workplaces are never locked', () => {
  const created = new Date('2026-01-01T00:00:00Z');
  const at = (days) => new Date(created.getTime() + days * D);
  // trial ended on day 14; extend by 10 days on day 20 -> runs to day 30
  const ext = extendTrial({ current: trialEndDate({ billing: {}, createdAt: created, plan }), days: 10, now: at(20) });
  assert.equal(ext.getTime(), at(30).getTime());
  // extending a trial that is still running adds to its end
  assert.equal(extendTrial({ current: at(14), days: 7, now: at(5) }).getTime(), at(21).getTime());
  const billing = { trialEndsAt: ext };
  assert.equal(billingState({ plan, billing, createdAt: created, now: at(25), enforced: true }).status, 'trial');
  assert.equal(billingState({ plan, billing, createdAt: created, now: at(25), enforced: true }).daysLeft, 5);
  assert.equal(billingState({ plan, billing: {}, createdAt: created, now: at(400), enforced: true, exempt: true }).status, 'exempt');
  assert.equal(billingState({ plan, billing: { exempt: true }, createdAt: created, now: at(400), enforced: true }).locked, false);
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



test('workplace list: owner, people, last activity and billing per workplace; search works', () => {
  const orgs = [
    { _id: 'a', name: 'Acme Ltd', slug: 'acme', type: 'workplace', createdAt: new Date('2026-11-01') },
    { _id: 'b', name: 'Test School', slug: 'test-school', type: 'school', createdAt: new Date('2026-11-05') },
  ];
  const rows = buildRows({
    orgs,
    owners: new Map([['a', { name: 'Ada Obi', email: 'ada@acme.ng' }]]),
    staff: new Map([['a', 12]]),
    students: new Map([['b', 300]]),
    lastTier: new Map([['a', 'SmallBiz']]),
    lastClockIn: new Map([['a', new Date('2026-11-08')]]),
    lastClass: new Map([['a', new Date('2026-11-10')], ['b', new Date('2026-11-06')]]),
    plan: { vatPercent: 0, trialDays: 14, packages: [] },
    enforced: false, now: new Date('2026-11-11'),
  });
  assert.equal(rows[0].lastActive.toISOString().slice(0, 10), '2026-11-10', 'latest of clock-in and class');
  assert.equal(rows[0].staff, 12);
  assert.equal(rows[1].students, 300);
  assert.equal(rows[0].package.tierName, 'SmallBiz');
  assert.equal(rows[0].suspended, false);
  assert.equal(rows[0].ownerEmail, 'ada@acme.ng');
  assert.equal(rows[1].ownerEmail, '', 'no owner found is blank, not a crash');
  assert.equal(rows[1].staff, 0);
  assert.equal(rows[1].package.status, 'free');
  assert.equal(filterRows(rows, 'ADA@').length, 1);
  assert.equal(filterRows(rows, 'school')[0].workplaceId, 'test-school');
  assert.equal(filterRows(rows, '').length, 2);
  assert.equal(buildRows({ orgs: [{ _id: 'z', name: 'N', slug: 'n', createdAt: new Date() }], owners: new Map(), staff: new Map(), students: new Map(), lastTier: new Map(), lastClockIn: new Map(), lastClass: new Map(), plan: { packages: [] }, enforced: false })[0].lastActive, null);
});

import { orgIsSuspended, SUSPENDED_MESSAGE } from '../src/utils/suspension.js';

test('suspension and trial show in the workplace list', () => {
  assert.ok(orgIsSuspended({ suspended: { at: new Date() } }));
  assert.ok(!orgIsSuspended({}));
  assert.ok(!orgIsSuspended(null));
  assert.match(SUSPENDED_MESSAGE, /suspended/);
  const plan2 = { vatPercent: 0, trialDays: 14, packages: [{ name: 'S', description: '', monthlyPrice: 1, setupFee: 0, maxPeople: null }] };
  const now = new Date('2026-11-12');
  const [trial, sus] = buildRows({
    orgs: [{ _id: 'a', name: 'A', slug: 'a', createdAt: new Date('2026-11-11') }, { _id: 'b', name: 'B', slug: 'b', createdAt: new Date('2026-01-01'), suspended: { at: new Date('2026-11-01'), reason: 'Abuse' } }],
    owners: new Map(), staff: new Map(), students: new Map(), lastTier: new Map(), lastClockIn: new Map(), lastClass: new Map(), plan: plan2, enforced: false, now,
  });
  assert.equal(trial.package.status, 'trial');
  assert.equal(trial.package.daysLeft, 13);
  assert.equal(trial.package.trialDays, 14);
  assert.equal(sus.suspended, true);
  assert.equal(sus.suspendedReason, 'Abuse');
});

test('the list shows the subscribed package and marks waived workplaces', () => {
  const [a, b] = buildRows({
    orgs: [{ _id: 'a', name: 'A', slug: 'a', createdAt: new Date('2026-01-01'), billing: { packageName: 'Business' } }, { _id: 'b', name: 'B', slug: 'b', createdAt: new Date('2026-01-01') }],
    owners: new Map(), staff: new Map(), students: new Map(), lastTier: new Map([['a', 'Old']]), lastClockIn: new Map(), lastClass: new Map(),
    exemptIds: new Set(['b']), plan, enforced: true, now: new Date('2026-11-12'),
  });
  assert.equal(a.package.tierName, 'Business');
  assert.equal(b.package.status, 'exempt');
});
