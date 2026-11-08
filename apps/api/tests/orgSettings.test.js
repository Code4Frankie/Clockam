import test from 'node:test';
import assert from 'node:assert/strict';
import { settingsSchema, mergeSettings, checkMerged } from '../src/utils/orgSettings.js';
import { assertInsideGeofence } from '../src/utils/geo.js';

const base = { timezone: 'Africa/Lagos', workStart: '08:00', workEnd: '17:00', graceMinutes: 15, geofence: { enabled: false, radiusMeters: 150 } };

test('settings accept valid changes and reject bad ones', () => {
  assert.ok(settingsSchema.safeParse({ workStart: '07:30', graceMinutes: 10 }).success);
  assert.ok(!settingsSchema.safeParse({ workStart: '8:00' }).success);
  assert.ok(!settingsSchema.safeParse({ workStart: '25:00' }).success);
  assert.ok(!settingsSchema.safeParse({ graceMinutes: -1 }).success);
  assert.ok(!settingsSchema.safeParse({ graceMinutes: 500 }).success);
  assert.ok(!settingsSchema.safeParse({ timezone: 'Mars/Base' }).success);
  assert.ok(!settingsSchema.safeParse({}).success);
  assert.ok(!settingsSchema.safeParse({ name: 'Hacked', slug: 'x' }).success, 'unknown fields rejected');
  assert.ok(!settingsSchema.safeParse({ geofence: { enabled: true, lat: 95, lng: 3 } }).success);
  assert.ok(!settingsSchema.safeParse({ geofence: { enabled: true, lat: 6.5, lng: 3.3, radiusMeters: 5 } }).success);
});

test('merging keeps untouched fields and checks the combined result', () => {
  const m = mergeSettings(base, { workStart: '09:00' });
  assert.equal(m.workEnd, '17:00');
  assert.equal(checkMerged(m), null);
  assert.match(checkMerged(mergeSettings(base, { workEnd: '07:00' })), /after start/);
  assert.match(checkMerged(mergeSettings(base, { geofence: { enabled: true } })), /location/);
  const on = mergeSettings(base, { geofence: { enabled: true, lat: 6.5244, lng: 3.3792 } });
  assert.equal(checkMerged(on), null);
  assert.equal(on.geofence.radiusMeters, 150);
});

test('geofence blocks far away and missing locations, allows near ones', () => {
  const org = { geofence: { enabled: true, lat: 6.5244, lng: 3.3792, radiusMeters: 150 } };
  assert.doesNotThrow(() => assertInsideGeofence(org, { lat: 6.5245, lng: 3.3793 }));
  assert.throws(() => assertInsideGeofence(org, { lat: 6.6, lng: 3.5 }), /from the workplace/);
  assert.throws(() => assertInsideGeofence(org, undefined), /Location is required/);
  assert.doesNotThrow(() => assertInsideGeofence({ geofence: { enabled: false } }, undefined));
});

import { editDaySchema } from '../src/utils/attendanceEdit.js';

test('automatic clock-out hours are validated and merged', () => {
  assert.ok(settingsSchema.safeParse({ autoClockOutHours: 0 }).success);
  assert.ok(settingsSchema.safeParse({ autoClockOutHours: 3 }).success);
  assert.ok(!settingsSchema.safeParse({ autoClockOutHours: 13 }).success);
  assert.ok(!settingsSchema.safeParse({ autoClockOutHours: 1.5 }).success);
  assert.equal(mergeSettings(base, { autoClockOutHours: 2 }).autoClockOutHours, 2);
  assert.equal(mergeSettings(base, { workStart: '09:00' }).autoClockOutHours, 0);
});

test('edit attendance needs a reason, valid times and an employee', () => {
  const ok = { userId: 'a'.repeat(24), date: '2026-11-06', clockIn: '08:05', clockOut: '17:00', reason: 'Network was down at arrival' };
  assert.ok(editDaySchema.safeParse(ok).success);
  assert.ok(editDaySchema.safeParse({ ...ok, clockOut: null }).success, 'no clock-out is allowed');
  assert.ok(!editDaySchema.safeParse({ ...ok, reason: '' }).success);
  assert.ok(!editDaySchema.safeParse({ ...ok, reason: 'x' }).success);
  assert.ok(!editDaySchema.safeParse({ ...ok, clockIn: '8:05' }).success);
  assert.ok(!editDaySchema.safeParse({ ...ok, userId: 'nope' }).success);
  assert.ok(!editDaySchema.safeParse({ ...ok, status: 'present' }).success, 'status cannot be forced');
});
