import test from 'node:test';
import assert from 'node:assert/strict';
import { codeFor, codeValid, currentCode, newSessionSecret, WINDOW_MS } from '../src/utils/classCode.js';
import { dedupeStudents, hashEnrolCode, importSchema, matricSchema, newEnrolCode, normalizeEnrolCode, normalizeMatric, placeholderEmail } from '../src/utils/students.js';
import { csvCell } from '../src/utils/csv.js';

test('class code is six digits, changes every 30 seconds and depends on the secret', () => {
  const s1 = newSessionSecret();
  const s2 = newSessionSecret();
  const t = 1_700_000_000_000;
  const { code, expiresInMs } = currentCode(s1, t);
  assert.match(code, /^\d{6}$/);
  assert.ok(expiresInMs > 0 && expiresInMs <= WINDOW_MS);
  assert.notEqual(currentCode(s1, t + WINDOW_MS).code, code);
  assert.notEqual(currentCode(s2, t).code, code);
  assert.equal(currentCode(s1, t).code, code, 'stable inside a window');
});

test('a code works for the current and previous window only, and rejects guesses', () => {
  const s = newSessionSecret();
  const t = 1_700_000_010_000;
  const code = currentCode(s, t).code;
  assert.ok(codeValid(s, code, t));
  assert.ok(codeValid(s, code, t + WINDOW_MS), 'next window still ok (grace)');
  assert.ok(!codeValid(s, code, t + 2 * WINDOW_MS + 1000), 'two windows later it is dead');
  assert.ok(!codeValid(s, codeFor(s, Math.floor(t / WINDOW_MS) + 1), t), 'future codes are not accepted');
  assert.ok(!codeValid(s, '000000', t) || code === '000000');
  assert.ok(!codeValid(s, '', t));
  assert.ok(!codeValid(s, undefined, t));
  assert.ok(!codeValid(s, '12345', t), 'wrong length');
  assert.ok(!codeValid(newSessionSecret(), code, t), 'other class secret');
});

test('matric numbers are normalised and validated', () => {
  assert.equal(normalizeMatric(' csc/2020/001 '), 'CSC/2020/001');
  assert.equal(matricSchema.parse(' csc/2020/001 '), 'CSC/2020/001');
  for (const bad of ['', 'ab', '/abc', 'a b c', '<script>', 'x'.repeat(40)]) assert.ok(!matricSchema.safeParse(bad).success, bad);
  assert.ok(matricSchema.safeParse('20/52HA074').success);
});

test('import list is validated, capped and de-duplicated', () => {
  assert.ok(importSchema.safeParse({ students: [{ name: 'Ada Obi', matric: 'csc/2020/001' }] }).success);
  assert.ok(!importSchema.safeParse({ students: [] }).success);
  assert.ok(!importSchema.safeParse({ students: [{ name: 'A', matric: 'CSC/2020/001' }] }).success, 'short name');
  assert.ok(!importSchema.safeParse({ students: [{ name: 'Ada Obi', matric: 'CSC/2020/001', role: 'owner' }] }).success, 'no extra fields');
  assert.ok(!importSchema.safeParse({ students: Array(2001).fill({ name: 'Ada Obi', matric: 'CSC/2020/001' }) }).success);
  const { unique, duplicates } = dedupeStudents([{ matric: 'A1X' }, { matric: 'B2X' }, { matric: 'A1X' }]);
  assert.equal(unique.length, 2);
  assert.deepEqual(duplicates, ['A1X']);
  assert.notEqual(placeholderEmail('CSC/1'), placeholderEmail('CSC/2'));
  assert.match(placeholderEmail('CSC/1'), /@students\.clockam\.invalid$/);
});

test('enrolment codes are 8 look-alike-free characters and compared without punctuation or case', () => {
  const c = newEnrolCode();
  assert.match(c, /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
  assert.notEqual(newEnrolCode(), c);
  assert.equal(normalizeEnrolCode(' abcd-efgh '), 'ABCDEFGH');
  assert.equal(hashEnrolCode('abcd-efgh'), hashEnrolCode('ABCDEFGH'));
  assert.notEqual(hashEnrolCode('ABCD-EFGH'), hashEnrolCode('ABCD-EFGJ'));
});

test('csv cells are quoted and spreadsheet formulas are defused', () => {
  assert.equal(csvCell('Ada "Ace" Obi'), '"Ada ""Ace"" Obi"');
  assert.equal(csvCell('=HYPERLINK("x")'), `"'=HYPERLINK(""x"")"`);
  assert.equal(csvCell(42), '"42"');
  assert.equal(csvCell(null), '""');
});

import { courseScope, sessionScope, seesAll } from '../src/utils/scope.js';

test('lecturers see only their own courses and classes; owners and admins see all', () => {
  assert.deepEqual(courseScope({ role: 'owner', _id: 'u1' }), {});
  assert.deepEqual(courseScope({ role: 'admin', _id: 'u1' }), {});
  assert.deepEqual(courseScope({ role: 'manager', _id: 'u2' }), { createdBy: 'u2' });
  assert.deepEqual(sessionScope({ role: 'manager', _id: 'u2' }), { startedBy: 'u2' });
  assert.ok(!seesAll({ role: 'employee' }));
  assert.deepEqual(courseScope({ role: 'employee', _id: 'u3' }), { createdBy: 'u3' }, 'unknown roles get the narrow view');
});
