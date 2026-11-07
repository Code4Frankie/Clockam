import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { dateStr, objectId, withDateRange, chatBodySchema, confirmBodySchema, isoDateTime } from '../src/agent/schemas.js';

test('dateStr accepts real dates only', () => {
  assert.ok(dateStr.safeParse('2026-11-05').success);
  assert.equal(dateStr.safeParse('2026-02-31').success, false);
  assert.equal(dateStr.safeParse('05/11/2026').success, false);
  assert.equal(dateStr.safeParse('2026-11-05T10:00:00Z').success, false);
});

test('objectId accepts 24 hex characters only', () => {
  assert.ok(objectId.safeParse('507f1f77bcf86cd799439011').success);
  assert.equal(objectId.safeParse('abc').success, false);
  assert.equal(objectId.safeParse({ $ne: null }).success, false);
});

test('withDateRange enforces order and maximum span', () => {
  const s = withDateRange(z.object({ from: dateStr, to: dateStr }).strict(), 62);
  assert.ok(s.safeParse({ from: '2026-11-01', to: '2026-11-05' }).success);
  assert.equal(s.safeParse({ from: '2026-11-05', to: '2026-11-01' }).success, false);
  assert.equal(s.safeParse({ from: '2026-01-01', to: '2026-12-31' }).success, false);
  assert.equal(s.safeParse({ from: '2026-11-01', to: '2026-11-05', extra: 1 }).success, false);
});

test('isoDateTime requires an offset', () => {
  assert.ok(isoDateTime.safeParse('2026-11-03T17:00:00+01:00').success);
  assert.ok(isoDateTime.safeParse('2026-11-03T16:00:00Z').success);
  assert.equal(isoDateTime.safeParse('2026-11-03 17:00').success, false);
});

test('chat body must start and end with a user message', () => {
  const u = (content) => ({ role: 'user', content });
  const a = (content) => ({ role: 'assistant', content });
  assert.ok(chatBodySchema.safeParse({ messages: [u('hi')] }).success);
  assert.ok(chatBodySchema.safeParse({ messages: [u('hi'), a('hello'), u('and?')] }).success);
  assert.equal(chatBodySchema.safeParse({ messages: [a('hello'), u('hi')] }).success, false);
  assert.equal(chatBodySchema.safeParse({ messages: [u('hi'), a('hello')] }).success, false);
  assert.equal(chatBodySchema.safeParse({ messages: [] }).success, false);
  assert.equal(chatBodySchema.safeParse({ messages: [u('x'.repeat(5000))] }).success, false);
});

test('confirm body validates the id', () => {
  assert.ok(confirmBodySchema.safeParse({ confirmationId: '507f1f77bcf86cd799439011' }).success);
  assert.equal(confirmBodySchema.safeParse({ confirmationId: { $ne: 1 } }).success, false);
});
