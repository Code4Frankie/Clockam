import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { Device } from '../models/Device.js';
import { HttpError, asyncHandler } from '../utils/http.js';

export const signToken = (user) =>
  jwt.sign({ sub: String(user._id), org: String(user.organization), role: user.role }, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN,
  });

export const requireAuth = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw new HttpError(401, 'Authentication required');

  let payload;
  try {
    payload = jwt.verify(token, env.JWT_SECRET);
  } catch {
    throw new HttpError(401, 'Invalid or expired token');
  }

  const user = await User.findById(payload.sub);
  if (!user || !user.active) throw new HttpError(401, 'Account not found or disabled');
  if (user.passwordChangedAt && payload.iat < Math.floor(user.passwordChangedAt.getTime() / 1000)) {
    throw new HttpError(401, 'Your password was changed. Please sign in again.');
  }
  req.user = user;
  next();
});

export const requireRole =
  (...roles) =>
  (req, _res, next) => {
    if (!roles.includes(req.user.role)) return next(new HttpError(403, 'You do not have permission'));
    next();
  };

// Authenticates a registered kiosk/scanner via x-device-id + x-device-key headers.
export const requireDevice = asyncHandler(async (req, _res, next) => {
  const id = req.headers['x-device-id'];
  const key = req.headers['x-device-key'];
  if (!id || !key) throw new HttpError(401, 'Device credentials required');

  const device = await Device.findById(id).select('+apiKeyHash');
  if (!device || !device.active || !(await bcrypt.compare(String(key), device.apiKeyHash))) {
    throw new HttpError(401, 'Invalid device credentials');
  }
  device.lastSeenAt = new Date();
  await device.save();
  req.device = device;
  next();
});
