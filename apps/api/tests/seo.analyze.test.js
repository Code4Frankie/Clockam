import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzePage, extractMeta, findDuplicates, analyzeSitemap, parseSitemap, classifyPath } from '../src/seo/analyze.js';

const GOOD = `<!doctype html><html lang="en"><head>
<title>ClockAm - fingerprint attendance for workplaces</title>
<meta name="description" content="ClockAm records staff clock-in and clock-out with phone, laptop or scanner fingerprints, with reports for payroll.">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="canonical" href="https://clockam.example/login">
<meta property="og:title" content="ClockAm"><meta property="og:description" content="Attendance"><meta property="og:image" content="https://clockam.example/logo.png">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"SoftwareApplication","name":"ClockAm"}</script>
</head><body><h1>ClockAm</h1><img src="/logo.png" alt="ClockAm logo"></body></html>`;

const codes = (p) => p.issues.map((i) => i.code).sort();
const page = (over) => analyzePage({ url: 'https://clockam.example/login', pageType: 'public', status: 200, raw: GOOD, rendered: GOOD, ...over });

test('a complete public page has no issues', () => {
  assert.deepEqual(codes(page({})), []);
});

test('extractMeta ignores tags that only appear inside script strings', () => {
  const html = `<html><head><title>T</title></head><body><script>el.innerHTML='<h1>Hi</h1><img src="a.png">'</script></body></html>`;
  const m = extractMeta(html);
  assert.deepEqual(m.h1, []);
  assert.equal(m.images.total, 0);
});

test('a bare page is flagged for every missing basic tag', () => {
  const bare = '<html><head></head><body><img src="a.png"></body></html>';
  const c = codes(page({ raw: bare, rendered: bare }));
  for (const code of ['missing_title', 'missing_description', 'missing_canonical', 'missing_h1', 'missing_lang', 'missing_viewport', 'missing_open_graph', 'images_missing_alt']) {
    assert.ok(c.includes(code), code);
  }
});

test('tags that exist only after JavaScript runs are flagged (client-rendered SPA)', () => {
  const shell = '<html lang="en"><head><title>ClockAm</title><meta name="viewport" content="width=device-width"></head><body><div id="root"></div></body></html>';
  const p = page({ raw: shell, rendered: GOOD });
  const issue = p.issues.find((i) => i.code === 'meta_client_rendered');
  assert.ok(issue);
  assert.match(issue.message, /description/);
  assert.match(issue.message, /h1/);
});

test('rendering skipped is reported', () => {
  assert.ok(codes(page({ rendered: null })).includes('rendering_skipped'));
});

test('invalid and unexpected JSON-LD are reported', () => {
  const bad = GOOD.replace('{"@context"', '{"@context" BROKEN');
  assert.ok(codes(page({ raw: bad, rendered: bad })).includes('invalid_jsonld'));
  const odd = GOOD.replace('SoftwareApplication', 'Recipe');
  assert.ok(codes(page({ raw: odd, rendered: odd })).includes('jsonld_unexpected_types'));
  const graph = GOOD.replace(/\{"@context.*?\}<\/script>/, '{"@graph":[{"@type":"Organization"},{"@type":"BreadcrumbList"}]}</script>');
  assert.equal(extractMeta(graph).jsonLd[0].types.join(), 'Organization,BreadcrumbList');
  assert.ok(codes(page({ raw: GOOD.replace(/<script.*?<\/script>/s, ''), rendered: null, expectJsonLd: true })).includes('missing_jsonld'));
});

test('title and description length warnings', () => {
  const long = GOOD.replace(/<title>.*?<\/title>/, `<title>${'x'.repeat(80)}</title>`);
  assert.ok(codes(page({ raw: long, rendered: long })).includes('title_too_long'));
  const shortDesc = GOOD.replace(/(name="description" content=")[^"]*/, '$1Too short');
  assert.ok(codes(page({ raw: shortDesc, rendered: shortDesc })).includes('description_length'));
});

test('http errors and redirect chains are reported', () => {
  assert.ok(codes(page({ status: 404 })).includes('http_error'));
  assert.ok(codes(page({ status: 0 })).includes('http_error'));
  assert.ok(codes(page({ redirects: ['301 a', '302 b'] })).includes('redirect_chain'));
  assert.ok(!codes(page({ redirects: ['301 a'] })).includes('redirect_chain'));
});

test('private pages must be noindex (header, meta, or at least rendered meta)', () => {
  const priv = (over) => analyzePage({ url: 'https://clockam.example/kiosk/acme', pageType: 'private', status: 200, raw: '<html></html>', rendered: '<html></html>', ...over });
  const miss = priv({});
  assert.deepEqual(codes(miss), ['missing_noindex']);
  assert.equal(miss.issues[0].severity, 'high');
  assert.deepEqual(codes(priv({ headers: { 'x-robots-tag': 'noindex, nofollow' } })), []);
  assert.deepEqual(codes(priv({ raw: '<html><head><meta name="robots" content="noindex"></head></html>' })), []);
  assert.deepEqual(codes(priv({ rendered: '<html><head><meta name="robots" content="noindex"></head></html>' })), ['noindex_client_rendered']);
});

test('a public page marked noindex is flagged', () => {
  assert.ok(codes(page({ headers: { 'x-robots-tag': 'noindex' } })).includes('unexpected_noindex'));
});

test('duplicate titles and descriptions are found across public pages only', () => {
  const a = page({ url: 'https://x/login' });
  const b = page({ url: 'https://x/register' });
  const priv = analyzePage({ url: 'https://x/me', pageType: 'private', status: 200, raw: GOOD, rendered: GOOD, headers: { 'x-robots-tag': 'noindex' } });
  const groups = findDuplicates([a, b, priv]);
  assert.equal(groups.length, 2);
  assert.ok(codes(a).includes('duplicate_title') && codes(b).includes('duplicate_description'));
  assert.ok(!codes(priv).includes('duplicate_title'));
});

test('sitemap coverage versus reachability', () => {
  const login = page({ url: 'https://x/login' });
  const register = page({ url: 'https://x/register' });
  const employees = analyzePage({ url: 'https://x/employees', pageType: 'private', status: 200, raw: '', rendered: '', headers: { 'x-robots-tag': 'noindex' } });
  const broken = page({ url: 'https://x/gone', status: 404 });

  const issues = analyzeSitemap({
    sitemapStatus: 200,
    sitemapUrls: ['https://x/login', 'https://x/employees/', 'https://x/gone'],
    pages: [login, register, employees, broken],
  });
  assert.ok(codes(register).includes('not_in_sitemap'));
  assert.ok(codes(employees).includes('private_in_sitemap'));
  assert.ok(!codes(login).includes('not_in_sitemap'));
  assert.ok(issues.some((i) => i.code === 'sitemap_url_broken'));

  assert.equal(analyzeSitemap({ sitemapStatus: 404, sitemapUrls: [], pages: [] })[0].code, 'sitemap_missing');
});

test('parseSitemap and classifyPath', () => {
  assert.deepEqual(parseSitemap('<urlset><url><loc> https://x/login </loc></url><url><loc>https://x/register</loc></url></urlset>'), ['https://x/login', 'https://x/register']);
  assert.equal(classifyPath('/login'), 'public');
  assert.equal(classifyPath('/register/'), 'public');
  assert.equal(classifyPath('/'), 'public');
  assert.equal(classifyPath('/dashboard'), 'private');
  assert.equal(classifyPath('/kiosk/acme'), 'private');
  assert.equal(classifyPath('/employees'), 'private');
});
