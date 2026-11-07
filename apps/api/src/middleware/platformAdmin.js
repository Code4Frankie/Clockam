import { env } from '../config/env.js';
import { HttpError } from '../utils/http.js';

// Frankiecode staff. Identified by user id (PLATFORM_ADMIN_USER_IDS), not email, because sign-up emails are unverified.
export const isPlatformAdmin = (user) => env.platformAdminIds.includes(String(user._id));

export const requirePlatformAdmin = (req, _res, next) =>
  isPlatformAdmin(req.user) ? next() : next(new HttpError(403, 'Not available for your account'));
