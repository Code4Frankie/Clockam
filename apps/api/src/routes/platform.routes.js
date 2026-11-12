import { Router } from 'express';
import { env } from '../config/env.js';
import { Organization } from '../models/Organization.js';
import { User } from '../models/User.js';
import { Attendance } from '../models/Attendance.js';
import { ClassAttendance } from '../models/ClassAttendance.js';
import { requireAuth } from '../middleware/auth.js';
import { requirePlatformAdmin } from '../middleware/platformAdmin.js';
import { asyncHandler } from '../utils/http.js';
import { csvLine } from '../utils/csv.js';
import { getPlan } from '../services/billing.service.js';
import { buildRows, filterRows } from '../utils/workplaces.js';

const router = Router();
router.use(requireAuth, requirePlatformAdmin);

async function loadRows(q) {
  const orgs = await Organization.find().sort({ createdAt: -1 }).limit(2000).lean();
  const ids = orgs.map((o) => o._id);
  const [owners, people, lastIn, lastClass, plan] = await Promise.all([
    User.find({ organization: { $in: ids }, role: 'owner' }).sort({ createdAt: 1 }).select('organization name email').lean(),
    User.aggregate([{ $match: { organization: { $in: ids }, active: true, role: { $ne: 'owner' } } }, { $group: { _id: '$organization', n: { $sum: 1 } } }]),
    Attendance.aggregate([{ $match: { organization: { $in: ids } } }, { $group: { _id: '$organization', at: { $max: '$clockIn' } } }]),
    ClassAttendance.aggregate([{ $match: { organization: { $in: ids } } }, { $group: { _id: '$organization', at: { $max: '$at' } } }]),
    getPlan(),
  ]);
  const ownerBy = new Map();
  for (const u of owners) if (!ownerBy.has(String(u.organization))) ownerBy.set(String(u.organization), u); // earliest owner
  const rows = buildRows({
    orgs, owners: ownerBy,
    people: new Map(people.map((x) => [String(x._id), x.n])),
    lastClockIn: new Map(lastIn.map((x) => [String(x._id), x.at])),
    lastClass: new Map(lastClass.map((x) => [String(x._id), x.at])),
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
  const lines = [csvLine(['Workplace', 'Workplace ID', 'Type', 'Created', 'People', 'Last activity', 'Billing', 'Owner', 'Owner email']),
    ...rows.map((r) => csvLine([r.name, r.workplaceId, r.type, r.createdAt?.toISOString?.().slice(0, 10), r.people, r.lastActive?.toISOString?.().slice(0, 10) || '', r.billing, r.ownerName, r.ownerEmail]))];
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="workplaces.csv"');
  res.send(lines.join('\n'));
}));

export default router;
