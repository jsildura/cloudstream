/**
 * Dynamic sitemap — served at /sitemap.xml (see public/_routes.json).
 *
 * Replaces the build-time static sitemap (vite-plugin-sitemap) with one that
 * includes the top-N popular movies and TV shows from TMDB, so crawlers can
 * discover every indexable watch page without relying on internal links.
 *
 * - Title URLs use the canonical /watch?type=&id= form (see
 *   functions/_watch-prerender.js for the matching redirect/prerender logic).
 * - TMDB responses are cached at the CDN (cf cacheTtl), and the sitemap
 *   response itself is cached for 24h (s-maxage), so it refreshes
 *   periodically without any scheduled job and repeat crawls cost no TMDB
 *   requests.
 */

const SITE_URL = 'https://streamflix.stream';
const TMDB_BASE = 'https://api.themoviedb.org/3';

// Static pages, mirroring the previous build-time sitemap.
const STATIC_ROUTES = [
  { path: '/', changefreq: 'daily', priority: '1.0' },
  { path: '/tv-shows', changefreq: 'daily', priority: '0.9' },
  { path: '/discover', changefreq: 'daily', priority: '0.8' },
  { path: '/netflix', changefreq: 'weekly', priority: '0.7' },
  { path: '/disney', changefreq: 'weekly', priority: '0.7' },
  { path: '/prime-video', changefreq: 'weekly', priority: '0.7' },
  { path: '/hbo', changefreq: 'weekly', priority: '0.7' },
  { path: '/apple-tv', changefreq: 'weekly', priority: '0.7' },
  { path: '/viu', changefreq: 'weekly', priority: '0.7' },
  { path: '/crunchyroll', changefreq: 'weekly', priority: '0.7' },
  { path: '/peacock', changefreq: 'weekly', priority: '0.7' },
  { path: '/iptv', changefreq: 'daily', priority: '0.8' },
  { path: '/sports', changefreq: 'daily', priority: '0.8' },
  { path: '/music', changefreq: 'weekly', priority: '0.7' },
  { path: '/my-list', changefreq: 'weekly', priority: '0.6' },
  { path: '/about', changefreq: 'monthly', priority: '0.5' },
  { path: '/disclaimer', changefreq: 'monthly', priority: '0.5' },
  { path: '/privacy', changefreq: 'monthly', priority: '0.5' },
  { path: '/terms', changefreq: 'monthly', priority: '0.5' },
  { path: '/contact', changefreq: 'monthly', priority: '0.5' },
];

// How many popular titles to include (3 pages × 20 per type).
const TITLE_PAGES = [1, 2, 3];

/** Escape a string for safe embedding in XML text/attributes. */
const escXml = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

/** Fetch the popular list for a media type (deduped by id). */
async function fetchPopular(env, type) {
  const token = env.VITE_TMDB_READ_ACCESS_TOKEN;
  if (!token) return [];

  const seen = new Set();
  const results = [];
  for (const page of TITLE_PAGES) {
    try {
      const res = await fetch(`${TMDB_BASE}/${type}/popular?language=en-US&page=${page}`, {
        headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
        // Cache TMDB responses for 6h so repeated sitemap generation is cheap.
        cf: { cacheTtl: 21600, cacheEverything: true },
      });
      if (!res.ok) break;
      const data = await res.json();
      for (const item of data.results || []) {
        if (!item || !item.id || seen.has(item.id)) continue;
        seen.add(item.id);
        results.push(item.id);
      }
    } catch {
      break;
    }
  }
  return results;
}

export async function onRequest(context) {
  const { env } = context;

  // Fetch popular movies and TV in parallel; on TMDB failure the static
  // routes alone still produce a valid sitemap.
  const [movieIds, tvIds] = await Promise.all([
    fetchPopular(env, 'movie').catch(() => []),
    fetchPopular(env, 'tv').catch(() => []),
  ]);

  const urls = STATIC_ROUTES.map(({ path, changefreq, priority }) => {
    const meta = [
      `<loc>${escXml(SITE_URL + path)}</loc>`,
      `<changefreq>${changefreq}</changefreq>`,
      `<priority>${priority}</priority>`,
    ].join('');
    return `<url>${meta}</url>`;
  });

  for (const id of movieIds) {
    urls.push(`<url><loc>${escXml(`${SITE_URL}/watch?type=movie&id=${id}`)}</loc></url>`);
  }
  for (const id of tvIds) {
    urls.push(`<url><loc>${escXml(`${SITE_URL}/watch?type=tv&id=${id}`)}</loc></url>`);
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls.join('\n') +
    '\n</urlset>\n';

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      // Refreshes at the CDN once a day; stale copies stay available for a
      // further day while a fresh one is generated.
      'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=86400',
    },
  });
}
