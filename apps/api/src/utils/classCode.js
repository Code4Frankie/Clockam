import crypto from 'node:crypto';

// The code shown in class changes every 30 seconds. It is derived from a secret that stays on the server,
// so a photo of the screen only works for a short time, and nobody can work out the next code.
export const WINDOW_MS = 30 * 1000;
const windowOf = (now) => Math.floor(now / WINDOW_MS);

export const newSessionSecret = () => crypto.randomBytes(32).toString('hex');

export function codeFor(secret, windowIndex) {
  const mac = crypto.createHmac('sha256', secret).update(String(windowIndex)).digest();
  return String(mac.readUInt32BE(0) % 1000000).padStart(6, '0');
}

export function currentCode(secret, now = Date.now()) {
  const w = windowOf(now);
  return { code: codeFor(secret, w), expiresInMs: (w + 1) * WINDOW_MS - now };
}

// The current code and the one before it are accepted, so a student who scans just before it changes still gets in.
// That means a code works for 30 to 60 seconds in total.
export function codeValid(secret, code, now = Date.now()) {
  const given = Buffer.from(String(code ?? ''));
  const w = windowOf(now);
  return [w, w - 1].some((x) => {
    const want = Buffer.from(codeFor(secret, x));
    return given.length === want.length && crypto.timingSafeEqual(given, want);
  });
}
