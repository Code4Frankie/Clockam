import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReport, summarizeRuns } from '../src/seo/reportLogic.js';

const doc = (runId, url, pageType, issues, checkedAt = new Date(runId)) => ({ runId, url, pageType, status: 200, issues, checkedAt });
const iss = (code, severity = 'medium') => ({ code, severity, message: code });

const prev = [
  doc('2026-11-01', '/login', 'public', [iss('missing_description'), iss('missing_canonical')]),
  doc('2026-11-01', '/kiosk/a', 'private', []),
];
const cur = [
  doc('2026-11-08', '/login', 'public', [iss('missing_description'), iss('images_missing_alt')]),
  doc('2026-11-08', '/register', 'public', [iss('missing_description')]),
  doc('2026-11-08', '/kiosk/a', 'private', [iss('missing_noindex', 'high')]),
];

test('groups issues by page type, most severe first', () => {
  const r = buildReport({ current: cur, previous: prev });
  assert.deepEqual(r.groups.map((g) => g.pageType), ['private', 'public']);
  const pub = r.groups.find((g) => g.pageType === 'public');
  assert.equal(pub.pages, 2);
  assert.equal(pub.issues[0].code, 'missing_description');
  assert.equal(pub.issues[0].count, 2);
  assert.deepEqual(r.summary, { pages: 3, high: 1, medium: 3, low: 0 });
});

test('regressions are issues that are new since the previous run, and resolved ones are listed too', () => {
  const r = buildReport({ current: cur, previous: prev });
  const reg = r.regressions.map((x) => `${x.url}|${x.code}`).sort();
  assert.deepEqual(reg, ['/kiosk/a|missing_noindex', '/login|images_missing_alt', '/register|missing_description']);
  assert.deepEqual(r.resolved.map((x) => `${x.url}|${x.code}`), ['/login|missing_canonical']);
});

test('the first ever run has no regressions to compare with', () => {
  const r = buildReport({ current: cur, previous: [] });
  assert.deepEqual(r.regressions, []);
  assert.deepEqual(r.resolved, []);
});

test('summarizeRuns totals each run for the history chart', () => {
  const runs = summarizeRuns([...cur, ...prev]);
  const latest = runs.find((x) => x.runId === '2026-11-08');
  assert.deepEqual({ pages: latest.pages, high: latest.high, medium: latest.medium }, { pages: 3, high: 1, medium: 3 });
  assert.equal(runs.length, 2);
});
