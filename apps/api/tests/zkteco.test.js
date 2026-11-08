import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAttLog, handshakeText, decidePunch, SERIAL } from '../src/utils/zkteco.js';

const NOW = new Date('2026-11-08T12:00:00Z'); // 13:00 in Lagos
const ORG = { timezone: 'Africa/Lagos', workStart: '08:00', graceMinutes: 15 };

test('parses punches in the workplace time zone and skips junk', () => {
  const body = ['12\t2026-11-08 07:55:10\t0\t1\t0', '14\t2026-11-08 08:20:00\t0\t1', 'bad line', 'x y\t2026-11-08 08:00:00', '15\t2026-13-45 99:00:00', '', '16\t2026-11-08 07:50:00'].join('\r\n');
  const { punches, skipped } = parseAttLog(body, 'Africa/Lagos', NOW);
  assert.deepEqual(punches.map((p) => p.pin), ['12', '14', '16']);
  assert.equal(punches[0].at.toISOString(), '2026-11-08T06:55:10.000Z'); // Lagos is UTC+1
  assert.equal(skipped, 3);
});

test('rejects far-future and very old punches, and caps the batch size', () => {
  const body = ['1\t2026-11-08 14:00:00', '2\t2026-10-01 08:00:00', '3\t2026-11-08 12:30:00'].join('\n');
  const { punches, skipped } = parseAttLog(body, 'Africa/Lagos', NOW);
  assert.deepEqual(punches.map((p) => p.pin), ['3']);
  assert.equal(skipped, 2);
  const many = Array.from({ length: 600 }, (_, i) => `${i + 1}\t2026-11-08 07:00:00`).join('\n');
  const r = parseAttLog(many, 'Africa/Lagos', NOW);
  assert.equal(r.punches.length, 500);
  assert.equal(r.skipped, 100);
});

test('first punch is clock-in (late after the grace period), later punches move clock-out', () => {
  const t = (s) => new Date(s);
  assert.deepEqual(decidePunch(null, t('2026-11-08T06:55:00Z'), ORG), { action: 'clock-in', status: 'present' }); // 07:55
  assert.deepEqual(decidePunch(null, t('2026-11-08T07:15:00Z'), ORG), { action: 'clock-in', status: 'present' }); // 08:15, inside grace
  assert.deepEqual(decidePunch(null, t('2026-11-08T07:16:00Z'), ORG), { action: 'clock-in', status: 'late' });
  const open = { clockIn: t('2026-11-08T07:00:00Z') };
  assert.equal(decidePunch(open, t('2026-11-08T07:00:30Z'), ORG).action, 'ignore', 'double tap');
  assert.equal(decidePunch(open, t('2026-11-08T16:00:00Z'), ORG).action, 'clock-out');
  const closed = { clockIn: t('2026-11-08T07:00:00Z'), clockOut: t('2026-11-08T16:00:00Z') };
  assert.equal(decidePunch(closed, t('2026-11-08T16:00:00Z'), ORG).action, 'ignore', 'resent log');
  assert.equal(decidePunch(closed, t('2026-11-08T16:30:00Z'), ORG).action, 'clock-out', 'later punch replaces it');
});

test('handshake text and serial format', () => {
  assert.match(handshakeText('ABCD1234'), /^GET OPTION FROM: ABCD1234\n/);
  assert.ok(SERIAL.test('CJDE204960123'));
  assert.ok(!SERIAL.test('a/../b'));
  assert.ok(!SERIAL.test('ab'));
});

import { acceptOccurredAt } from '../src/utils/punch.js';

test('offline kiosk times: accepted within 48 hours, refused when future, ancient or invalid', () => {
  const now = new Date('2026-11-08T12:00:00Z');
  assert.equal(acceptOccurredAt('2026-11-08T07:00:00Z', now).toISOString(), '2026-11-08T07:00:00.000Z');
  assert.ok(acceptOccurredAt('2026-11-06T13:00:00Z', now));
  assert.equal(acceptOccurredAt('2026-11-06T11:00:00Z', now), null, 'older than 48h');
  assert.equal(acceptOccurredAt('2026-11-08T12:30:00Z', now), null, 'in the future');
  assert.equal(acceptOccurredAt('not a date', now), null);
});
