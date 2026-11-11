import { Router } from 'express';
import { z } from 'zod';
import { Attendance } from '../models/Attendance.js';
import { Organization } from '../models/Organization.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { clockUser } from '../services/clock.service.js';
import { getAttendanceRange, getTodayOverview, applyManualCorrection, listMissingClockouts, fixMissingClockout, editAttendance, getDay } from '../services/attendance.service.js';
import { toggleBreak } from '../services/break.service.js';
import { billingGate } from '../middleware/billing.js';
import { autoClockOutSweep } from '../middleware/autoClockOut.js';
import { editDaySchema } from '../utils/attendanceEdit.js';
import { asyncHandler, HttpError } from '../utils/http.js';

const router = Router();
router.use(requireAuth, autoClockOutSweep);

// Used by the mobile app after the phone's own biometric prompt succeeds.
router.post(
  '/clock',
  validate(z.object({ location: z.object({ lat: z.number(), lng: z.number() }).optional() })),
  asyncHandler(async (req, res) => {
    const org = await Organization.findById(req.user.organization);
    const result = await clockUser({ user: req.user, org, method: 'device-biometric', location: req.body.location, ip: req.ip });
    res.json(result);
  })
);

// Start or end a break (mobile app, after the phone's own biometric prompt succeeds).
router.post(
  '/break',
  validate(z.object({ location: z.object({ lat: z.number(), lng: z.number() }).optional() })),
  asyncHandler(async (req, res) => {
    const org = await Organization.findById(req.user.organization);
    res.json(await toggleBreak({ user: req.user, org, method: 'device-biometric', location: req.body.location, ip: req.ip }));
  })
);

router.get(
  '/me',
  asyncHandler(async (req, res) => {
    const records = await Attendance.find({ user: req.user._id }).sort({ date: -1 }).limit(60);
    res.json(records);
  })
);

router.get(
  '/',
  requireRole('owner', 'admin', 'manager'), billingGate,
  asyncHandler(async (req, res) => {
    const { from, to, userId } = req.query;
    res.json(await getAttendanceRange({ orgId: req.user.organization, from, to, userId }));
  })
);

// Dashboard numbers for today.
router.get(
  '/today',
  requireRole('owner', 'admin', 'manager'), billingGate,
  asyncHandler(async (req, res) => {
    const org = await Organization.findById(req.user.organization);
    res.json(await getTodayOverview(org));
  })
);

// Manual correction by an admin (e.g. forgot to clock out, scanner offline).
router.post(
  '/manual',
  requireRole('owner', 'admin'), billingGate,
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
    const record = await applyManualCorrection({ orgId: req.user.organization, ...req.body, by: req.user.name });
    res.status(201).json(record);
  })
);

// Clock-ins a manager may want to look at (close to the edge of the allowed distance).
router.get(
  '/flagged',
  requireRole('owner', 'admin', 'manager'), billingGate,
  asyncHandler(async (req, res) => {
    const { from, to } = req.query;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(from)) || !/^\d{4}-\d{2}-\d{2}$/.test(String(to))) throw new HttpError(400, 'from and to (YYYY-MM-DD) are required');
    const rows = await Attendance.find({ organization: req.user.organization, date: { $gte: from, $lte: to }, 'flags.0': { $exists: true } })
      .populate('user', 'name staffId')
      .sort({ date: -1, clockIn: -1 })
      .limit(200);
    res.json(rows);
  })
);

// One person's day, for the Edit attendance screen.
router.get(
  '/day',
  requireRole('owner', 'admin'), billingGate,
  asyncHandler(async (req, res) => {
    const { userId, date } = req.query;
    if (!/^[a-f\d]{24}$/i.test(String(userId)) || !/^\d{4}-\d{2}-\d{2}$/.test(String(date))) throw new HttpError(400, 'userId and date are required');
    const org = await Organization.findById(req.user.organization);
    res.json(await getDay({ org, userId, date }));
  })
);

// Admin changes or adds a day's clock-in and clock-out. Reason required; history is kept.
router.post(
  '/edit',
  requireRole('owner', 'admin'), billingGate,
  validate(editDaySchema),
  asyncHandler(async (req, res) => {
    const org = await Organization.findById(req.user.organization);
    res.json(await editAttendance({ org, actor: req.user, userId: req.body.userId, date: req.body.date, clockInTime: req.body.clockIn, clockOutTime: req.body.clockOut || undefined, reason: req.body.reason }));
  })
);

// Days where someone clocked in and never clocked out, with a suggested closing-time clock-out.
router.get(
  '/missing-clockouts',
  requireRole('owner', 'admin'), billingGate,
  asyncHandler(async (req, res) => {
    const org = await Organization.findById(req.user.organization);
    res.json({ timezone: org.timezone, rows: await listMissingClockouts(org) });
  })
);

// Sets the clock-out for one of those days. `time` is local workplace time, like 17:00.
router.post(
  '/fix-clockout',
  requireRole('owner', 'admin'), billingGate,
  validate(
    z
      .object({
        userId: z.string().regex(/^[a-f\d]{24}$/i),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use 24-hour time like 17:00'),
      })
      .strict()
  ),
  asyncHandler(async (req, res) => {
    const org = await Organization.findById(req.user.organization);
    res.json(await fixMissingClockout({ org, userId: req.body.userId, date: req.body.date, time: req.body.time, by: req.user.name }));
  })
);

export default router;
