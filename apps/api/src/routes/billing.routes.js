import { Router } from 'express';
import { z } from 'zod';
import { env } from '../config/env.js';
import { Organization } from '../models/Organization.js';
import { PlanConfig } from '../models/PlanConfig.js';
import { Payment } from '../models/Payment.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { requirePlatformAdmin } from '../middleware/platformAdmin.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler, HttpError } from '../utils/http.js';
import { planSchema, paystackSignatureOk } from '../utils/billing.js';
import { clearPlanCache, billingSummary, getPlan, settleFromTransaction, startCheckout, verifyReference } from '../services/billing.service.js';

const router = Router();

// Prices are public so the sign-up and pricing pages can show them.
router.get('/plans', asyncHandler(async (_req, res) => res.json({ currency: 'NGN', unit: 'kobo', ...(await getPlan()) })));

// Paystack tells us a payment finished. The signature proves it came from Paystack, and we still check the amount.
router.post('/webhook/paystack', asyncHandler(async (req, res) => {
  if (!paystackSignatureOk(req.rawBody, req.headers['x-paystack-signature'], env.paystackSecretKey)) throw new HttpError(401, 'Bad signature');
  if (req.body?.event === 'charge.success') await settleFromTransaction(req.body.data);
  res.sendStatus(200);
}));

/* Platform admin: edit the prices */
router.get('/admin/plan', requireAuth, requirePlatformAdmin, asyncHandler(async (_req, res) => res.json(await getPlan())));
router.put('/admin/plan', requireAuth, requirePlatformAdmin, validate(planSchema), asyncHandler(async (req, res) => {
  await PlanConfig.findOneAndUpdate({ key: 'default' }, { ...req.body, updatedBy: req.user._id }, { upsert: true, setDefaultsOnInsert: true });
  clearPlanCache();
  res.json(await getPlan());
}));

/* Owner and workplace admin see billing. Only the owner subscribes and pays. */
router.use(requireAuth, requireRole('owner', 'admin'));

router.get('/status', asyncHandler(async (req, res) => {
  const org = await Organization.findById(req.user.organization);
  const s = await billingSummary(org);
  const payments = await Payment.find({ organization: org._id, status: 'success' }).sort({ paidAt: -1 }).limit(20);
  res.json({
    enforced: env.billingEnforced, canPay: !!env.paystackSecretKey && req.user.role === 'owner', isOwner: req.user.role === 'owner', ...s,
    payments: payments.map((p) => ({ reference: p.reference, amount: p.amount, paidAt: p.paidAt, tierName: p.breakdown?.tierName })),
  });
}));

// The owner chooses which package to subscribe to. Only that package appears in the next payment.
router.post('/subscribe', requireRole('owner'), validate(z.object({ packageName: z.string().trim().min(1).max(40) }).strict()), asyncHandler(async (req, res) => {
  const org = await Organization.findById(req.user.organization);
  const plan = await getPlan();
  if (!plan.packages.some((x) => x.name === req.body.packageName)) throw new HttpError(400, 'That package does not exist');
  const pkg = plan.packages.find((x) => x.name === req.body.packageName);
  const { workers } = await billingSummary(org);
  if (pkg.maxPeople != null && workers > pkg.maxPeople) throw new HttpError(400, `${pkg.name} allows up to ${pkg.maxPeople} people and you have ${workers}.`);
  org.set('billing.packageName', pkg.name);
  await org.save();
  res.json({ ok: true });
}));

router.post('/checkout', requireRole('owner'), validate(z.object({ provider: z.enum(['paystack', 'opay']) }).strict()), asyncHandler(async (req, res) => {
  if (req.body.provider === 'opay') throw new HttpError(501, 'OPay is not connected yet. Use Paystack for now.');
  const org = await Organization.findById(req.user.organization);
  res.json(await startCheckout({ org, user: req.user }));
}));

router.get('/verify/:reference', requireRole('owner'), asyncHandler(async (req, res) => {
  const p = await verifyReference(req.params.reference, req.user.organization);
  res.json({ status: p.status });
}));

export default router;
