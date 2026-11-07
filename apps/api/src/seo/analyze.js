// Pure page analysis (no network, no database) so issue detection can be unit tested with fixture HTML.

export const PUBLIC_PATHS = new Set(['/', '/login', '/register']);

// Everything that is not an explicitly public page (dashboard, kiosk, admin screens) must not be indexed.
export const classifyPath = (pathname) => (PUBLIC_PATHS.has(pathname.replace(/\/+$/, '') || '/') ? 'public' : 'private');

const decode = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
const stripTags = (s) => s.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

function attrs(tag) {
  const out = {};
  for (const m of tag.matchAll(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) out[m[1].toLowerCase()] = m[2] ?? m[3];
  return out;
}

// Script, style and comment contents are not page content (a script may contain "<h1>" inside a string).
const withoutCode = (html) =>
  html.replace(/<!--[\s\S]*?-->/g, '').replace(/<script\b[\s\S]*?<\/script>/gi, '').replace(/<style\b[\s\S]*?<\/style>/gi, '');

export function extractMeta(source = '') {
  const jsonLdSource = source; // JSON-LD lives in <script>, so read it before stripping scripts
  const html = withoutCode(source);
  const title = decode(stripTags((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || ''));

  const metas = {};
  for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
    const a = attrs(tag);
    const key = (a.name || a.property || '').toLowerCase();
    if (key && a.content !== undefined) metas[key] = decode(a.content.trim());
  }

  let canonical = '';
  for (const tag of html.match(/<link\b[^>]*>/gi) || []) {
    const a = attrs(tag);
    if ((a.rel || '').toLowerCase().split(/\s+/).includes('canonical') && a.href) canonical = a.href.trim();
  }

  const lang = (attrs((html.match(/<html\b[^>]*>/i) || [''])[0]).lang || '').trim();
  const h1 = [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map((m) => decode(stripTags(m[1]))).filter(Boolean);

  const imgTags = html.match(/<img\b[^>]*>/gi) || [];
  const images = { total: imgTags.length, withAlt: 0, emptyAlt: 0, missingAlt: 0 };
  for (const tag of imgTags) {
    const a = attrs(tag);
    if (a.alt === undefined) images.missingAlt += 1;
    else if (a.alt.trim() === '') images.emptyAlt += 1;
    else images.withAlt += 1;
  }

  const jsonLd = [];
  for (const m of jsonLdSource.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const data = JSON.parse(m[1]);
      const items = Array.isArray(data) ? data : Array.isArray(data['@graph']) ? data['@graph'] : [data];
      jsonLd.push({ valid: true, types: items.flatMap((i) => [].concat(i?.['@type'] || [])) });
    } catch (e) {
      jsonLd.push({ valid: false, types: [], error: e.message.slice(0, 120) });
    }
  }

  return {
    title,
    description: metas.description || '',
    robots: metas.robots || '',
    canonical,
    lang,
    viewport: metas.viewport || '',
    h1,
    og: { title: metas['og:title'] || '', description: metas['og:description'] || '', image: metas['og:image'] || '' },
    images,
    jsonLd,
  };
}

const NOINDEX = /noindex/i;

/**
 * raw      = HTML as served (what crawlers that do not run JavaScript see)
 * rendered = DOM after JavaScript ran (what Google sees), or null if rendering was skipped
 */
export function analyzePage({ url, pageType, status, redirects = [], headers = {}, raw = '', rendered = null, expectJsonLd = false }) {
  const rawMeta = extractMeta(raw);
  const renMeta = rendered == null ? null : extractMeta(rendered);
  const meta = renMeta || rawMeta;
  const issues = [];
  const add = (code, severity, message) => issues.push({ code, severity, message });

  if (!status || status >= 400) add('http_error', 'high', `Returned ${status || 'no response'}`);
  if (redirects.length > 1) add('redirect_chain', 'medium', `${redirects.length} redirects before the final page`);
  if (rendered == null) add('rendering_skipped', 'low', 'JavaScript rendering was skipped, so only the raw HTML was checked');

  const noindexHeader = NOINDEX.test(headers['x-robots-tag'] || '');
  const noindexRaw = NOINDEX.test(rawMeta.robots);
  const noindexRendered = !!renMeta && NOINDEX.test(renMeta.robots);
  const anyNoindex = noindexHeader || noindexRaw || noindexRendered;

  if (pageType === 'private') {
    if (!anyNoindex) add('missing_noindex', 'high', 'Private page can be indexed. Send an X-Robots-Tag: noindex header.');
    else if (!noindexHeader && !noindexRaw) add('noindex_client_rendered', 'low', 'noindex only appears after JavaScript runs. Prefer an X-Robots-Tag header.');
  }

  if (pageType === 'public') {
    if (anyNoindex) add('unexpected_noindex', 'high', 'Public page is marked noindex');

    if (!meta.title) add('missing_title', 'medium', 'No <title>');
    else if (meta.title.length > 60) add('title_too_long', 'low', `Title is ${meta.title.length} characters (aim for 60 or fewer)`);
    else if (meta.title.length < 10) add('title_too_short', 'low', `Title is only ${meta.title.length} characters`);

    if (!meta.description) add('missing_description', 'medium', 'No meta description');
    else if (meta.description.length < 50 || meta.description.length > 160) {
      add('description_length', 'low', `Description is ${meta.description.length} characters (aim for 50 to 160)`);
    }

    if (!meta.canonical) add('missing_canonical', 'medium', 'No canonical link');
    if (meta.h1.length === 0) add('missing_h1', 'medium', 'No <h1>');
    else if (meta.h1.length > 1) add('multiple_h1', 'low', `${meta.h1.length} <h1> elements`);
    if (!meta.lang) add('missing_lang', 'low', 'No lang attribute on <html>');
    if (!meta.viewport) add('missing_viewport', 'medium', 'No viewport meta tag (mobile layout)');
    if (!meta.og.title || !meta.og.description || !meta.og.image) add('missing_open_graph', 'low', 'Open Graph title, description or image is missing (link previews)');
    if (meta.images.missingAlt > 0) add('images_missing_alt', 'medium', `${meta.images.missingAlt} of ${meta.images.total} images have no alt attribute`);

    const bad = meta.jsonLd.filter((j) => !j.valid);
    if (bad.length) add('invalid_jsonld', 'medium', `${bad.length} JSON-LD block(s) are not valid JSON: ${bad[0].error}`);
    const types = meta.jsonLd.flatMap((j) => j.types);
    if (expectJsonLd && !meta.jsonLd.length) add('missing_jsonld', 'low', 'No JSON-LD structured data');
    else if (meta.jsonLd.length && !bad.length && !types.some((t) => ['Organization', 'SoftwareApplication', 'WebSite', 'BreadcrumbList'].includes(t))) {
      add('jsonld_unexpected_types', 'low', `JSON-LD has no Organization, SoftwareApplication, WebSite or BreadcrumbList (found: ${types.join(', ') || 'none'})`);
    }

    // The core SPA problem: tags that only exist after JavaScript runs.
    if (renMeta) {
      const clientOnly = ['title', 'description', 'canonical']
        .filter((f) => renMeta[f] && renMeta[f] !== rawMeta[f])
        .concat(renMeta.h1.length && !rawMeta.h1.length ? ['h1'] : []);
      if (clientOnly.length) {
        add('meta_client_rendered', 'medium', `${clientOnly.join(', ')} only appear after JavaScript runs. Crawlers and link previews that do not run JavaScript will not see them.`);
      }
    }
  }

  return {
    url,
    pageType,
    status: status || 0,
    redirects,
    issues,
    meta: {
      title: meta.title,
      description: meta.description,
      canonical: meta.canonical,
      h1Count: meta.h1.length,
      noindex: anyNoindex,
    },
  };
}

// Pages that share the same title or description (public pages only).
export function findDuplicates(pages) {
  const out = [];
  for (const field of ['title', 'description']) {
    const seen = new Map();
    for (const p of pages.filter((x) => x.pageType === 'public' && x.meta[field])) {
      const k = p.meta[field].toLowerCase();
      seen.set(k, [...(seen.get(k) || []), p]);
    }
    for (const group of seen.values()) {
      if (group.length > 1) {
        for (const p of group) {
          p.issues.push({ code: `duplicate_${field}`, severity: 'medium', message: `Same ${field} as ${group.length - 1} other page(s): "${p.meta[field].slice(0, 60)}"` });
        }
        out.push({ field, urls: group.map((g) => g.url) });
      }
    }
  }
  return out;
}

export const parseSitemap = (xml = '') => [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]);

