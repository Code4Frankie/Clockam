// One place for the rules about a working day, so every way of clocking (kiosk, scanner, phone, automatic, manual edit)
// counts hours the same way. Pure functions: tested without a database.
import { localParts, toMinutes, zonedTimeToUtc } from './time.js';

export const MAX_BREAKS_PER_DAY = 10;
const MIN_GAP_MS = 60 * 1000;
const FUTURE_SLACK_MS = 60 * 1000;

const plain = (b) => (b && typeof b.toObject === 'function' ? b.toObject() : b);

export const statusFromClockIn = (clockIn, org) =>
  localParts(clockIn, org.timezone).minutes > toMinutes(org.workStart) + org.graceMinutes ? 'late' : 'present';

export const openBreak = (breaks = []) => breaks.find((b) => !b.end);

// Minutes spent on finished breaks. Pass `now` to also count a break that is still open.
export function breakMinutes(breaks = [], now) {
  let ms = 0;
  for (const b of breaks) {
    const end = b.end ?? now;
    if (end && end > b.start) ms += end - b.start;
  }
  return Math.round(ms / 60000);
}

export const workedMinutes = (clockIn, clockOut, breaks = []) =>
  Math.max(0, Math.round((clockOut - clockIn) / 60000) - breakMinutes(breaks));

export const closeOpenBreaks = (breaks = [], at) =>
  breaks.map((b) => {
    const p = plain(b);
    return p.end ? p : { ...p, end: at > p.start ? at : p.start };
  });

// Ends the day on a record: closes a break left open, and totals hours worked after breaks.
export function closeDay(record, clockOut, method) {
  record.breaks = closeOpenBreaks(record.breaks, clockOut);
  record.clockOut = clockOut;
  record.clockOutMethod = method;
  record.breakMinutes = breakMinutes(record.breaks);
  record.minutesWorked = workedMinutes(record.clockIn, clockOut, record.breaks);
  return record;
}

// What a break scan should do for today's record, or why it cannot.
export function decideBreak(record, now) {
  if (!record) return { error: 'Clock in before starting a break.' };
  if (record.clockOut) return { error: 'You have already clocked out for today.' };
  const open = openBreak(record.breaks);
  if (open) {
    if (now - open.start < MIN_GAP_MS) return { error: 'Your break just started. Wait a minute before ending it.' };
    return { action: 'break-end' };
  }
  if ((record.breaks || []).length >= MAX_BREAKS_PER_DAY) return { error: 'Too many breaks today. Ask an admin.' };
  if (now - record.clockIn < MIN_GAP_MS) return { error: 'You just clocked in. Wait a minute before starting a break.' };
  return { action: 'break-start' };
}

// When a day left open should be closed automatically: `hours` after closing time, recorded as the closing time.
export function autoClockOut(record, org, now) {
  const hours = Number(org.autoClockOutHours) || 0;
  if (!hours || record.clockOut) return null;
  const closing = zonedTimeToUtc(record.date, org.workEnd, org.timezone);
  const deadline = new Date(closing.getTime() + hours * 3600 * 1000);
  if (now < deadline) return null;
  return { clockOut: closing > record.clockIn ? closing : deadline }; // arrived after closing time: use the deadline instead
}

/**
 * Turns the "HH:mm" an admin typed for a day into real times, or says what is wrong.
 * Breaks already on the day must still fit inside the new times.
 */
export function resolveDayTimes({ date, clockInTime, clockOutTime, timeZone, now = new Date(), breaks = [] }) {
  const clockIn = zonedTimeToUtc(date, clockInTime, timeZone);
  if (Number.isNaN(clockIn.getTime())) return { error: 'Invalid clock-in time' };
  if (clockIn - now > FUTURE_SLACK_MS) return { error: 'Clock-in time is in the future' };
  let clockOut = null;
  if (clockOutTime) {
    clockOut = zonedTimeToUtc(date, clockOutTime, timeZone);
    if (Number.isNaN(clockOut.getTime())) return { error: 'Invalid clock-out time' };
    if (clockOut <= clockIn) return { error: 'Clock-out must be after clock-in' };
    if (clockOut - now > FUTURE_SLACK_MS) return { error: 'Clock-out time is in the future' };
  }
  for (const b of breaks) {
    const p = plain(b);
    if (p.start < clockIn || (clockOut && (p.end ?? p.start) > clockOut)) {
      return { error: 'This day has a break outside those times. Change the times so the break fits, or ask for the break to be removed.' };
    }
  }
  return { clockIn, clockOut };
}
