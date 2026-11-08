import test from 'node:test';
import assert from 'node:assert/strict';
import { autoClockOut, breakMinutes, closeDay, decideBreak, resolveDayTimes, statusFromClockIn, workedMinutes } from '../src/utils/attendanceMath.js';

const ORG = { timezone: 'Africa/Lagos', workStart: '08:00', workEnd: '17:00', graceMinutes: 15, autoClockOutHours: 2 };
const t = (s) => new Date(s);

test('late status follows start time plus grace, in the workplace time zone', () => {
  assert.equal(statusFromClockIn(t('2026-11-08T07:15:00Z'), ORG), 'present'); // 08:15
  assert.equal(statusFromClockIn(t('2026-11-08T07:16:00Z'), ORG), 'late');
});

test('breaks are subtracted from hours worked, open breaks counted only when asked', () => {
  const breaks = [{ start: t('2026-11-08T11:00:00Z'), end: t('2026-11-08T11:30:00Z') }, { start: t('2026-11-08T13:00:00Z') }];
  assert.equal(breakMinutes(breaks), 30);
  assert.equal(breakMinutes(breaks, t('2026-11-08T13:10:00Z')), 40);
  assert.equal(workedMinutes(t('2026-11-08T07:00:00Z'), t('2026-11-08T16:00:00Z'), [breaks[0]]), 510);
  assert.equal(workedMinutes(t('2026-11-08T07:00:00Z'), t('2026-11-08T07:10:00Z'), [{ start: t('2026-11-08T07:00:00Z'), end: t('2026-11-08T08:00:00Z') }]), 0, 'never negative');
});

test('closing a day ends an open break and totals the hours', () => {
  const rec = { clockIn: t('2026-11-08T07:00:00Z'), breaks: [{ start: t('2026-11-08T11:00:00Z'), end: t('2026-11-08T11:30:00Z') }, { start: t('2026-11-08T15:30:00Z') }] };
  closeDay(rec, t('2026-11-08T16:00:00Z'), 'scanner');
  assert.equal(rec.breaks[1].end.toISOString(), '2026-11-08T16:00:00.000Z');
  assert.equal(rec.breakMinutes, 60);
  assert.equal(rec.minutesWorked, 480);
  assert.equal(rec.clockOutMethod, 'scanner');
});

test('break scans alternate start and end, with sensible refusals', () => {
  const now = t('2026-11-08T11:00:00Z');
  const base = { clockIn: t('2026-11-08T07:00:00Z'), breaks: [] };
  assert.match(decideBreak(null, now).error, /Clock in/);
  assert.match(decideBreak({ ...base, clockOut: now }, now).error, /already clocked out/);
  assert.equal(decideBreak(base, now).action, 'break-start');
  assert.match(decideBreak({ clockIn: t('2026-11-08T10:59:30Z'), breaks: [] }, now).error, /just clocked in/);
  const onBreak = { ...base, breaks: [{ start: t('2026-11-08T10:30:00Z') }] };
  assert.equal(decideBreak(onBreak, now).action, 'break-end');
  assert.match(decideBreak({ ...base, breaks: [{ start: t('2026-11-08T10:59:40Z') }] }, now).error, /just started/);
  const many = { ...base, breaks: Array.from({ length: 10 }, (_, i) => ({ start: t('2026-11-08T08:00:00Z'), end: t('2026-11-08T08:05:00Z') })) };
  assert.match(decideBreak(many, now).error, /Too many/);
});

test('automatic clock-out waits for the deadline and records the closing time', () => {
  const rec = { date: '2026-11-08', clockIn: t('2026-11-08T07:00:00Z') };
  assert.equal(autoClockOut(rec, ORG, t('2026-11-08T17:59:00Z')), null, 'closing 17:00 Lagos = 16:00Z, deadline 18:00Z');
  assert.equal(autoClockOut(rec, ORG, t('2026-11-08T18:00:00Z')).clockOut.toISOString(), '2026-11-08T16:00:00.000Z');
  assert.equal(autoClockOut(rec, { ...ORG, autoClockOutHours: 0 }, t('2026-11-10T00:00:00Z')), null, 'off');
  assert.equal(autoClockOut({ ...rec, clockOut: t('2026-11-08T15:00:00Z') }, ORG, t('2026-11-10T00:00:00Z')), null, 'already out');
  const late = { date: '2026-11-08', clockIn: t('2026-11-08T16:30:00Z') }; // arrived after closing
  assert.equal(autoClockOut(late, ORG, t('2026-11-08T18:00:00Z')).clockOut.toISOString(), '2026-11-08T18:00:00.000Z');
});

test('edited times: converts local time, rejects future, backwards and times that cut off a break', () => {
  const now = t('2026-11-08T12:00:00Z'); // 13:00 Lagos
  const ok = resolveDayTimes({ date: '2026-11-08', clockInTime: '08:30', clockOutTime: '12:00', timeZone: 'Africa/Lagos', now });
  assert.equal(ok.clockIn.toISOString(), '2026-11-08T07:30:00.000Z');
  assert.equal(ok.clockOut.toISOString(), '2026-11-08T11:00:00.000Z');
  assert.equal(resolveDayTimes({ date: '2026-11-08', clockInTime: '08:30', timeZone: 'Africa/Lagos', now }).clockOut, null);
  assert.match(resolveDayTimes({ date: '2026-11-08', clockInTime: '14:00', timeZone: 'Africa/Lagos', now }).error, /future/);
  assert.match(resolveDayTimes({ date: '2026-11-08', clockInTime: '10:00', clockOutTime: '09:00', timeZone: 'Africa/Lagos', now }).error, /after clock-in/);
  const withBreak = [{ start: t('2026-11-08T07:00:00Z'), end: t('2026-11-08T07:20:00Z') }]; // 08:00-08:20 Lagos
  assert.match(resolveDayTimes({ date: '2026-11-08', clockInTime: '08:30', timeZone: 'Africa/Lagos', now, breaks: withBreak }).error, /break/);
});
