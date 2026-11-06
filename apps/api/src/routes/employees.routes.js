import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { User } from '../models/User.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler, HttpError } from '../utils/http.js';

const router = Router();
router.use(requireAuth, requireRole('owner', 'admin', 'manager'));

const createSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  staffId: z.string().min(1),
  phone: z.string().optional(),
  department: z.string().optional(),
  role: z.enum(['admin', 'manager', 'employee']).default('employee'),
  password: z.string().min(8),
});

const updateSchema = createSchema.partial().omit({ password: true }).extend({
  active: z.boolean().optional(),
});

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const employees = await User.find({ organization: req.user.organization })
      .select('-webauthnCredentials.publicKey')
      .sort({ name: 1 });
    res.json(employees);
  })
);

router.post(
  '/',
  requireRole('owner', 'admin'),
  validate(createSchema),
  asyncHandler(async (req, res) => {
    const { password, role, ...rest } = req.body;
    if (role === 'admin' && req.user.role !== 'owner') throw new HttpError(403, 'Only the owner can create admins');
    const user = await User.create({
      ...rest,
      role,
      organization: req.user.organization,
      passwordHash: await bcrypt.hash(password, 12),
    });
    res.status(201).json({ id: user._id, name: user.name, staffId: user.staffId });
  })
);

router.patch(
  '/:id',
  requireRole('owner', 'admin'),
  validate(updateSchema),
  asyncHandler(async (req, res) => {
    const user = await User.findOneAndUpdate(
      { _id: req.params.id, organization: req.user.organization },
      req.body,
      { new: true }
    );
    if (!user) throw new HttpError(404, 'Employee not found');
    res.json(user);
  })
);

// Removes all enrolled fingerprints (e.g. when a phone is lost or re-enrolment is needed).
router.delete(
  '/:id/fingerprints',
  requireRole('owner', 'admin'),
  asyncHandler(async (req, res) => {
    const user = await User.findOneAndUpdate(
      { _id: req.params.id, organization: req.user.organization },
      { webauthnCredentials: [], scannerLinks: [] },
      { new: true }
    );
    if (!user) throw new HttpError(404, 'Employee not found');
    res.json({ message: 'Fingerprints cleared' });
  })
);

export default router;