// Sitemap coverage versus reachability. Mutates page issues and returns issues for the sitemap itself.
export function analyzeSitemap({ sitemapStatus, sitemapUrls, pages }) {
  const sitemapIssues = [];
  if (sitemapStatus !== 200) {
    sitemapIssues.push({ code: 'sitemap_missing', severity: 'medium', message: `sitemap.xml returned ${sitemapStatus || 'no response'}` });
    return sitemapIssues;
  }
  const norm = (u) => u.replace(/\/+$/, '');
  const inMap = new Set(sitemapUrls.map(norm));
  for (const p of pages) {
    const listed = inMap.has(norm(p.url));
    if (p.pageType === 'private' && listed) p.issues.push({ code: 'private_in_sitemap', severity: 'high', message: 'Private page is listed in sitemap.xml' });
    if (p.pageType === 'public' && !listed && p.status < 400) p.issues.push({ code: 'not_in_sitemap', severity: 'low', message: 'Public page is not listed in sitemap.xml' });
  }
  const byUrl = new Map(pages.map((p) => [norm(p.url), p]));
  for (const u of sitemapUrls) {
    const p = byUrl.get(norm(u));
    if (p && p.status >= 400) sitemapIssues.push({ code: 'sitemap_url_broken', severity: 'medium', message: `${u} is in the sitemap but returns ${p.status}` });
  }
  return sitemapIssues;
}
