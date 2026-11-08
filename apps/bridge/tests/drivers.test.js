import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createSecugen } from '../src/adapters/secugen.js';
import { createCommandAdapter } from '../src/adapters/command.js';
import { createTemplateStore } from '../src/templateStore.js';
import { loadAdapter } from '../src/adapters/index.js';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'bridge-'));

// A fake SecuGen service: a "finger" is a string; identical strings score 150, different ones 10.
function fakeService(scans, { nfiq = 2 } = {}) {
  const calls = [];
  const call = async (endpoint, params) => {
    calls.push(endpoint);
    if (endpoint === '/SGIFPCapture') {
      const next = scans.shift();
      if (next === 'timeout') return { ErrorCode: 54 };
      return { ErrorCode: 0, TemplateBase64: next, NFIQ: nfiq };
    }
    return { ErrorCode: 0, MatchingScore: params.Template1 === params.Template2 ? 150 : 10 };
  };
  return { call, calls };
}
const make = (scans, opts) => {
  const svc = fakeService(scans, opts);
  const store = createTemplateStore(tmp());
  return { svc, store, dev: createSecugen({ call: svc.call, store, minScore: 100 }) };
};

test('enrol needs two matching good scans, then identify finds the person', async () => {
  const { dev, store } = make(['A', 'A', 'A']);
  await dev.enroll('12');
  assert.deepEqual(store.ids(), ['12']);
  assert.equal(await dev.identify(), '12');
});

test('identify returns null for an unknown finger and when nobody is enrolled', async () => {
  const { dev } = make(['A', 'A', 'Z']);
  assert.equal(await dev.identify(), null, 'nobody enrolled');
  await dev.enroll('12');
  assert.equal(await dev.identify(), null, 'different finger');
});

test('enrolment refuses mismatched scans, poor quality and a finger already enrolled', async () => {
  let { dev } = make(['A', 'B']);
  await assert.rejects(dev.enroll('1'), /did not match/);
  ({ dev } = make(['A', 'A'], { nfiq: 5 }));
  await assert.rejects(dev.enroll('1'), /quality is too low/);
  const m = make(['A', 'A', 'A', 'A', 'A', 'A']);
  await m.dev.enroll('1');
  await assert.rejects(m.dev.enroll('2'), (e) => e.status === 409 && /already enrolled as ID 1/.test(e.message));
  await m.dev.enroll('1'); // re-enrolling the same ID is allowed
});

test('two people matching the same scan is refused instead of guessed', async () => {
  const { dev, store } = make(['A']);
  store.set('1', 'A');
  store.set('2', 'A');
  assert.equal(await dev.identify(), null);
});

test('no finger, licence problems and a missing service give clear errors', async () => {
  const { dev, store } = make(['timeout']);
  store.set('1', 'A');
  await assert.rejects(dev.identify(), (e) => e.status === 408 && /No finger/.test(e.message));
  const lic = createSecugen({ call: async () => ({ ErrorCode: 10003 }), store });
  await assert.rejects(lic.identify(), /SECUGEN_ORIGIN/);
});

test('template store keeps data between runs and removes it', () => {
  const dir = tmp();
  createTemplateStore(dir).set('7', 'TPL');
  const again = createTemplateStore(dir);
  assert.equal(again.get('7'), 'TPL');
  assert.equal(again.remove('7'), true);
  assert.equal(createTemplateStore(dir).ids().length, 0);
});

test('command driver passes actions without a shell and checks IDs', async () => {
  const seen = [];
  const run = async (file, args) => {
    seen.push([file, ...args]);
    if (args.includes('identify')) return 'noise\n{"scannerUserId":"12"}\n';
    if (args.includes('enroll')) return '{"ok":true}';
    return '{"removed":true}';
  };
  const dev = createCommandAdapter({ command: 'dp.exe', run });
  assert.equal(await dev.identify(), '12');
  await dev.enroll('5');
  assert.equal(await dev.remove('5'), true);
  assert.deepEqual(seen[1], ['dp.exe', 'enroll', '5']);
  await assert.rejects(dev.enroll('--help'), /Invalid scanner user ID/);
  await assert.rejects(dev.remove('a b'), /Invalid/);
  const bad = createCommandAdapter({ command: 'x', run: async () => 'not json' });
  await assert.rejects(bad.identify(), /not JSON/);
  assert.throws(() => createCommandAdapter({}), /BRIDGE_COMMAND/);
});

test('loading drivers by name', () => {
  assert.throws(() => loadAdapter('digitalpersona'), /helper program/);
  assert.throws(() => loadAdapter('command', {}), /BRIDGE_COMMAND/);
  assert.equal(loadAdapter('simulator', {}).name, 'simulator');
});
