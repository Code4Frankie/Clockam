#!/usr/bin/env node
// ClockAm site and deployment auditor.
//   node apps/api/src/seo/crawl.js --base https://your-app.vercel.app --api https://your-api.onrender.com
// Flags: --dry-run (don't write to MongoDB), --no-render (skip Playwright), --fail-on-high (exit 1 if any high issue)
// Env:   SEO_BASE_URL, SEO_API_URL, SEO_CRAWL_DELAY_MS, SEO_MAX_PAGES, MONGODB_URI
import { createRequire } from 'node:module';
import { analyzePage, analyzeSitemap, classifyPath, findDuplicates, parseSitemap } from './analyze.js';
import { runDeploymentChecks } from './deployment.js';

await import('dotenv/config').catch(() => {}); // optional: .env is only needed for local runs

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const opt = (n) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : undefined; };

const base = (opt('base') || process.env.SEO_BASE_URL || '').replace(/\/+$/, '');
const apiBase = opt('api') || process.env.SEO_API_URL || '';
const delay = Number(process.env.SEO_CRAWL_DELAY_MS ?? 500);
const maxPages = Number(process.env.SEO_MAX_PAGES ?? 50);
const UA = 'ClockAmAuditBot/1.0 (+own-site audit)';

if (!base) {
  console.error('Set SEO_BASE_URL or pass --base https://your-site');
  process.exit(2);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const origin = new URL(base).origin;

async function fetchRaw(url) {
  const redirects = [];
  let current = url;
  for (let i = 0; i < 6; i += 1) {
    const res = await fetch(current, { redirect: 'manual', headers: { 'user-agent': UA }, signal: AbortSignal.timeout(20000) }).catch((e) => ({ failed: e.message }));
    if (res.failed) return { status: 0, redirects, headers: {}, body: '', error: res.failed };
    const loc = res.headers.get('location');
    if ([301, 302, 303, 307, 308].includes(res.status) && loc) {
      redirects.push(`${res.status} ${current}`);
      current = new URL(loc, current).href;
      continue;
    }
    const isHtml = /html|xml|text\/plain/.test(res.headers.get('content-type') || '');
    return { status: res.status, headers: Object.fromEntries(res.headers), body: isHtml ? await res.text() : '', redirects };
  }
  return { status: 0, redirects, headers: {}, body: '', error: 'too many redirects' };
}

async function loadChromium() {
  try { return (await import('playwright')).chromium; } catch { /* fall through */ }
  try { return createRequire(import.meta.url)('playwright').chromium; } catch { return null; }
}

function internalLinks(html, from) {
  const found = new Set();
  for (const m of html.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"']+)["']/gi)) {
    try {
      const u = new URL(m[1], from);
      if (u.origin !== origin || u.pathname.startsWith('/api/') || /\.[a-z0-9]{2,5}$/i.test(u.pathname)) continue;
      found.add(`${u.origin}${u.pathname.replace(/\/+$/, '') || '/'}`);
    } catch { /* ignore bad hrefs */ }
  }
  return [...found];
}

async function main() {
  const runId = new Date().toISOString();
  console.log(`ClockAm audit ${runId}\n  site: ${origin}\n  api:  ${apiBase || '(not set, API checks skipped)'}`);

  // Sitemap (coverage vs reachability)
  const sm = await fetchRaw(`${origin}/sitemap.xml`);
  const sitemapUrls = sm.status === 200 ? parseSitemap(sm.body) : [];

  // Seeds: public pages, sitemap, and private routes we expect to carry noindex.
  const probes = ['/', '/login', '/register', '/kiosk/clockam-audit-check', '/dashboard', '/employees', '/devices', '/reports', '/me'];
  const queue = [...new Set([...probes.map((p) => `${origin}${p}`.replace(/\/$/, '') || origin), ...sitemapUrls.filter((u) => u.startsWith(origin))])];
  const seen = new Set();

  const chromium = flag('no-render') ? null : await loadChromium();
  if (!chromium && !flag('no-render')) console.warn('  Playwright not available: rendered checks skipped (npm i -D playwright && npx playwright install chromium)');
  const browser = chromium ? await chromium.launch() : null;

  const pages = [];
  try {
    while (queue.length && pages.length < maxPages) {
      const url = queue.shift();
      const key = url.replace(/\/+$/, '') || origin;
      if (seen.has(key)) continue;
      seen.add(key);

      const raw = await fetchRaw(url);
      let rendered = null;
      if (browser && raw.status && raw.status < 400) {
        const page = await browser.newPage({ userAgent: UA });
        try {
          await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
          rendered = await page.content();
        } catch (e) {
          console.warn(`  render failed for ${url}: ${e.message.split('\n')[0]}`);
        } finally {
          await page.close();
        }
      }

      const pathname = new URL(url).pathname;
      const result = analyzePage({
        url, pageType: classifyPath(pathname), status: raw.status, redirects: raw.redirects,
        headers: raw.headers, raw: raw.body, rendered,
      });
      pages.push(result);
      for (const l of internalLinks(rendered ?? raw.body, url)) if (!seen.has(l)) queue.push(l);
      await sleep(delay);
    }
  } finally {
    await browser?.close();
  }

  findDuplicates(pages);
  const sitemapIssues = analyzeSitemap({ sitemapStatus: sm.status, sitemapUrls, pages });
  const extra = [{ url: `${origin}/sitemap.xml`, pageType: 'sitemap', status: sm.status, redirects: [], issues: sitemapIssues, meta: {} }];
  const deployment = await runDeploymentChecks({ base: origin, apiBase });

  const all = [...pages, ...extra, ...deployment];
  const checkedAt = new Date();
  const docs = all.map((d) => ({ ...d, runId, checkedAt }));

  // Console summary
  const count = (sev) => docs.reduce((n, d) => n + d.issues.filter((i) => i.severity === sev).length, 0);
  console.log(`\nChecked ${pages.length} pages + ${extra.length + deployment.length} checks.  high: ${count('high')}  medium: ${count('medium')}  low: ${count('low')}`);
  for (const d of docs.filter((x) => x.issues.length)) {
    console.log(`\n${d.url}  [${d.pageType}, ${d.status}]`);
    for (const i of d.issues) console.log(`  ${i.severity.toUpperCase().padEnd(6)} ${i.code}: ${i.message}`);
  }

  // Store with history (skipped for --dry-run or when no database is configured)
  if (!flag('dry-run') && process.env.MONGODB_URI) {
    const mongoose = (await import('mongoose')).default;
    const { SeoAudit } = await import('../models/SeoAudit.js');
    await mongoose.connect(process.env.MONGODB_URI);
    await SeoAudit.insertMany(docs);
    await mongoose.disconnect();
    console.log(`\nSaved ${docs.length} rows to seoaudits (run ${runId}).`);
  } else {
    console.log('\nNot saved (dry run or MONGODB_URI not set).');
  }

  if (flag('fail-on-high') && count('high') > 0) process.exit(1);
}

main().catch((e) => { console.error('Audit failed:', e); process.exit(2); });
