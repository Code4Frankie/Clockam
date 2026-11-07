import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { tools, toolDefinitionsFor, executeTool, executeConfirmed } from '../src/agent/toolRegistry.js';
import { defineTool, ANY, ADMIN } from '../src/agent/defineTool.js';
import { buildConfirmation } from '../src/agent/confirmations.js';

const ID = '507f1f77bcf86cd799439011';
const ctxFor = (role, extra = {}) => ({
  user: { _id: 'u1', organization: 'o1', role },
  org: { timezone: 'Africa/Lagos', workStart: '08:00', workEnd: '17:00' },
  isPlatformAdmin: false,
  ...extra,
});

function makeDeps(extraTools = {}) {
  const logs = [];
  const created = [];
  return {
    logs,
    created,
    tools: { ...tools, ...extraTools },
    logger: async (e) => logs.push(e),
    confirmations: {
      create: async (ctx, tool, input, summary) => {
        created.push({ tool, input, summary });
        return { id: 'conf1', expiresAt: new Date(Date.now() + 60000) };
      },
    },
  };
}

/* ---------- tool catalogue ---------- */

test('every tool is well formed and none can clock people in or out', () => {
  const names = Object.keys(tools);
  assert.equal(new Set(names).size, names.length);
  for (const t of Object.values(tools)) {
    assert.ok(t.label && t.description && t.jsonSchema && typeof t.run === 'function', t.name);
    assert.ok(!/clock.*(in|out)$/i.test(t.name) || t.name === 'list_missing_clockouts' || t.name === 'propose_attendance_correction', t.name);
  }
  assert.throws(() => defineTool({ name: 'clock_in', label: 'x', description: 'x', roles: ANY, input: z.object({}), jsonSchema: {}, run() {} }));
});

test('all write tools are confirmation-gated and admin-only', () => {
  const writes = ['propose_attendance_correction', 'disable_employee', 'enable_employee', 'reset_fingerprints'];
  for (const n of writes) {
    assert.equal(tools[n].confirm, true, n);
    assert.deepEqual(tools[n].roles, ADMIN, n);
    assert.equal(typeof tools[n].summarize, 'function', n);
  }
  const readOnly = Object.values(tools).filter((t) => !writes.includes(t.name));
  assert.ok(readOnly.every((t) => !t.confirm));
});

test('each role is shown only the tools it may use', () => {
  const names = (role, extra) => toolDefinitionsFor(ctxFor(role, extra)).map((t) => t.name);
  assert.deepEqual(names('employee'), ['get_my_status_today', 'get_my_attendance']);
  assert.ok(names('manager').includes('find_employee'));
  assert.ok(!names('manager').includes('disable_employee'));
  assert.ok(names('admin').includes('reset_fingerprints'));
  assert.ok(!names('admin').includes('get_seo_report'));
  assert.ok(names('employee', { isPlatformAdmin: true }).includes('get_seo_report'));
});

/* ---------- permissions ---------- */

test('employee cannot call manager tools (hidden as not_available and logged as denied)', async () => {
  const d = makeDeps();
  const r = await executeTool(ctxFor('employee'), 'get_today_overview', {}, d);
  assert.equal(r.error, 'not_available');
  assert.equal(d.logs[0].status, 'denied');
});

test('manager cannot call admin write tools', async () => {
  const d = makeDeps();
  const r = await executeTool(ctxFor('manager'), 'disable_employee', { userId: ID }, d);
  assert.equal(r.error, 'not_available');
  assert.equal(d.created.length, 0);
});

test('unknown tools and prototype names are refused', async () => {
  const d = makeDeps();
  for (const n of ['does_not_exist', 'constructor', '__proto__', 'toString']) {
    assert.equal((await executeTool(ctxFor('admin'), n, {}, d)).error, 'not_available', n);
  }
});

test('platform tools need the platform-admin flag, even for the owner', async () => {
  const d = makeDeps();
  assert.equal((await executeTool(ctxFor('owner'), 'get_seo_report', {}, d)).error, 'not_available');
});

/* ---------- input validation ---------- */

test('invalid input is rejected before anything runs', async () => {
  const d = makeDeps();
  const cases = [
    ['get_attendance', { from: '2026-11-05', to: '2026-11-01' }], // reversed
    ['get_attendance', { from: '2026-01-01', to: '2026-12-31' }], // too long
    ['get_attendance', { from: 'yesterday', to: 'today' }],
    ['get_attendance', { from: '2026-11-01', to: '2026-11-05', userId: 'nope' }],
    ['find_employee', {}],
    ['find_employee', { query: 'x'.repeat(100) }],
    ['disable_employee', { userId: 'not-an-id' }],
    ['get_my_status_today', { extra: true }],
  ];
  for (const [name, input] of cases) {
    const r = await executeTool(ctxFor('admin'), name, input, d);
    assert.equal(r.error, 'invalid_input', `${name} ${JSON.stringify(input)}`);
  }
  assert.ok(d.logs.every((l) => l.status === 'invalid_input'));
});

