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
import { clearPlanCache, getPlan, orgBilling, settleFromTransaction, startCheckout, verifyReference } from '../services/billing.service.js';

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

/* Owner or admin: see what is owed and pay */
router.use(requireAuth, requireRole('owner', 'admin'));

router.get('/status', asyncHandler(async (req, res) => {
  const org = await Organization.findById(req.user.organization);
  const { plan, workers, state, charge } = await orgBilling(org);
  const payments = await Payment.find({ organization: org._id, status: 'success' }).sort({ paidAt: -1 }).limit(20);
  res.json({
    enforced: env.billingEnforced, canPay: !!env.paystackSecretKey, plan, workers, state, charge,
    setupPaid: !!org.billing?.setupPaid,
    payments: payments.map((p) => ({ reference: p.reference, amount: p.amount, paidAt: p.paidAt, tierName: p.breakdown?.tierName })),
  });
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
