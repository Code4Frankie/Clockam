import { Attendance } from '../models/Attendance.js';
import { HttpError } from '../utils/http.js';
import { localParts, toMinutes } from '../utils/time.js';
import { assertInsideGeofence, nearLimit } from '../utils/geo.js';
import { assertAllowedNetwork } from '../utils/network.js';
import { closeDay } from '../utils/attendanceMath.js';

const MIN_GAP_MS = 60 * 1000; // stop accidental double taps

/**
 * Toggles a person's state for today: first scan = clock-in, next scan = clock-out.
 * Used by every capture method (WebAuthn, hardware scanner, mobile app).
 */
export async function clockUser({ user, org, method, device, location, ip }) {
  const now = new Date();
  const { dateKey, minutes } = localParts(now, org.timezone);

  // Hardware scanners sit at the workplace, so geofence only applies to personal devices.
  if (method !== 'scanner' && method !== 'manual') {
    assertInsideGeofence(org, location);
    assertAllowedNetwork(org, ip);
  }

  const existing = await Attendance.findOne({ user: user._id, date: dateKey });

  if (!existing) {
    const late = minutes > toMinutes(org.workStart) + org.graceMinutes;
    const record = await Attendance.create({
      organization: org._id,
      user: user._id,
      date: dateKey,
      clockIn: now,
      status: late ? 'late' : 'present',
      method,
      device: device?._id,
      location,
      flags: nearLimit(org, location) ? ['near-limit'] : [],
    });
    return { action: 'clock-in', record };
  }

  if (!existing.clockOut) {
    if (now - existing.clockIn < MIN_GAP_MS) {
      throw new HttpError(429, 'You just clocked in. Please wait a minute before clocking out.');
    }
    closeDay(existing, now, method);
    await existing.save();
    return { action: 'clock-out', record: existing };
  }

  throw new HttpError(409, 'Already clocked out for today');
}
