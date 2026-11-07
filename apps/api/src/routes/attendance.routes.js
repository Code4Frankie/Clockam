import { Router } from 'express';
import { z } from 'zod';
import { Attendance } from '../models/Attendance.js';
import { Organization } from '../models/Organization.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { clockUser } from '../services/clock.service.js';
import { getAttendanceRange, getTodayOverview, applyManualCorrection } from '../services/attendance.service.js';
import { asyncHandler } from '../utils/http.js';

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

router.get(
  '/',
  requireRole('owner', 'admin', 'manager'),
  asyncHandler(async (req, res) => {
    const { from, to, userId } = req.query;
    res.json(await getAttendanceRange({ orgId: req.user.organization, from, to, userId }));
  })
);

// Dashboard numbers for today.
router.get(
  '/today',
  requireRole('owner', 'admin', 'manager'),
  asyncHandler(async (req, res) => {
    const org = await Organization.findById(req.user.organization);
    res.json(await getTodayOverview(org));
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
    const record = await applyManualCorrection({ orgId: req.user.organization, ...req.body });
    res.status(201).json(record);
  })
);

export default router;
