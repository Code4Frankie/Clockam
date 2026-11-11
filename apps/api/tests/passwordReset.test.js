import test from 'node:test';
import assert from 'node:assert/strict';
import { hashToken, newResetToken, resetExpiry, resetEmail } from '../src/utils/passwordReset.js';
import { mailConfigured, sendMail } from '../src/utils/mailer.js';
import { whyCannotEdit } from '../src/utils/permissions.js';

test('reset tokens are random, long, and stored only as a hash', () => {
  const a = newResetToken();
  const b = newResetToken();
  assert.notEqual(a.token, b.token);
  assert.ok(a.token.length >= 43);
  assert.equal(a.hash, hashToken(a.token));
  assert.notEqual(a.hash, a.token);
  assert.equal(resetExpiry(new Date('2026-11-08T10:00:00Z')).toISOString(), '2026-11-08T10:30:00.000Z');
});

test('reset email escapes the name and carries the link', () => {
  const m = resetEmail({ name: '<b>Eve</b>', link: 'https://x.test/reset-password?token=abc' });
  assert.ok(!m.html.includes('<b>Eve</b>'));
  assert.ok(m.html.includes('&lt;b&gt;Eve'));
  assert.ok(m.text.includes('https://x.test/reset-password?token=abc'));
});

test('mail is only "configured" when it can really send', () => {
  assert.equal(mailConfigured({ provider: 'none' }), false);
  assert.equal(mailConfigured({ provider: 'resend', resendApiKey: '', from: 'a@b.c' }), false);
  assert.equal(mailConfigured({ provider: 'resend', resendApiKey: 'k', from: 'a@b.c' }), true);
  assert.equal(mailConfigured({ provider: 'console', nodeEnv: 'development' }), true);
  assert.equal(mailConfigured({ provider: 'console', nodeEnv: 'production' }), false, 'never print reset links in production logs');
});

test('Resend request is built correctly and failures surface', async () => {
  const cfg = { provider: 'resend', resendApiKey: 'key123', from: 'ClockAm <no-reply@x.test>' };
  let seen;
  await sendMail(cfg, { to: 'u@x.test', subject: 'S', text: 'T', html: '<p>H</p>' }, async (url, init) => { seen = { url, init }; return { ok: true, status: 200 }; });
  assert.equal(seen.url, 'https://api.resend.com/emails');
  assert.equal(seen.init.headers.Authorization, 'Bearer key123');
  assert.deepEqual(JSON.parse(seen.init.body).to, ['u@x.test']);
  await assert.rejects(sendMail(cfg, { to: 'u@x.test', subject: 'S', text: 'T' }, async () => ({ ok: false, status: 422 })), /422/);
  await assert.rejects(sendMail({ provider: 'none' }, { to: 'a@b.c' }), /not set up/);
});

test('admins cannot touch the owner or other admins, and cannot promote to admin', () => {
  assert.match(whyCannotEdit('admin', { role: 'owner' }), /owner/);
  assert.match(whyCannotEdit('owner', { role: 'owner' }), /owner/);
  assert.match(whyCannotEdit('admin', { role: 'admin' }), /Only the owner/);
  assert.match(whyCannotEdit('admin', { role: 'employee' }, { role: 'admin' }), /Only the owner/);
  assert.equal(whyCannotEdit('admin', { role: 'employee' }, { role: 'manager' }), null);
  assert.equal(whyCannotEdit('owner', { role: 'admin' }), null);
});

import { workplaceIdEmail } from '../src/utils/passwordReset.js';

test('workplace ID email lists each workplace and escapes names', () => {
  const m = workplaceIdEmail({ name: 'Ada <b>', workplaces: [{ name: 'Acme & Sons', slug: 'acme' }, { name: 'Test School', slug: 'test-school' }] });
  assert.match(m.text, /Acme & Sons: acme/);
  assert.match(m.text, /Test School: test-school/);
  assert.ok(!m.html.includes('<b>'), 'name is escaped in html');
  assert.match(m.html, /Acme &amp; Sons/);
  assert.match(m.subject, /Workplace ID/);
});
