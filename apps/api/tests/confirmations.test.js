import test from 'node:test';
import assert from 'node:assert/strict';
import { buildConfirmation, assertConfirmationValid } from '../src/agent/confirmations.js';

const ctx = { user: { _id: 'u1', organization: 'o1', role: 'admin' } };
const make = (over = {}) => ({
  ...buildConfirmation({ ctx, tool: 'disable_employee', input: { userId: 'abc' }, summary: { text: 't' }, ttlSeconds: 300 }),
  ...over,
});

test('buildConfirmation sets owner, hash and expiry', () => {
  const now = new Date('2026-11-05T10:00:00Z');
  const c = buildConfirmation({ ctx, tool: 't', input: { a: 1 }, summary: {}, ttlSeconds: 300, now });
  assert.equal(c.user, 'u1');
  assert.equal(c.organization, 'o1');
  assert.equal(c.expiresAt.toISOString(), '2026-11-05T10:05:00.000Z');
  assert.match(c.inputHash, /^[a-f0-9]{64}$/);
});

test('a fresh confirmation for the same user is valid', () => {
  assert.doesNotThrow(() => assertConfirmationValid(make(), ctx));
});

test('missing confirmation is rejected', () => {
  assert.throws(() => assertConfirmationValid(null, ctx), { status: 404 });
});

test('a different user cannot use it', () => {
  const other = { user: { _id: 'u2', organization: 'o1', role: 'admin' } };
  assert.throws(() => assertConfirmationValid(make(), other), { status: 403 });
});

test('a different organization cannot use it', () => {
  const other = { user: { _id: 'u1', organization: 'o2', role: 'admin' } };
  assert.throws(() => assertConfirmationValid(make(), other), { status: 403 });
});

test('an expired confirmation is rejected', () => {
  assert.throws(() => assertConfirmationValid(make({ expiresAt: new Date(Date.now() - 1000) }), ctx), { status: 410 });
});

test('tampered input is rejected', () => {
  assert.throws(() => assertConfirmationValid(make({ input: { userId: 'someone-else' } }), ctx), { status: 409 });
});
