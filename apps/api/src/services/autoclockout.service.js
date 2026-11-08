import { Attendance } from '../models/Attendance.js';
import { Organization } from '../models/Organization.js';
import { autoClockOut, closeDay } from '../utils/attendanceMath.js';

/**
 * Closes days left open, for workplaces that turned this on. The clock-out is recorded as the closing time and
 * marked "auto", and an admin can still correct it on the Edit attendance page. Safe to run as often as you like.
 */
export async function sweepOrg(org, now = new Date()) {
  if (!org || !(org.autoClockOutHours > 0)) return 0;
  const open = await Attendance.find({ organization: org._id, clockOut: null, status: { $in: ['present', 'late'] } }).limit(500);
  let closed = 0;
  for (const rec of open) {
    const due = autoClockOut(rec, org, now);
    if (!due) continue;
    closeDay(rec, due.clockOut, 'auto');
    rec.note = [rec.note, 'Clock-out set automatically at closing time'].filter(Boolean).join('; ').slice(0, 300);
    await rec.save();
    closed += 1;
  }
  return closed;
}

export async function sweepAll(now = new Date()) {
  const orgs = await Organization.find({ autoClockOutHours: { $gt: 0 } });
  let closed = 0;
  for (const org of orgs) closed += await sweepOrg(org, now);
  return closed;
}
