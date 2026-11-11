import { env } from '../config/env.js';
import { Organization } from '../models/Organization.js';
import { asyncHandler, HttpError } from '../utils/http.js';
import { billingState } from '../utils/billing.js';
import { getPlan } from '../services/billing.service.js';

// Placed on admin features only. Clock-in, scanners and student attendance never use it, so people can always clock in.
export const billingGate = asyncHandler(async (req, _res, next) => {
  if (!env.billingEnforced) return next();
  const org = await Organization.findById(req.user.organization).select('billing createdAt');
  const state = billingState({ plan: await getPlan(), billing: org?.billing, createdAt: org?.createdAt, enforced: true });
  if (state.locked) throw new HttpError(402, 'This workplace\'s ClockAm subscription has expired. The owner can renew under Billing. Clock-in still works.');
  next();
});
