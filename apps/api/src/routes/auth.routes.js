import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { Organization } from '../models/Organization.js';
import { User } from '../models/User.js';
import { signToken, requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler, HttpError } from '../utils/http.js';

const router = Router();

const slugify = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

const publicUser = (u) => ({
  id: u._id,
  name: u.name,
  email: u.email,
  staffId: u.staffId,
  role: u.role,
  organization: u.organization,
  hasFingerprint: (u.webauthnCredentials?.length || 0) > 0,
});

const registerOrgSchema = z.object({
  organizationName: z.string().min(2),
  timezone: z.string().default('Africa/Lagos'),
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
});

// Creates a new workplace and its owner account.
router.post(
  '/register-org',
  validate(registerOrgSchema),
  asyncHandler(async (req, res) => {
    const { organizationName, timezone, name, email, password } = req.body;
    let slug = slugify(organizationName);
    if (await Organization.exists({ slug })) slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;

    const org = await Organization.create({ name: organizationName, slug, timezone });
    const user = await User.create({
      organization: org._id,
      name,
      email,
      staffId: 'OWNER-001',
      role: 'owner',
      passwordHash: await bcrypt.hash(password, 12),
    });
    res.status(201).json({ token: signToken(user), user: publicUser(user), organization: org });
  })
);

const loginSchema = z.object({
  orgSlug: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(1),
});

router.post(
  '/login',
  validate(loginSchema),
  asyncHandler(async (req, res) => {
    const { orgSlug, email, password } = req.body;
    const org = await Organization.findOne({ slug: orgSlug.toLowerCase() });
    const user = org && (await User.findOne({ organization: org._id, email }).select('+passwordHash'));
    if (!user || !user.active || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new HttpError(401, 'Invalid workplace, email or password');
    }
    res.json({ token: signToken(user), user: publicUser(user), organization: org });
  })
);

router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const organization = await Organization.findById(req.user.organization);
    res.json({ user: publicUser(req.user), organization });
  })
);

export default router;
