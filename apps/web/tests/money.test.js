import test from 'node:test';
import assert from 'node:assert/strict';
import { formatNaira, nairaToKobo, koboToNairaText } from '../src/money.js';

test('naira text converts to whole kobo and back', () => {
  assert.equal(nairaToKobo('12,500'), 1250000);
  assert.equal(nairaToKobo('₦ 0.1'), 10);
  assert.equal(nairaToKobo('19.99'), 1999);
  assert.equal(nairaToKobo('0'), 0);
  for (const bad of ['', 'abc', '-5', '1.234', '1e5', null]) assert.equal(nairaToKobo(bad), null, String(bad));
  assert.equal(koboToNairaText(1250000), '12500');
  assert.equal(koboToNairaText(1999), '19.99');
});

test('amounts are shown in naira', () => {
  assert.match(formatNaira(1250000), /^₦12,500$/);
  assert.match(formatNaira(1999), /^₦19\.99$/);
  assert.match(formatNaira(0), /^₦0$/);
});
