import { execFile } from 'node:child_process';

const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/;
const fail = (status, message) => Object.assign(new Error(message), { status });

/**
 * Runs a helper program you provide, one call per action, no shell involved:
 *   helper identify          -> prints {"scannerUserId":"12"} or {"scannerUserId":null}
 *   helper enroll <id>       -> prints {"ok":true}
 *   helper remove <id>       -> prints {"removed":true}
 * Use it for readers that only ship a native SDK (for example DigitalPersona U.are.U).
 * A non-zero exit code means failure, and the first line on stderr is shown to the person.
 */
export function createCommandAdapter({ command, args = [], timeoutMs = 30000, run } = {}) {
  if (!command) throw new Error('BRIDGE_COMMAND is not set');
  const exec = run || ((file, a) => new Promise((resolve, reject) => {
    execFile(file, a, { timeout: timeoutMs, windowsHide: true, maxBuffer: 64 * 1024 }, (err, stdout, stderr) => {
      if (err) return reject(fail(err.killed ? 408 : 502, (String(stderr).split('\n')[0] || err.message).slice(0, 200)));
      resolve(String(stdout));
    });
  }));

  async function json(action, ...rest) {
    const out = (await exec(command, [...args, action, ...rest])).trim().split('\n').filter(Boolean).pop() || '';
    try { return JSON.parse(out); } catch { throw fail(502, 'The scanner helper printed something that is not JSON'); }
  }
  const needId = (id) => { if (!ID.test(String(id))) throw fail(400, 'Invalid scanner user ID'); };

  return {
    name: 'command',
    async isReady() { return true; },
    async identify() { const r = await json('identify'); return r.scannerUserId ? String(r.scannerUserId) : null; },
    async enroll(id) { needId(id); const r = await json('enroll', String(id)); if (!r.ok) throw fail(422, r.message || 'Enrolment failed'); },
    async remove(id) { needId(id); return !!(await json('remove', String(id))).removed; },
  };
}
