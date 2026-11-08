import test from 'node:test';
import assert from 'node:assert/strict';
import { createBridge } from '../src/server.js';
import { createSimulator } from '../src/adapters/simulator.js';
import { loadAdapter } from '../src/adapters/index.js';

const ORIGIN = 'https://clockam.example';

async function start(adapter) {
  const server = createBridge({ adapter, allowedOrigins: [ORIGIN], adminToken: 'secret-token' });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  return { base, close: () => new Promise((r) => server.close(r)) };
}

test('identify returns the matched scanner ID with CORS for the kiosk origin only', async () => {
  const { base, close } = await start(createSimulator({ queue: ['12'] }));
  try {
    const ok = await fetch(`${base}/identify`, { method: 'POST', headers: { Origin: ORIGIN } });
    assert.equal(ok.status, 200);
    assert.deepEqual(await ok.json(), { scannerUserId: '12' });
    assert.equal(ok.headers.get('access-control-allow-origin'), ORIGIN);

    const none = await fetch(`${base}/identify`, { method: 'POST', headers: { Origin: ORIGIN } });
    assert.equal(none.status, 404, 'unrecognised finger');

    const evil = await fetch(`${base}/identify`, { method: 'POST', headers: { Origin: 'https://evil.example' } });
    assert.equal(evil.status, 403);
    assert.equal(evil.headers.get('access-control-allow-origin'), null);

    const pre = await fetch(`${base}/identify`, { method: 'OPTIONS', headers: { Origin: ORIGIN } });
    assert.equal(pre.status, 204);
    assert.equal(pre.headers.get('access-control-allow-private-network'), 'true');
  } finally { await close(); }
});

test('enrolment needs the admin token and a sane ID', async () => {
  const sim = createSimulator();
  const { base, close } = await start(sim);
  try {
    const post = (headers, body) => fetch(`${base}/enroll`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
    assert.equal((await post({}, { scannerUserId: '5' })).status, 401);
    assert.equal((await post({ 'x-bridge-admin': 'wrong-token' }, { scannerUserId: '5' })).status, 401);
    assert.equal((await post({ 'x-bridge-admin': 'secret-token' }, { scannerUserId: '../x' })).status, 400);
    assert.equal((await post({ 'x-bridge-admin': 'secret-token' }, { scannerUserId: '5' })).status, 201);
    assert.ok(sim._enrolled.has('5'));
    const del = await fetch(`${base}/enroll/5`, { method: 'DELETE', headers: { 'x-bridge-admin': 'secret-token' } });
    assert.deepEqual(await del.json(), { removed: true });
  } finally { await close(); }
});

test('reader failures surface as 502 and an empty admin token never authorises', async () => {
  const broken = { name: 'broken', isReady: async () => false, identify: async () => { throw new Error('reader unplugged'); }, enroll: async () => {}, remove: async () => false };
  const server = createBridge({ adapter: broken, allowedOrigins: [ORIGIN], adminToken: '' });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const r = await fetch(`${base}/identify`, { method: 'POST' });
    assert.equal(r.status, 502);
    assert.match((await r.json()).message, /reader unplugged/);
    const e = await fetch(`${base}/enroll`, { method: 'POST', headers: { 'x-bridge-admin': '' }, body: '{"scannerUserId":"1"}' });
    assert.equal(e.status, 401);
  } finally { await new Promise((r) => server.close(r)); }
});

test('real reader drivers say plainly that they are not built yet', () => {
  assert.throws(() => loadAdapter('futronic'), /Unknown scanner driver/);
  assert.throws(() => loadAdapter('nope'), /Unknown scanner driver/);
  assert.equal(loadAdapter('simulator', {}).name, 'simulator');
});
