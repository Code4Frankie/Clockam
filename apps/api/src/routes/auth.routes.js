import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { Organization } from '../models/Organization.js';
import { User } from '../models/User.js';
import { signToken, requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler, HttpError } from '../utils/http.js';
import { env } from '../config/env.js';
import { PasswordReset } from '../models/PasswordReset.js';
import { hashToken, newResetToken, resetEmail, workplaceIdEmail, resetExpiry, RESET_MINUTES } from '../utils/passwordReset.js';
import { mailConfigured, sendMail } from '../utils/mailer.js';
import { isPlatformAdmin } from '../middleware/platformAdmin.js';

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
  isPlatformAdmin: isPlatformAdmin(u),
});

const registerOrgSchema = z.object({
  organizationName: z.string().min(2),
  timezone: z.string().default('Africa/Lagos'),
  type: z.enum(['workplace', 'school', 'government']).default('workplace'),
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
});

// Creates a new workplace and its owner account.
router.post(
  '/register-org',
  validate(registerOrgSchema),
  asyncHandler(async (req, res) => {
    const { organizationName, timezone, type, name, email, password } = req.body;
    let slug = slugify(organizationName);
    if (await Organization.exists({ slug })) slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;

    const org = await Organization.create({ name: organizationName, slug, timezone, type });
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
    if (!user || !user.active || user.role === 'student' || !(await bcrypt.compare(password, user.passwordHash))) {
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

const resetLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 8, standardHeaders: true, legacyHeaders: false });

// Step 1: ask for a reset link. The answer never says whether the workplace or email exists.
router.post(
  '/forgot-password',
  resetLimiter,
  validate(z.object({ orgSlug: z.string().min(1), email: z.string().email() })),
  asyncHandler(async (req, res) => {
    if (!mailConfigured(env.mail)) {
      throw new HttpError(503, 'Password reset by email is not set up yet. Ask your workplace admin to set a new password for you.');
    }
    const org = await Organization.findOne({ slug: req.body.orgSlug.toLowerCase() });
    const user = org && (await User.findOne({ organization: org._id, email: req.body.email.toLowerCase(), active: true }));
    if (user) {
      await PasswordReset.deleteMany({ user: user._id });
      const { token, hash } = newResetToken();
      await PasswordReset.create({ user: user._id, tokenHash: hash, expiresAt: resetExpiry() });
      const link = `${env.webAppUrl}/reset-password?token=${token}`;
      try {
        await sendMail(env.mail, { to: user.email, ...resetEmail({ name: user.name, link, minutes: RESET_MINUTES }) });
      } catch (e) {
        console.error('Password reset email failed:', e.message);
      }
    }
    res.json({ message: 'If that workplace and email exist, we have sent a reset link. It expires in 30 minutes.' });
  })
);

// Forgot the Workplace ID: we email it to the address. The answer is the same whether or not the address is known.
router.post(
  '/forgot-workplace',
  resetLimiter,
  validate(z.object({ email: z.string().email() })),
  asyncHandler(async (req, res) => {
    if (!mailConfigured(env.mail)) {
      throw new HttpError(503, 'Email is not set up yet. Ask your workplace owner or admin: the Workplace ID is at the bottom of their menu.');
    }
    const users = await User.find({ email: req.body.email.toLowerCase(), active: true, role: { $ne: 'student' } }).populate('organization', 'name slug').limit(10);
    const workplaces = users.map((u) => u.organization).filter(Boolean).map((o) => ({ name: o.name, slug: o.slug }));
    if (workplaces.length) {
      try {
        await sendMail(env.mail, { to: req.body.email.toLowerCase(), ...workplaceIdEmail({ name: users[0].name, workplaces }) });
      } catch (e) {
        console.error('Workplace ID email failed:', e.message);
      }
    }
    res.json({ message: 'If that email is registered, we have sent the Workplace ID to it.' });
  })
);

// Step 2: choose a new password with the emailed token. Signs out every other session.
router.post(
  '/reset-password',
  resetLimiter,
  validate(z.object({ token: z.string().min(20).max(200), password: z.string().min(8).max(200) })),
  asyncHandler(async (req, res) => {
    const reset = await PasswordReset.findOne({ tokenHash: hashToken(req.body.token), expiresAt: { $gt: new Date() } });
    const user = reset && (await User.findById(reset.user).select('+passwordHash'));
    if (!user || !user.active) throw new HttpError(400, 'This reset link is not valid or has expired. Ask for a new one.');
    user.passwordHash = await bcrypt.hash(req.body.password, 12);
    user.passwordChangedAt = new Date();
    await user.save();
    await PasswordReset.deleteMany({ user: user._id });
    res.json({ message: 'Password changed. You can sign in now.' });
  })
);

export default router;
