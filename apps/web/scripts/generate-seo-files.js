// Generates public/robots.txt and public/sitemap.xml at build time from the site URL.
// SITE_URL can be set in Vercel; otherwise Vercel's production URL variable is used.
import { mkdirSync, writeFileSync } from 'node:fs';

const site = (process.env.SITE_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : '')).replace(/\/+$/, '');
mkdirSync('public', { recursive: true });

// Private pages are kept out of search with X-Robots-Tag headers (vercel.json). They are NOT blocked here,
// because a crawler must be able to fetch a page to see its noindex header.
const robots = ['User-agent: *', 'Allow: /', ...(site ? [`Sitemap: ${site}/sitemap.xml`] : []), ''].join('\n');
writeFileSync('public/robots.txt', robots);

if (site) {
  const urls = ['/', '/login', '/register'].map((p) => `  <url><loc>${site}${p}</loc></url>`).join('\n');
  writeFileSync('public/sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);
  console.log(`Wrote robots.txt and sitemap.xml for ${site}`);
} else {
  console.warn('No SITE_URL or VERCEL_PROJECT_PRODUCTION_URL: wrote robots.txt only, skipped sitemap.xml');
}
