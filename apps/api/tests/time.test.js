import test from 'node:test';
import assert from 'node:assert/strict';
import { zonedTimeToUtc, formatLocal, localParts } from '../src/utils/time.js';

test('zonedTimeToUtc converts Lagos wall time (UTC+1) to UTC', () => {
  assert.equal(zonedTimeToUtc('2026-11-05', '17:00', 'Africa/Lagos').toISOString(), '2026-11-05T16:00:00.000Z');
  assert.equal(zonedTimeToUtc('2026-11-05', '00:30', 'Africa/Lagos').toISOString(), '2026-11-04T23:30:00.000Z');
});

test('zonedTimeToUtc handles daylight saving zones', () => {
  assert.equal(zonedTimeToUtc('2026-07-01', '12:00', 'America/New_York').toISOString(), '2026-07-01T16:00:00.000Z');
  assert.equal(zonedTimeToUtc('2026-12-01', '12:00', 'America/New_York').toISOString(), '2026-12-01T17:00:00.000Z');
});

test('formatLocal and localParts agree with the workplace timezone', () => {
  const d = new Date('2026-11-05T16:00:00Z');
  assert.equal(formatLocal(d, 'Africa/Lagos'), '17:00');
  assert.deepEqual(localParts(d, 'Africa/Lagos'), { dateKey: '2026-11-05', minutes: 17 * 60 });
  assert.equal(formatLocal(null, 'Africa/Lagos'), null);
});
