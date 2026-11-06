import { Router } from 'express';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { Device } from '../models/Device.js';
import { User } from '../models/User.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler, HttpError } from '../utils/http.js';

const router = Router();
router.use(requireAuth, requireRole('owner', 'admin'));

router.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json(await Device.find({ organization: req.user.organization }).sort({ createdAt: -1 }));
  })
);

// Registers a kiosk/scanner. The API key is shown ONCE; only its hash is stored.
router.post(
  '/',
  validate(z.object({ name: z.string().min(2), type: z.enum(['scanner', 'kiosk']).default('scanner') })),
  asyncHandler(async (req, res) => {
    const apiKey = crypto.randomBytes(24).toString('base64url');
    const device = await Device.create({
      organization: req.user.organization,
      name: req.body.name,
      type: req.body.type,
      apiKeyHash: await bcrypt.hash(apiKey, 10),
    });
    res.status(201).json({ id: device._id, name: device.name, apiKey });
  })
);

router.patch(
  '/:id',
  validate(z.object({ active: z.boolean() })),
  asyncHandler(async (req, res) => {
    const device = await Device.findOneAndUpdate(
      { _id: req.params.id, organization: req.user.organization },
      { active: req.body.active },
      { new: true }
    );
    if (!device) throw new HttpError(404, 'Device not found');
    res.json(device);
  })
);

// Links an employee to the ID that a hardware scanner assigned when they enrolled on it.
router.post(
  '/:id/link-employee',
  validate(z.object({ userId: z.string(), scannerUserId: z.string().min(1) })),
  asyncHandler(async (req, res) => {
    const device = await Device.findOne({ _id: req.params.id, organization: req.user.organization });
    if (!device) throw new HttpError(404, 'Device not found');
    const user = await User.findOne({ _id: req.body.userId, organization: req.user.organization });
    if (!user) throw new HttpError(404, 'Employee not found');

    user.scannerLinks = user.scannerLinks.filter((l) => String(l.device) !== String(device._id));
    user.scannerLinks.push({ device: device._id, scannerUserId: req.body.scannerUserId });
    await user.save();
    res.json({ message: 'Employee linked to scanner ID' });
  })
);

export default router;
