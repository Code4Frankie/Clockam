import { Router } from 'express';
import { env } from '../config/env.js';
import { Organization } from '../models/Organization.js';
import { User } from '../models/User.js';
import { Attendance } from '../models/Attendance.js';
import { ClassAttendance } from '../models/ClassAttendance.js';
import { z } from 'zod';
import { Payment } from '../models/Payment.js';
import { validate } from '../middleware/validate.js';
import { clearSuspensionCache } from '../services/suspension.service.js';
import { HttpError } from '../utils/http.js';
import { requireAuth } from '../middleware/auth.js';
import { requirePlatformAdmin } from '../middleware/platformAdmin.js';
import { asyncHandler } from '../utils/http.js';
import mongoose from 'mongoose';
import { csvLine } from '../utils/csv.js';
import { billingSummary, getPlan } from '../services/billing.service.js';
import { extendTrial, trialEndDate } from '../utils/billing.js';
import { buildRows, filterRows } from '../utils/workplaces.js';

const router = Router();
router.use(requireAuth, requirePlatformAdmin);

async function loadRows(q) {
  const orgs = await Organization.find().sort({ createdAt: -1 }).limit(2000).lean();
  const ids = orgs.map((o) => o._id);
  const count = (role) => User.aggregate([{ $match: { organization: { $in: ids }, active: true, role } }, { $group: { _id: '$organization', n: { $sum: 1 } } }]);
  const [owners, staff, students, lastIn, lastClass, paid, plan] = await Promise.all([
    User.find({ organization: { $in: ids }, role: 'owner' }).sort({ createdAt: 1 }).select('organization name email').lean(),
    count({ $nin: ['owner', 'student'] }),
    count('student'),
    Attendance.aggregate([{ $match: { organization: { $in: ids } } }, { $group: { _id: '$organization', at: { $max: '$clockIn' } } }]),
    ClassAttendance.aggregate([{ $match: { organization: { $in: ids } } }, { $group: { _id: '$organization', at: { $max: '$at' } } }]),
    Payment.aggregate([{ $match: { organization: { $in: ids }, status: 'success' } }, { $sort: { paidAt: 1 } }, { $group: { _id: '$organization', tier: { $last: '$breakdown.tierName' } } }]),
    getPlan(),
  ]);
  const ownerBy = new Map();
  for (const u of owners) if (!ownerBy.has(String(u.organization))) ownerBy.set(String(u.organization), u); // earliest owner
  const adminOrgs = new Set((await User.find({ _id: { $in: env.platformAdminIds.filter((x) => mongoose.isValidObjectId(x)) } }).select('organization').lean()).map((u) => String(u.organization)));
  const rows = buildRows({
    orgs, owners: ownerBy,
    staff: new Map(staff.map((x) => [String(x._id), x.n])),
    students: new Map(students.map((x) => [String(x._id), x.n])),
    lastTier: new Map(paid.map((x) => [String(x._id), x.tier])),
    lastClockIn: new Map(lastIn.map((x) => [String(x._id), x.at])),
    lastClass: new Map(lastClass.map((x) => [String(x._id), x.at])),
    exemptIds: new Set(orgs.filter((o) => adminOrgs.has(String(o._id))).map((o) => String(o._id))),
    plan, enforced: env.billingEnforced,
  });
  return filterRows(rows, q);
}

router.get('/workplaces', asyncHandler(async (req, res) => {
  const rows = await loadRows(req.query.q);
  res.json({ total: rows.length, rows });
}));

router.get('/workplaces.csv', asyncHandler(async (req, res) => {
  const rows = await loadRows(req.query.q);
  const lines = [csvLine(['Workplace', 'Workplace ID', 'Type', 'Created', 'Staff', 'Students', 'Last activity', 'Package', 'Status', 'Owner', 'Owner email']),
    ...rows.map((r) => csvLine([r.name, r.workplaceId, r.type, r.createdAt?.toISOString?.().slice(0, 10), r.staff, r.students, r.lastActive?.toISOString?.().slice(0, 10) || '', [r.package.status, r.package.tierName].filter(Boolean).join(' '), r.suspended ? 'Suspended' : 'Active', r.ownerName, r.ownerEmail]))];
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="workplaces.csv"');
  res.send(lines.join('\n'));
}));

// Suspend or reinstate a workplace. Suspended workplaces cannot sign in or clock in. Data is kept.
const suspendSchema = z.object({ reason: z.string().trim().min(3).max(200) }).strict();
async function targetOrg(req) {
  const org = mongoose.isValidObjectId(req.params.id) && (await Organization.findById(req.params.id));
  if (!org) throw new HttpError(404, 'Workplace not found');
  return org;
}

// One workplace's billing view, as its owner would see it, with what a platform admin can change.
async function workplaceBilling(org) {
  const s = await billingSummary(org);
  const payments = await Payment.find({ organization: org._id, status: 'success' }).sort({ paidAt: -1 }).limit(20);
  const trialEnds = trialEndDate({ billing: org.billing, createdAt: org.createdAt, plan: s.plan });
  return {
    id: org._id, name: org.name, workplaceId: org.slug, type: org.type || 'workplace', createdAt: org.createdAt,
    suspended: !!org.suspended?.at, suspendedReason: org.suspended?.reason || '',
    ...s, trialEnds, paidUntil: org.billing?.paidUntil || null, billingWaived: !!org.billing?.exempt,
    payments: payments.map((p) => ({ reference: p.reference, amount: p.amount, paidAt: p.paidAt, tierName: p.breakdown?.tierName })),
  };
}

router.get('/workplaces/:id', asyncHandler(async (req, res) => res.json(await workplaceBilling(await targetOrg(req)))));

router.post('/workplaces/:id/extend-trial', validate(z.object({ days: z.number().int().min(1).max(365) }).strict()), asyncHandler(async (req, res) => {
  const org = await targetOrg(req);
  const plan = await getPlan();
  const current = trialEndDate({ billing: org.billing, createdAt: org.createdAt, plan });
  org.set('billing.trialEndsAt', extendTrial({ current, days: req.body.days }));
  await org.save();
  res.json(await workplaceBilling(org));
}));

router.post('/workplaces/:id/package', validate(z.object({ packageName: z.string().trim().min(1).max(40).nullable() }).strict()), asyncHandler(async (req, res) => {
  const org = await targetOrg(req);
  const { packageName } = req.body;
  if (packageName && !(await getPlan()).packages.some((x) => x.name === packageName)) throw new HttpError(400, 'That package does not exist');
  org.set('billing.packageName', packageName || undefined);
  await org.save();
  res.json(await workplaceBilling(org));
}));

router.post('/workplaces/:id/billing-exempt', validate(z.object({ exempt: z.boolean() }).strict()), asyncHandler(async (req, res) => {
  const org = await targetOrg(req);
  org.set('billing.exempt', req.body.exempt);
  await org.save();
  res.json(await workplaceBilling(org));
}));

router.post('/workplaces/:id/suspend', validate(suspendSchema), asyncHandler(async (req, res) => {
  const org = await targetOrg(req);
  if (String(org._id) === String(req.user.organization)) throw new HttpError(400, 'You cannot suspend your own workplace');
  org.suspended = { at: new Date(), by: req.user._id, reason: req.body.reason };
  await org.save();
  clearSuspensionCache();
  res.json({ id: org._id, suspended: true });
}));

router.post('/workplaces/:id/reinstate', asyncHandler(async (req, res) => {
  const org = await targetOrg(req);
  org.suspended = undefined;
  await org.save();
  clearSuspensionCache();
  res.json({ id: org._id, suspended: false });
}));

export default router;
