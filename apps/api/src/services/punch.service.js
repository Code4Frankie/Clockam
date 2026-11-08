import { Attendance } from '../models/Attendance.js';
import { localParts } from '../utils/time.js';
import { decidePunch } from '../utils/punch.js';
import { closeDay } from '../utils/attendanceMath.js';

/**
 * Applies one punch that happened at a known time (offline kiosk uploads, ZKTeco pushes).
 * Repeating the same punch changes nothing, so retries are safe. Returns 'clock-in', 'clock-out' or 'ignored'.
 */
export async function applyPunch({ user, org, device, at, method }) {
  const { dateKey } = localParts(at, org.timezone);
  const existing = await Attendance.findOne({ user: user._id, date: dateKey });
  const d = decidePunch(existing, at, org);
  if (d.action === 'ignore') return { action: 'ignored' };
  try {
    if (d.action === 'clock-in') {
      const record = await Attendance.create({ organization: org._id, user: user._id, date: dateKey, clockIn: at, status: d.status, method, device: device?._id });
      return { action: 'clock-in', record };
    }
    closeDay(existing, at, method);
    await existing.save();
    return { action: 'clock-out', record: existing };
  } catch (e) {
    if (e.code !== 11000) throw e; // two uploads raced to create the same day: the other one wins
    return { action: 'ignored' };
  }
}
