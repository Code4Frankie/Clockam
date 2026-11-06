import { Attendance } from '../models/Attendance.js';
import { HttpError } from '../utils/http.js';
import { localParts, toMinutes } from '../utils/time.js';
import { distanceMeters } from '../utils/geo.js';

const MIN_GAP_MS = 60 * 1000; // stop accidental double taps

function assertInsideGeofence(org, location) {
  const g = org.geofence;
  if (!g?.enabled) return;
  if (!location) throw new HttpError(400, 'Location is required to clock in at this workplace');
  const dist = distanceMeters({ lat: g.lat, lng: g.lng }, location);
  if (dist > g.radiusMeters) {
    throw new HttpError(403, `You are ${Math.round(dist)}m from the workplace (limit ${g.radiusMeters}m)`);
  }
}

/**
 * Toggles a person's state for today: first scan = clock-in, next scan = clock-out.
 * Used by every capture method (WebAuthn, hardware scanner, mobile app).
 */
export async function clockUser({ user, org, method, device, location }) {
  const now = new Date();
  const { dateKey, minutes } = localParts(now, org.timezone);

  // Hardware scanners sit at the workplace, so geofence only applies to personal devices.
  if (method !== 'scanner' && method !== 'manual') assertInsideGeofence(org, location);

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
    });
    return { action: 'clock-in', record };
  }

  if (!existing.clockOut) {
    if (now - existing.clockIn < MIN_GAP_MS) {
      throw new HttpError(429, 'You just clocked in. Please wait a minute before clocking out.');
    }
    existing.clockOut = now;
    existing.clockOutMethod = method;
    existing.minutesWorked = Math.round((now - existing.clockIn) / 60000);
    await existing.save();
    return { action: 'clock-out', record: existing };
  }

  throw new HttpError(409, 'Already clocked out for today');
}
