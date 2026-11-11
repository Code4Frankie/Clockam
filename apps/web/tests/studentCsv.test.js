import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, parseStudents } from '../src/studentCsv.js';

test('reads a normal export with header, BOM and Windows line endings', () => {
  const { students, problems } = parseStudents('﻿Name,Matric Number,Department\r\nAda Obi,CSC/2020/001,Computer Science\r\nTunde Bello,CSC/2020/002,\r\n');
  assert.deepEqual(problems, []);
  assert.deepEqual(students, [{ name: 'Ada Obi', matric: 'CSC/2020/001', department: 'Computer Science' }, { name: 'Tunde Bello', matric: 'CSC/2020/002' }]);
});

test('quoted cells, commas inside names and semicolon files', () => {
  assert.deepEqual(parseCsv('a,"b, c","d ""q"""\n'), [['a', 'b, c', 'd "q"']]);
  const { students } = parseStudents('name;matric\nAda Obi;CSC/1/001\n');
  assert.equal(students[0].matric, 'CSC/1/001');
});

test('no header: first column name, second matric; blank lines ignored', () => {
  const { students } = parseStudents('Ada Obi,CSC/2020/001\n\n,\nTunde Bello,CSC/2020/002');
  assert.equal(students.length, 2);
});

test('bad rows are reported with their row number, good rows still load', () => {
  const { students, problems } = parseStudents('Name,Matric\nAda Obi,CSC/2020/001\nX,CSC/2020/002\nBen Ade,no spaces here\n');
  assert.equal(students.length, 1);
  assert.equal(problems.length, 2);
  assert.match(problems[0], /Row 3/);
  assert.match(problems[1], /Row 4/);
});

test('header without the needed columns is rejected', () => {
  const { students, problems } = parseStudents('Surname,Phone\nObi,0803\n');
  assert.equal(students.length, 0);
  assert.match(problems[0], /Matric/);
  assert.deepEqual(parseStudents('').students, []);
});

import { matricsFromCsv } from '../src/studentCsv.js';

test('course list: takes the matric column from a CSV, or the first column if there is no header', () => {
  assert.equal(matricsFromCsv('Name,Matric Number\nAda Obi,CSC/1/001\nTunde,CSC/1/002\n'), 'CSC/1/001\nCSC/1/002');
  assert.equal(matricsFromCsv('CSC/1/001\nCSC/1/002\n'), 'CSC/1/001\nCSC/1/002');
  assert.equal(matricsFromCsv('Matric\r\nCSC/1/001\r\n'), 'CSC/1/001');
  assert.equal(matricsFromCsv(''), '');
});
