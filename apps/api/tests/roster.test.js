import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMatrics, splitPresent, courseReport } from '../src/utils/roster.js';
import { parseSelfie } from '../src/utils/selfie.js';

test('matric numbers are read from pasted text, capitalised and de-duplicated', () => {
  const { matrics, invalid } = parseMatrics('csc/2020/001, CSC/2020/002\ncsc/2020/001;  x ;CSC/2020/003');
  assert.deepEqual(matrics, ['CSC/2020/001', 'CSC/2020/002', 'CSC/2020/003']);
  assert.deepEqual(invalid, ['x']);
  assert.deepEqual(parseMatrics('').matrics, []);
});

test('present and absent are split without losing roster order', () => {
  const roster = [{ id: 1, name: 'A', matric: 'A1X' }, { id: 2, name: 'B', matric: 'B1X' }, { id: 3, name: 'C', matric: 'C1X' }];
  const { present, absent } = splitPresent(roster, ['3', 1]);
  assert.deepEqual(present.map((s) => s.id), [1, 3]);
  assert.deepEqual(absent.map((s) => s.id), [2]);
});

test('course report gives attended, held and percent, and copes with no classes', () => {
  const roster = [{ id: 1, name: 'A', matric: 'A1X' }, { id: 2, name: 'B', matric: 'B1X' }];
  const rows = courseReport(roster, 4, new Map([['1', 3]]));
  assert.deepEqual(rows.map((r) => [r.attended, r.percent]), [[3, 75], [0, 0]]);
  assert.equal(courseReport(roster, 0, new Map())[0].percent, 0);
});

const jpeg = (n = 800) => `data:image/jpeg;base64,${Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(n, 1)]).toString('base64')}`;

test('selfie must be a small real JPEG data URL', () => {
  assert.ok(parseSelfie(jpeg()).length > 500);
  for (const bad of [undefined, '', 'data:image/png;base64,AAAA', 'data:text/html;base64,PHNjcmlwdD4=', 'not a data url', jpeg(10), jpeg(200 * 1024)]) {
    assert.throws(() => parseSelfie(bad), /selfie/i, String(bad).slice(0, 30));
  }
  const notJpeg = `data:image/jpeg;base64,${Buffer.alloc(900, 7).toString('base64')}`;
  assert.throws(() => parseSelfie(notJpeg), /selfie/i);
});
