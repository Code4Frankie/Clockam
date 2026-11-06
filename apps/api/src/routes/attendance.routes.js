import { Router } from 'express';
import { z } from 'zod';
import { Attendance } from '../models/Attendance.js';
import { Organization } from '../models/Organization.js';
import { User } from '../models/User.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { clockUser } from '../services/clock.service.js';
import { localParts } from '../utils/time.js';
import { asyncHandler, HttpError } from '../utils/http.js';

const router = Router();
router.use(requireAuth);

// Used by the mobile app after the phone's own biometric prompt succeeds.
router.post(
  '/clock',
  validate(z.object({ location: z.object({ lat: z.number(), lng: z.number() }).optional() })),
  asyncHandler(async (req, res) => {
    const org = await Organization.findById(req.user.organization);
    const result = await clockUser({ user: req.user, org, method: 'device-biometric', location: req.body.location });
    res.json(result);
  })
);

router.get(
  '/me',
  asyncHandler(async (req, res) => {
    const records = await Attendance.find({ user: req.user._id }).sort({ date: -1 }).limit(60);
    res.json(records);
  })
);

const rangeFilter = (req) => {
  const filter = { organization: req.user.organization };
  const { from, to, userId } = req.query;
  if (from || to) filter.date = { ...(from && { $gte: from }), ...(to && { $lte: to }) };
  if (userId) filter.user = userId;
  return filter;
};

router.get(
  '/',
  requireRole('owner', 'admin', 'manager'),
  asyncHandler(async (req, res) => {
    const records = await Attendance.find(rangeFilter(req))
      .populate('user', 'name staffId department')
      .sort({ date: -1, clockIn: -1 })
      .limit(1000);
    res.json(records);
  })
);

// Dashboard numbers for today.
router.get(
  '/today',
  requireRole('owner', 'admin', 'manager'),
  asyncHandler(async (req, res) => {
    const org = await Organization.findById(req.user.organization);
    const { dateKey } = localParts(new Date(), org.timezone);
    const [records, totalStaff] = await Promise.all([
      Attendance.find({ organization: org._id, date: dateKey }).populate('user', 'name staffId department').sort({ clockIn: -1 }),
      User.countDocuments({ organization: org._id, active: true, role: { $ne: 'owner' } }),
    ]);
    const present = records.length;
    const late = records.filter((r) => r.status === 'late').length;
    res.json({ date: dateKey, totalStaff, present, late, absent: Math.max(totalStaff - present, 0), records });
  })
);

// Manual correction by an admin (e.g. forgot to clock out, scanner offline).
router.post(
  '/manual',
  requireRole('owner', 'admin'),
  validate(
    z.object({
      userId: z.string(),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      clockIn: z.coerce.date(),
      clockOut: z.coerce.date().optional(),
      status: z.enum(['present', 'late', 'leave', 'absent']).default('present'),
      note: z.string().optional(),
    })
  ),
  asyncHandler(async (req, res) => {
    const user = await User.findOne({ _id: req.body.userId, organization: req.user.organization });
    if (!user) throw new HttpError(404, 'Employee not found');
    const { clockIn, clockOut } = req.body;
    const record = await Attendance.findOneAndUpdate(
      { user: user._id, date: req.body.date },
      {
        organization: req.user.organization,
        user: user._id,
        date: req.body.date,
        clockIn,
        clockOut,
        status: req.body.status,
        method: 'manual',
        clockOutMethod: clockOut ? 'manual' : undefined,
        minutesWorked: clockOut ? Math.round((clockOut - clockIn) / 60000) : 0,
        note: req.body.note,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    res.status(201).json(record);
  })
);

export default router;
