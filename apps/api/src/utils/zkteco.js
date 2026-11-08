// ZKTeco "push" (ADMS) helpers. Pure functions, so they are unit tested without a database or a device.
// The wire format below follows commonly used open-source servers. It has NOT been confirmed on an LX15.
import { zonedTimeToUtc } from './time.js';
export { decidePunch } from './punch.js';

export const SERIAL = /^[A-Za-z0-9]{4,32}$/;
const MAX_LINES = 500;
const MAX_AGE_MS = 14 * 24 * 3600 * 1000; // units that were offline can send a backlog, but not older than two weeks
const MAX_FUTURE_MS = 10 * 60 * 1000;

const STAMP = /^(\d{4})-(\d{2})-(\d{2}) ([01]\d|2[0-3]):([0-5]\d):([0-5]\d)$/;

/**
 * Reads the body of "POST /iclock/cdata?table=ATTLOG". One punch per line, tab separated:
 * PIN, "YYYY-MM-DD HH:MM:SS" (the unit's clock, read in the workplace time zone), then status/verify fields we ignore.
 */
export function parseAttLog(body, timeZone, now = new Date()) {
  const punches = [];
  let skipped = 0;
  const lines = String(body || '').split(/\r?\n/).filter((l) => l.trim());
  for (const line of lines.slice(0, MAX_LINES)) {
    const f = line.split('\t');
    const pin = (f[0] || '').trim();
    const m = STAMP.exec((f[1] || '').trim());
    if (!/^[A-Za-z0-9]{1,24}$/.test(pin) || !m) { skipped += 1; continue; }
    const [, y, mo, d, h, mi, s] = m;
    const base = zonedTimeToUtc(`${y}-${mo}-${d}`, `${h}:${mi}`, timeZone);
    const at = new Date(base.getTime() + Number(s) * 1000);
    if (Number.isNaN(at.getTime()) || at - now > MAX_FUTURE_MS || now - at > MAX_AGE_MS) { skipped += 1; continue; }
    punches.push({ pin, at });
  }
  skipped += Math.max(lines.length - MAX_LINES, 0);
  return { punches, skipped };
}

// The reply a unit expects when it first contacts the server.
export const handshakeText = (serial) =>
  [`GET OPTION FROM: ${serial}`, 'ATTLOGStamp=None', 'OPERLOGStamp=9999', 'ErrorDelay=60', 'Delay=30', 'TransTimes=00:00;14:05', 'TransInterval=1', 'TransFlag=TransData AttLog', 'Realtime=1', 'Encrypt=0', ''].join('\n');

