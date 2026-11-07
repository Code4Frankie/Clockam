// Deployment checks that matter for ClockAm specifically: SPA deep links, API reachability, CORS, WebAuthn domain.

const get = (url, headers = {}, timeoutMs = 20000) =>
  fetch(url, { headers, redirect: 'follow', signal: AbortSignal.timeout(timeoutMs) }).catch((e) => ({ failed: e.message }));

const check = (name, issues, status = 200) => ({ url: `check://${name}`, pageType: 'deployment', status, redirects: [], issues, meta: {} });

export async function runDeploymentChecks({ base, apiBase }) {
  const out = [];
  const origin = new URL(base).origin;
  const host = new URL(base).hostname;

  // 1. Deep links must work on refresh (the Vercel rewrite). Kiosk URLs are opened directly by staff.
  const deep = await get(`${origin}/kiosk/clockam-audit-check`);
  const deepIssues = [];
  if (deep.failed || deep.status >= 400) {
    deepIssues.push({ code: 'spa_rewrite_missing', severity: 'high', message: `Deep link /kiosk/... returned ${deep.failed || deep.status}. Add the rewrite in apps/web/vercel.json.` });
  }
  out.push(check('spa-rewrite', deepIssues, deep.status || 0));

  // 2. HSTS on the main site (HTTPS is required for fingerprints anyway).
  if (origin.startsWith('https://')) {
    const home = await get(origin);
    const issues = [];
    if (!home.failed && !home.headers.get('strict-transport-security')) {
      issues.push({ code: 'missing_hsts', severity: 'low', message: 'No Strict-Transport-Security header on the web app' });
    }
    out.push(check('web-headers', issues, home.status || 0));
  }

  // 3. API reachable, CORS allows the web origin, and the WebAuthn settings match the web hostname.
  if (apiBase) {
    const issues = [];
    const res = await get(`${apiBase.replace(/\/+$/, '')}/health`, { origin }, 60000); // allow for a cold start
    if (res.failed || res.status !== 200) {
      issues.push({ code: 'api_unreachable', severity: 'high', message: `API /health ${res.failed || `returned ${res.status}`}` });
    } else {
      const allow = res.headers.get('access-control-allow-origin');
      if (allow !== origin && allow !== '*') {
        issues.push({ code: 'cors_blocked', severity: 'high', message: `API does not allow the web origin ${origin} (got "${allow || 'no header'}"). Check CORS_ORIGINS on Render.` });
      }
      const info = await res.json().catch(() => ({}));
      if (info.webauthnOrigin && info.webauthnOrigin !== origin) {
        issues.push({ code: 'webauthn_origin_mismatch', severity: 'high', message: `WEBAUTHN_ORIGIN is ${info.webauthnOrigin} but the site is ${origin}. Fingerprint enrolment and login will fail.` });
      }
      if (info.webauthnRpId && host !== info.webauthnRpId && !host.endsWith(`.${info.webauthnRpId}`)) {
        issues.push({ code: 'webauthn_rpid_mismatch', severity: 'high', message: `WEBAUTHN_RP_ID is ${info.webauthnRpId} but the site host is ${host}.` });
      }
    }
    out.push(check('api-health', issues, res.status || 0));
  }
  return out;
}
