import crypto from 'node:crypto';

export const RESET_MINUTES = 30;

// The emailed link carries the token. Only its SHA-256 hash is stored, so a database leak cannot be used to reset anyone.
export const hashToken = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');

export function newResetToken() {
  const token = crypto.randomBytes(32).toString('base64url');
  return { token, hash: hashToken(token) };
}

export const resetExpiry = (now = new Date(), minutes = RESET_MINUTES) => new Date(now.getTime() + minutes * 60 * 1000);

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function resetEmail({ name, link, minutes = RESET_MINUTES }) {
  const text = `Hello ${name},\n\nUse this link to choose a new ClockAm password. It works once and expires in ${minutes} minutes:\n\n${link}\n\nIf you did not ask for this, ignore this email. Your password has not changed.\n\nClockAm by Frankiecode Solutions`;
  const html = `<p>Hello ${esc(name)},</p><p>Use this link to choose a new ClockAm password. It works once and expires in ${minutes} minutes:</p><p><a href="${esc(link)}">Choose a new password</a></p><p>If you did not ask for this, ignore this email. Your password has not changed.</p><p>ClockAm by Frankiecode Solutions</p>`;
  return { subject: 'Reset your ClockAm password', text, html };
}
