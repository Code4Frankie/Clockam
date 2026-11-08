import test from 'node:test';
import assert from 'node:assert/strict';
import { todayKey, fmtTime, nextAction, needsLocation, friendlyError } from '../src/logic.js';

test('todayKey uses the workplace time zone, not UTC', () => {
  const lateNightUtc = new Date('2026-11-08T23:30:00Z'); // already 00:30 on the 9th in Lagos
  assert.equal(todayKey('Africa/Lagos', lateNightUtc), '2026-11-09');
  assert.equal(todayKey('UTC', lateNightUtc), '2026-11-08');
});

test('button follows today\'s record', () => {
  assert.equal(nextAction(undefined).kind, 'in');
  assert.equal(nextAction({ clockIn: 'x' }).kind, 'out');
  assert.equal(nextAction({ clockIn: 'x', clockOut: 'y' }).kind, 'done');
});

test('times, location rule and errors', () => {
  assert.equal(fmtTime('2026-11-08T07:05:00Z', 'Africa/Lagos'), '08:05');
  assert.equal(fmtTime(null), '—');
  assert.equal(needsLocation({ geofence: { enabled: true } }), true);
  assert.equal(needsLocation({}), false);
  assert.match(friendlyError(new Error('Network request failed')), /internet/);
  assert.equal(friendlyError(new Error('You are 400m from the workplace (limit 150m)')), 'You are 400m from the workplace (limit 150m)');
});

import { isOnBreak } from '../src/logic.js';

test('on break only while a break is open on an unfinished day', () => {
  assert.equal(isOnBreak(undefined), false);
  assert.equal(isOnBreak({ breaks: [] }), false);
  assert.equal(isOnBreak({ breaks: [{ start: 'a' }] }), true);
  assert.equal(isOnBreak({ breaks: [{ start: 'a', end: 'b' }] }), false);
  assert.equal(isOnBreak({ clockOut: 'x', breaks: [{ start: 'a' }] }), false);
});
