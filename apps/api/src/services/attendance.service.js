import { Attendance } from '../models/Attendance.js';
import { User } from '../models/User.js';
import { HttpError } from '../utils/http.js';
import { localParts, zonedTimeToUtc } from '../utils/time.js';

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
export async function applyManualCorrection({ orgId, userId, date, clockIn, clockOut, status = 'present', note }) {
  const user = await User.findOne({ _id: userId, organization: orgId });
  if (!user) throw new HttpError(404, 'Employee not found');
  if (clockOut && clockOut <= clockIn) throw new HttpError(400, 'Clock-out must be after clock-in');
  return Attendance.findOneAndUpdate(
    { user: user._id, date },
    {
      organization: orgId,
      user: user._id,
      date,
      clockIn,
      clockOut,
      status,
      method: 'manual',
      clockOutMethod: clockOut ? 'manual' : undefined,
      minutesWorked: clockOut ? Math.round((clockOut - clockIn) / 60000) : 0,
      note,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
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
