import test from 'node:test';
import assert from 'node:assert/strict';
import { assertAllowedNetwork, ipAllowed, isValidNetworkEntry, normalizeIp } from '../src/utils/network.js';
import { nearLimit } from '../src/utils/geo.js';
import { settingsSchema, mergeSettings } from '../src/utils/orgSettings.js';

test('network entries: single addresses and ranges no wider than /16', () => {
  for (const ok of ['41.58.10.7', '41.58.10.0/24', '41.58.0.0/16', '2001:db8::1']) assert.ok(isValidNetworkEntry(ok), ok);
  for (const bad of ['', 'hello', '41.58.10.256', '41.58.0.0/8', '0.0.0.0/0', '41.58.10.0/33', '41.58.10.0/', '10.0.0.0/abc']) assert.ok(!isValidNetworkEntry(bad), bad);
});

test('matching: exact addresses, ranges, IPv4-mapped IPv6, and garbage', () => {
  assert.equal(normalizeIp('::ffff:41.58.10.7'), '41.58.10.7');
  assert.ok(ipAllowed('::ffff:41.58.10.7', ['41.58.10.7']));
  assert.ok(ipAllowed('41.58.10.200', ['41.58.10.0/24']));
  assert.ok(!ipAllowed('41.58.11.1', ['41.58.10.0/24']));
  assert.ok(ipAllowed('41.58.99.1', ['41.58.0.0/16']));
  assert.ok(ipAllowed('2001:db8::1', ['2001:DB8::1']));
  assert.ok(!ipAllowed('2001:db8::2', ['41.58.10.0/24']));
  assert.ok(!ipAllowed(undefined, ['41.58.10.7']));
  assert.ok(!ipAllowed('not an ip', ['41.58.10.7']));
});

test('no rule means anyone; a rule fails closed when the address is missing', () => {
  assert.doesNotThrow(() => assertAllowedNetwork({}, undefined));
  assert.doesNotThrow(() => assertAllowedNetwork({ allowedNetworks: [] }, '1.2.3.4'));
  assert.throws(() => assertAllowedNetwork({ allowedNetworks: ['41.58.10.7'] }, '1.2.3.4'), /workplace Wi-Fi/);
  assert.throws(() => assertAllowedNetwork({ allowedNetworks: ['41.58.10.7'] }, undefined), /workplace Wi-Fi/);
  assert.doesNotThrow(() => assertAllowedNetwork({ allowedNetworks: ['41.58.10.7'] }, '41.58.10.7'));
});

test('near-limit flag only when the location check is on and the person is 80% or more of the way out', () => {
  const org = { geofence: { enabled: true, lat: 6.5244, lng: 3.3792, radiusMeters: 100 } };
  assert.equal(nearLimit(org, { lat: 6.5244, lng: 3.3792 }), false);
  assert.equal(nearLimit(org, { lat: 6.52440 + 0.00085, lng: 3.3792 }), true); // about 94 m
  assert.equal(nearLimit({ geofence: { enabled: false } }, { lat: 0, lng: 0 }), false);
  assert.equal(nearLimit(org, undefined), false);
});

test('allowed networks are validated and saved with the other settings', () => {
  assert.ok(settingsSchema.safeParse({ allowedNetworks: ['41.58.10.7', '41.58.20.0/24'] }).success);
  assert.ok(settingsSchema.safeParse({ allowedNetworks: [] }).success, 'empty turns the rule off');
  assert.ok(!settingsSchema.safeParse({ allowedNetworks: ['everywhere'] }).success);
  assert.ok(!settingsSchema.safeParse({ allowedNetworks: Array(11).fill('41.58.10.7') }).success);
  const base = { timezone: 'Africa/Lagos', workStart: '08:00', workEnd: '17:00', graceMinutes: 15, geofence: { enabled: false } };
  assert.deepEqual(mergeSettings(base, { allowedNetworks: ['41.58.10.7'] }).allowedNetworks, ['41.58.10.7']);
  assert.deepEqual(mergeSettings({ ...base, allowedNetworks: ['41.58.10.7'] }, { workStart: '09:00' }).allowedNetworks, ['41.58.10.7']);
});
