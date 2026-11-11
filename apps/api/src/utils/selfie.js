import { HttpError } from './http.js';

export const MAX_SELFIE_BYTES = 120 * 1024;
const bad = () => new HttpError(400, 'The selfie could not be read. Take it again.');

// Accepts a JPEG data URL from the browser. Anything else is refused, so this field cannot store arbitrary files.
export function parseSelfie(input) {
  const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/.exec(String(input ?? ''));
  if (!m || m[1].length > MAX_SELFIE_BYTES * 1.4) throw bad();
  const buf = Buffer.from(m[1], 'base64');
  if (buf.length < 200 || buf[0] !== 0xff || buf[1] !== 0xd8 || buf[2] !== 0xff) throw bad();
  if (buf.length > MAX_SELFIE_BYTES) throw new HttpError(400, 'The selfie is too large. Take it again.');
  return buf;
}
