// Sends email through Resend (https://resend.com). With MAIL_PROVIDER=console (development only) it prints instead.
// With no provider set, mailConfigured() is false and features that need email say so instead of pretending.
export const mailConfigured = (cfg) =>
  (cfg.provider === 'resend' && !!cfg.resendApiKey && !!cfg.from) || (cfg.provider === 'console' && cfg.nodeEnv !== 'production');

export async function sendMail(cfg, { to, subject, text, html }, fetchFn = fetch) {
  if (!mailConfigured(cfg)) throw new Error('Email is not set up');
  if (cfg.provider === 'console') {
    console.log(`[mail to ${to}] ${subject}\n${text}`);
    return;
  }
  const res = await fetchFn('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.resendApiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: cfg.from, to: [to], subject, text, html }),
  });
  if (!res.ok) throw new Error(`Email provider refused the message (${res.status})`);
}
