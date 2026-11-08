import { Attendance } from '../models/Attendance.js';
import { User } from '../models/User.js';
import { HttpError } from '../utils/http.js';
import { clockoutAfter, localParts, zonedTimeToUtc } from '../utils/time.js';
import { breakMinutes, closeDay, resolveDayTimes, statusFromClockIn } from '../utils/attendanceMath.js';

const OBJECT_ID = /^[a-f\d]{24}$/i;
const str = (v) => (typeof v === 'string' ? v : undefined);

export const todayKey = (org, now = new Date()) => localParts(now, org.timezone).dateKey;

export async function getDayOverview(org, dateKey, { withAbsentees = false } = {}) {
  const [records, staff] = await Promise.all([
    Attendance.find({ organization: org._id, date: dateKey }).populate('user', 'name staffId department').sort({ clockIn: -1 }),
    User.find({ organization: org._id, active: true, role: { $ne: 'owner' } }).select('name staffId department'),
  ]);
  const present = records.length;
  const late = records.filter((r) => r.status === 'late').length;
  const out = { date: dateKey, totalStaff: staff.length, present, late, absent: Math.max(staff.length - present, 0), records };
  if (withAbsentees) {
    const seen = new Set(records.map((r) => String(r.user?._id)));
    out.absentees = staff.filter((s) => !seen.has(String(s._id)));
  }
  return out;
}

export const getTodayOverview = (org) => getDayOverview(org, todayKey(org));

export async function getAttendanceRange({ orgId, from, to, userId, limit = 1000 }) {
  const f = str(from);
  const t = str(to);
  const u = str(userId);
  if (u && !OBJECT_ID.test(u)) throw new HttpError(400, 'Invalid user id');
  const filter = { organization: orgId };
  if (f || t) filter.date = { ...(f && { $gte: f }), ...(t && { $lte: t }) };
  if (u) filter.user = u;
  return Attendance.find(filter).populate('user', 'name staffId department').sort({ date: -1, clockIn: -1 }).limit(limit);
}

export const getMyRecords = ({ userId, from, to }) =>
  Attendance.find({ user: userId, date: { $gte: from, $lte: to } }).sort({ date: -1 }).limit(100);

export const getUserRecord = ({ userId, date }) => Attendance.findOne({ user: userId, date });

export const getExistingRecord = ({ orgId, userId, date }) =>
  Attendance.findOne({ organization: orgId, user: userId, date });

// Manual correction by an admin (shared by the REST route and the assistant's confirmed action).
// Keeps any breaks already on the day and adds a line to the day's change history.
export async function applyManualCorrection({ orgId, userId, date, clockIn, clockOut, status = 'present', note, by = 'an admin' }) {
  const user = await User.findOne({ _id: userId, organization: orgId });
  if (!user) throw new HttpError(404, 'Employee not found');
  if (clockOut && clockOut <= clockIn) throw new HttpError(400, 'Clock-out must be after clock-in');
  let rec = await Attendance.findOne({ user: user._id, date });
  const before = rec ? { clockIn: rec.clockIn, clockOut: rec.clockOut, status: rec.status } : undefined;
  if (!rec) rec = new Attendance({ organization: orgId, user: user._id, date, method: 'manual', clockIn });
  rec.clockIn = clockIn;
  rec.status = status;
  if (note) rec.note = note;
  if (clockOut) closeDay(rec, clockOut, 'manual');
  else reopenDay(rec);
  rec.edits.push({ by, reason: (note || 'Manual correction').slice(0, 200), before, after: { clockIn, clockOut, status } });
  await rec.save();
  return rec;
}

// A day with no clock-out: nothing is totalled yet.
function reopenDay(rec) {
  rec.clockOut = undefined;
  rec.clockOutMethod = undefined;
  rec.minutesWorked = 0;
  rec.breakMinutes = breakMinutes(rec.breaks);
}

// One day for the Edit attendance screen: the record (if any) with its breaks and change history.
export async function getDay({ org, userId, date }) {
  const user = await User.findOne({ _id: userId, organization: org._id }).select('name staffId');
  if (!user) throw new HttpError(404, 'Employee not found');
  const record = await Attendance.findOne({ user: user._id, date });
  return { employee: { id: user._id, name: user.name, staffId: user.staffId }, record };
}

/**
 * Admin sets (or adds) a person's clock-in and clock-out for a day, as local times like "08:05".
 * Late or present is worked out from the workplace hours, breaks must fit inside the new times,
 * and the old and new values are saved with who changed them and why.
 */
export async function editAttendance({ org, actor, userId, date, clockInTime, clockOutTime, reason }) {
  const user = await User.findOne({ _id: userId, organization: org._id });
  if (!user) throw new HttpError(404, 'Employee not found');
  let rec = await Attendance.findOne({ user: user._id, date });
  const times = resolveDayTimes({ date, clockInTime, clockOutTime, timeZone: org.timezone, breaks: rec?.breaks });
  if (times.error) throw new HttpError(400, times.error);

  const status = statusFromClockIn(times.clockIn, org);
  const before = rec ? { clockIn: rec.clockIn, clockOut: rec.clockOut, status: rec.status } : undefined;
  if (!rec) rec = new Attendance({ organization: org._id, user: user._id, date, method: 'manual', clockIn: times.clockIn });
  rec.clockIn = times.clockIn;
  rec.status = status;
  if (times.clockOut) closeDay(rec, times.clockOut, 'manual');
  else reopenDay(rec);
  rec.edits.push({ by: actor.name, reason, before, after: { clockIn: times.clockIn, clockOut: times.clockOut ?? undefined, status } });
  await rec.save();
  return rec;
}

// Past days where someone clocked in but never clocked out, with a suggested clock-out at closing time.
export async function listMissingClockouts(org, { limit = 50 } = {}) {
  const rows = await Attendance.find({
    organization: org._id,
    date: { $lt: todayKey(org) },
    clockOut: null,
    status: { $in: ['present', 'late'] },
  })
    .populate('user', 'name staffId')
    .sort({ date: -1 })
    .limit(limit);

  return rows.map((r) => {
    const suggested = zonedTimeToUtc(r.date, org.workEnd, org.timezone);
    return {
      userId: r.user?._id,
      name: r.user?.name,
      staffId: r.user?.staffId,
      date: r.date,
      clockIn: r.clockIn,
      suggestedClockOut: suggested > r.clockIn ? suggested : null,
    };
  });
}

// Fills in a clock-out that was never recorded. Only works on a day that has a clock-in and no clock-out.
export async function fixMissingClockout({ org, userId, date, time, by }) {
  const record = await Attendance.findOne({ organization: org._id, user: userId, date });
  if (!record) throw new HttpError(404, 'No attendance record for that person and day');
  if (record.clockOut) throw new HttpError(409, 'That day already has a clock-out');
  const clockOut = clockoutAfter(date, time, org.timezone, record.clockIn);
  if (!clockOut) throw new HttpError(400, 'Clock-out must be after the clock-in time');
  closeDay(record, clockOut, 'manual');
  record.note = [record.note, `Clock-out set by ${by}`].filter(Boolean).join('; ').slice(0, 300);
  await record.save();
  return record;
}
