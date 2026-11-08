import test from 'node:test';
import assert from 'node:assert/strict';
import { createQueue, classifyFailure, isOfflineFailure, MAX_QUEUED } from '../src/offlineQueue.js';

const fakeStorage = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v) };
};

test('items are kept in order and flushed oldest first', async () => {
  const q = createQueue(fakeStorage());
  assert.ok(q.add({ scannerUserId: '1', at: 'a' }));
  assert.ok(q.add({ scannerUserId: '2', at: 'b' }));
  const order = [];
  const r = await q.flush(async (i) => { order.push(i.scannerUserId); return 'sent'; });
  assert.deepEqual(order, ['1', '2']);
  assert.deepEqual(r, { sent: 2, dropped: 0, remaining: 0 });
});

test('flush stops at the first retry and keeps the rest in order', async () => {
  const q = createQueue(fakeStorage());
  ['1', '2', '3'].forEach((id) => q.add({ scannerUserId: id, at: id }));
  let n = 0;
  const r = await q.flush(async () => { n += 1; return n === 1 ? 'sent' : 'retry'; });
  assert.deepEqual(r, { sent: 1, dropped: 0, remaining: 2 });
  const seen = [];
  await q.flush(async (i) => { seen.push(i.scannerUserId); return 'drop'; });
  assert.deepEqual(seen, ['2', '3']);
});

test('queue refuses more than the limit and survives corrupt or missing storage', () => {
  const q = createQueue(fakeStorage());
  for (let i = 0; i < MAX_QUEUED; i += 1) assert.ok(q.add({ scannerUserId: String(i), at: 'x' }));
  assert.equal(q.add({ scannerUserId: 'extra', at: 'x' }), false);
  const bad = fakeStorage();
  bad.setItem('clockam.kiosk.queue', '{not json');
  assert.equal(createQueue(bad).size(), 0);
  assert.equal(createQueue(null).add({ a: 1 }), false);
  assert.equal(createQueue(null).size(), 0);
});

test('failures are classified so good punches are kept and impossible ones dropped', () => {
  assert.equal(classifyFailure(new TypeError('Failed to fetch')), 'retry');
  assert.equal(classifyFailure({ status: 503 }), 'retry');
  assert.equal(classifyFailure({ status: 401 }), 'retry');
  assert.equal(classifyFailure({ status: 404 }), 'drop');
  assert.equal(classifyFailure({ status: 400 }), 'drop');
  assert.equal(isOfflineFailure(new TypeError('Failed to fetch')), true);
  assert.equal(isOfflineFailure({ status: 502 }), true);
  assert.equal(isOfflineFailure({ status: 404 }), false);
  assert.equal(isOfflineFailure({ status: 500 }), false);
});
