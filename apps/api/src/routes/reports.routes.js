import { Router } from 'express';
import mongoose from 'mongoose';
import { Attendance } from '../models/Attendance.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { asyncHandler, HttpError } from '../utils/http.js';

const router = Router();
router.use(requireAuth, requireRole('owner', 'admin', 'manager'));

async function buildSummary(req) {
  const { from, to } = req.query;
  if (!from || !to) throw new HttpError(400, 'from and to (YYYY-MM-DD) are required');

  return Attendance.aggregate([
    { $match: { organization: new mongoose.Types.ObjectId(req.user.organization), date: { $gte: from, $lte: to } } },
    {
      $group: {
        _id: '$user',
        daysPresent: { $sum: 1 },
        daysLate: { $sum: { $cond: [{ $eq: ['$status', 'late'] }, 1, 0] } },
        minutesWorked: { $sum: '$minutesWorked' },
      },
    },
    { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
    { $unwind: '$user' },
    {
      $project: {
        _id: 0,
        userId: '$_id',
        name: '$user.name',
        staffId: '$user.staffId',
        department: '$user.department',
        daysPresent: 1,
        daysLate: 1,
        hoursWorked: { $round: [{ $divide: ['$minutesWorked', 60] }, 2] },
      },
    },
    { $sort: { name: 1 } },
  ]);
}

router.get(
  '/summary',
  asyncHandler(async (req, res) => {
    res.json(await buildSummary(req));
  })
);

const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

router.get(
  '/export.csv',
  asyncHandler(async (req, res) => {
    const rows = await buildSummary(req);
    const header = ['Name', 'Staff ID', 'Department', 'Days present', 'Days late', 'Hours worked'];
    const lines = rows.map((r) =>
      [r.name, r.staffId, r.department, r.daysPresent, r.daysLate, r.hoursWorked].map(csvCell).join(',')
    );
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="clockam-${req.query.from}_to_${req.query.to}.csv"`);
    res.send([header.map(csvCell).join(','), ...lines].join('\n'));
  })
);

export default router;
