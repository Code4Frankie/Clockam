import { Attendance } from '../models/Attendance.js';
import { HttpError } from '../utils/http.js';
import { assertInsideGeofence } from '../utils/geo.js';
import { breakMinutes, closeOpenBreaks, decideBreak } from '../utils/attendanceMath.js';
import { localParts } from '../utils/time.js';

/**
 * Starts or ends a break on today's record. Breaks are unpaid: they are subtracted from hours worked when the day closes.
 * The person must have clocked in and not yet clocked out.
 */
export async function toggleBreak({ user, org, method, location }) {
  const now = new Date();
  if (method !== 'scanner') assertInsideGeofence(org, location);
  const { dateKey } = localParts(now, org.timezone);
  const record = await Attendance.findOne({ user: user._id, date: dateKey });
  const d = decideBreak(record, now);
  if (d.error) throw new HttpError(409, d.error);

  if (d.action === 'break-start') {
    record.breaks.push({ start: now, method });
  } else {
    record.breaks = closeOpenBreaks(record.breaks, now);
  }
  record.breakMinutes = breakMinutes(record.breaks);
  await record.save();
  return { action: d.action, record };
}