test('NoSQL operator injection is rejected', async () => {
  const d = makeDeps();
  const attempts = [
    ['find_employee', { query: { $regex: '.*' } }],
    ['get_attendance', { from: '2026-11-01', to: '2026-11-05', userId: { $ne: null } }],
    ['disable_employee', { userId: { $gt: '' } }],
    ['get_attendance', { from: { $gte: '2020-01-01' }, to: '2026-11-05' }],
  ];
  for (const [name, input] of attempts) {
    const r = await executeTool(ctxFor('admin'), name, input, d);
    assert.equal(r.error, 'invalid_input', name);
  }
});

/* ---------- confirmation gating (fake write tool, no database) ---------- */

function fakeWriteTool() {
  const state = { ran: 0, summarized: 0 };
  const tool = defineTool({
    name: 'fake_write',
    label: 'x',
    description: 'x',
    roles: ADMIN,
    confirm: true,
    input: z.object({ n: z.number() }).strict(),
    jsonSchema: { type: 'object' },
    async summarize(ctx, v) { state.summarized += 1; return { text: `Do ${v.n}` }; },
    async run(ctx, v) { state.ran += 1; return { done: true, n: v.n }; },
  });
  return { tool, state };
}

test('write tools return pending_confirmation and do NOT execute', async () => {
  const { tool, state } = fakeWriteTool();
  const d = makeDeps({ fake_write: tool });
  const r = await executeTool(ctxFor('admin'), 'fake_write', { n: 5 }, d);
  assert.equal(r.status, 'pending_confirmation');
  assert.equal(r.confirmationId, 'conf1');
  assert.equal(r.summary, 'Do 5');
  assert.equal(state.ran, 0);
  assert.equal(state.summarized, 1);
  assert.equal(d.created[0].tool, 'fake_write');
  assert.equal(d.logs.at(-1).status, 'pending_confirmation');
});

test('confirmed execution runs once with the stored input and logs it', async () => {
  const { tool, state } = fakeWriteTool();
  const d = makeDeps({ fake_write: tool });
  const ctx = ctxFor('admin');
  const record = buildConfirmation({ ctx, tool: 'fake_write', input: { n: 7 }, summary: {}, ttlSeconds: 300 });
  const out = await executeConfirmed(ctx, record, d);
  assert.deepEqual(out, { done: true, n: 7 });
  assert.equal(state.ran, 1);
  assert.equal(d.logs.at(-1).status, 'confirmed');
});

test('confirmed execution refuses expired, foreign, tampered and de-privileged requests', async () => {
  const { tool, state } = fakeWriteTool();
  const d = makeDeps({ fake_write: tool });
  const ctx = ctxFor('admin');
  const base = buildConfirmation({ ctx, tool: 'fake_write', input: { n: 1 }, summary: {}, ttlSeconds: 300 });

  await assert.rejects(executeConfirmed(ctx, { ...base, expiresAt: new Date(Date.now() - 1) }, d), { status: 410 });
  await assert.rejects(executeConfirmed({ ...ctx, user: { ...ctx.user, _id: 'u9' } }, base, d), { status: 403 });
  await assert.rejects(executeConfirmed(ctx, { ...base, input: { n: 999 } }, d), { status: 409 });
  // the user lost admin rights between proposal and confirmation
  await assert.rejects(executeConfirmed(ctxFor('manager'), base, d), { status: 403 });
  // a confirmation can only run a tool that is actually a write tool
  await assert.rejects(executeConfirmed(ctx, { ...base, tool: 'get_my_status_today' }, d), { status: 403 });
  assert.equal(state.ran, 0);
});

/* ---------- output safety ---------- */

test('secret fields in tool output are never returned', async () => {
  const leaky = defineTool({
    name: 'leaky', label: 'x', description: 'x', roles: ANY, input: z.object({}).strict(), jsonSchema: {},
    async run() { return { employee: { name: 'Ada', passwordHash: '$2a$12$abc' } }; },
  });
  const d = makeDeps({ leaky });
  const r = await executeTool(ctxFor('employee'), 'leaky', {}, d);
  assert.equal(r.error, 'tool_error');
  assert.ok(!JSON.stringify(r).includes('$2a$'));
  assert.equal(d.logs.at(-1).status, 'error');
});

test('unexpected errors are hidden from the model; known 4xx messages are passed on', async () => {
  const boom = defineTool({
    name: 'boom', label: 'x', description: 'x', roles: ANY, input: z.object({}).strict(), jsonSchema: {},
    async run() { throw new Error('connect ECONNREFUSED mongodb://user:secret@host'); },
  });
  const d = makeDeps({ boom });
  const origError = console.error;
  console.error = () => {};
  const r = await executeTool(ctxFor('employee'), 'boom', {}, d);
  console.error = origError;
  assert.equal(r.error, 'tool_error');
  assert.ok(!r.message.includes('secret'));
});
