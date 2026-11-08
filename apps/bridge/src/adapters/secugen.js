import http from 'node:http';
import https from 'node:https';
import { createTemplateStore } from '../templateStore.js';

const fail = (status, message) => Object.assign(new Error(message), { status });

// SecuGen's own error codes that a user can act on. Others are passed through with their number.
const CODE_HELP = {
  54: [408, 'No finger detected. Place a finger on the reader and try again.'],
  55: [502, 'SecuGen reader not found. Check the USB cable and the driver.'],
  57: [422, 'The scan was not usable. Clean the glass and press firmly.'],
  101: [422, 'Too few fingerprint details. Try again with a steadier, firmer press.'],
  10001: [502, 'SecuGen WebAPI licence error. Set SECUGEN_LICENCE or use the 60-day trial.'],
  10002: [502, 'SecuGen WebAPI says this domain is not licensed. Check SECUGEN_ORIGIN.'],
  10003: [502, 'SecuGen WebAPI licence expired, or it did not receive an Origin. Check SECUGEN_ORIGIN.'],
  10004: [502, 'SecuGen WebAPI licence expired, or it did not receive an Origin. Check SECUGEN_ORIGIN.'],
};

// Sends one form-encoded request to the SecuGen WebAPI client service (SgiBioSrv) on this PC.
export function makeCall({ baseUrl, origin, insecureLocalhost }) {
  const u = new URL(baseUrl);
  if (!['localhost', '127.0.0.1', '::1'].includes(u.hostname)) throw new Error('The SecuGen service must be on this PC (localhost)');
  const secure = u.protocol === 'https:';
  const agent = secure && insecureLocalhost ? new https.Agent({ rejectUnauthorized: false }) : undefined;
  const lib = secure ? https : http;

  return (endpoint, params, timeoutMs) =>
    new Promise((resolve, reject) => {
      const body = new URLSearchParams(params).toString();
      const req = lib.request(
        {
          hostname: u.hostname, port: u.port, path: endpoint, method: 'POST', agent, timeout: timeoutMs,
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body), ...(origin ? { Origin: origin } : {}) },
        },
        (res) => {
          const chunks = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => {
            try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
            catch { reject(fail(502, 'SecuGen service returned something unreadable')); }
          });
        }
      );
      req.on('timeout', () => req.destroy(Object.assign(new Error('SecuGen service did not answer'), { code: 'ETIMEDOUT' })));
      req.on('error', (e) => reject(fail(502, e.code === 'ECONNREFUSED' ? 'SecuGen WebAPI service (SgiBioSrv) is not running on this PC' : `SecuGen service: ${e.message}`)));
      req.end(body);
    });
}

function check(res) {
  const code = Number(res?.ErrorCode ?? -1);
  if (code === 0) return res;
  const [status, msg] = CODE_HELP[code] || [502, `SecuGen error ${code}`];
  throw fail(status, msg);
}

/**
 * Hamster Plus / Pro through the SecuGen WebAPI client service.
 * Matching (1:N) is done by asking the service to score the new scan against each stored template.
 */
export function createSecugen({
  call = makeCall({ baseUrl: process.env.SECUGEN_URL || 'https://localhost:8000', origin: process.env.SECUGEN_ORIGIN, insecureLocalhost: process.env.SECUGEN_INSECURE_LOCALHOST === 'true' }),
  store = createTemplateStore(),
  minScore = Number(process.env.SECUGEN_MIN_SCORE || 100), // 0-199 scale. A starting point: tune it on your own staff before relying on it
  captureTimeoutMs = 10000,
  maxNfiq = 3, // 1 is best, 5 is worst
  licence = process.env.SECUGEN_LICENCE || '',
} = {}) {
  let lock = Promise.resolve();
  const exclusive = (fn) => { const run = lock.then(fn, fn); lock = run.catch(() => {}); return run; }; // one finger on the glass at a time

  const lic = licence ? { Licstr: licence } : {};

  async function capture() {
    const res = check(await call('/SGIFPCapture', { Timeout: captureTimeoutMs, TemplateFormat: 'ISO', ...lic }, captureTimeoutMs + 5000));
    if (!res.TemplateBase64) throw fail(502, 'SecuGen service returned no template');
    return { template: res.TemplateBase64, nfiq: Number(res.NFIQ) || 0 };
  }

  async function score(a, b) {
    const res = await call('/SGIMatchScore', { Template1: a, Template2: b, TemplateFormat: 'ISO', ...lic }, 8000);
    if (Number(res?.ErrorCode) === 106) return 0; // "match failed" simply means no match
    return Number(check(res).MatchingScore) || 0;
  }

  async function scoreAll(template, ids) {
    const out = [];
    for (let i = 0; i < ids.length; i += 8) {
      const batch = ids.slice(i, i + 8);
      const scores = await Promise.all(batch.map((id) => score(template, store.get(id))));
      batch.forEach((id, j) => out.push({ id, score: scores[j] }));
    }
    return out.sort((x, y) => y.score - x.score);
  }

  return {
    name: 'secugen',
    async isReady() { return true; }, // there is no harmless ping; problems show up when a finger is scanned

    identify: () => exclusive(async () => {
      const ids = store.ids();
      if (!ids.length) return null;
      const { template } = await capture();
      const hits = (await scoreAll(template, ids)).filter((s) => s.score >= minScore);
      if (hits.length !== 1) return null; // none, or two people match: refuse rather than guess
      return hits[0].id;
    }),

    enroll: (id) => exclusive(async () => {
      const first = await capture();
      if (first.nfiq > maxNfiq) throw fail(422, 'The scan quality is too low. Clean the glass, press firmly and try again.');
      const second = await capture();
      if ((await score(first.template, second.template)) < minScore) throw fail(422, 'The two scans did not match. Use the same finger both times.');
      const clash = (await scoreAll(first.template, store.ids().filter((x) => x !== id))).find((s) => s.score >= minScore);
      if (clash) throw fail(409, `This finger is already enrolled as ID ${clash.id}`);
      store.set(id, first.template);
    }),

    remove: async (id) => store.remove(id),
  };
}
