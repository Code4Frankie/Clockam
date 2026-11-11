import { Router } from 'express';
import { Organization } from '../models/Organization.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler, HttpError } from '../utils/http.js';
import { normalizeIp } from '../utils/network.js';
import { settingsSchema, mergeSettings, checkMerged } from '../utils/orgSettings.js';

const router = Router();
router.use(requireAuth);

// The public address this server sees for you. An admin on the workplace Wi-Fi uses it to fill in "allowed networks".
router.get('/my-ip', requireRole('owner', 'admin'), (req, res) => res.json({ ip: normalizeIp(req.ip) }));

// Work hours and location rules. New rules apply to future clock-ins only; saved records are not rewritten.
router.patch(
  '/settings',
  requireRole('owner', 'admin'),
  validate(settingsSchema),
  asyncHandler(async (req, res) => {
    const org = await Organization.findById(req.user.organization);
    if (!org) throw new HttpError(404, 'Workplace not found');
    const merged = mergeSettings(org.toObject(), req.body);
    const problem = checkMerged(merged);
    if (problem) throw new HttpError(400, problem);
    org.set(merged);
    await org.save();
    res.json({ organization: org });
  })
);

export default router;
