/**
 * Prerender watch pages at the edge.
 *
 * Cloudflare Pages normally serves the plain SPA shell for content URLs, so
 * search engines and social link-expanders only ever see the homepage
 * defaults. This function:
 *
 *  1. Keeps /watch?type=&id= as the single canonical URL per title — the URL
 *     the SPA itself serves — and prerenders it with per-title SEO meta
 *     (title, description, canonical, Open Graph, Twitter cards),
 *     Movie/TVSeries + VideoObject JSON-LD, and — for non-rendering crawlers
 *     — real content inside #root.
 *  2. 301-redirects any per-title slug form (/movie/:id/:slug,
 *     /tv/:id/:slug) back to that canonical /watch?… URL so old links keep
 *     working and every title has exactly one indexable URL.
 *  3. Returns a real HTTP 404 for unknown/unfetchable title ids.
 *
 * Real users still receive the full app shell and hydrate the React app
 * exactly as before. Responses are cached at the CDN (s-maxage) keyed by URL,
 * so repeat crawls of the same title cost no TMDB requests.
 */

const SITE_URL = 'https://streamflix.stream';
const POSTER_BASE = 'https://image.tmdb.org/t/p/w500';
const BACKDROP_BASE = 'https://image.tmdb.org/t/p/w1280';
const DEFAULT_IMAGE = `${SITE_URL}/img/landingpage.webp`;

// Crawlers that read raw HTML instead of (or before) executing JavaScript.
// They get visible content inside #root; everything else just gets the shell.
const BOT_UA =
  /(googlebot|bingbot|duckduckbot|baiduspider|yandex|facebookexternalhit|twitterbot|linkedinbot|whatsapp|telegrambot|slackbot|discordbot|discord|applebot|pinterest|embedly|redditbot|vkShare|tumblr|ia_archiver|petalbot|bingpreview|google-inspectiontool|semrushbot|ahrefsbot|dotbot|exabot|mj12bot|sogou|bytespider)/i;

/** Escape a string for safe embedding in HTML attributes / text. */
const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** Match the app's generateContentMeta: truncate to ~155 chars. */
const truncate = (s, max = 155) => {
  const str = String(s || '').trim();
  return str.length > max ? str.slice(0, max - 3).trimEnd() + '...' : str;
};

const isBot = (ua) => BOT_UA.test(ua || '');

const formatDuration = (minutes) => {
  if (!minutes || typeof minutes !== 'number') return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0 && m > 0) return `PT${h}H${m}M`;
  if (h > 0) return `PT${h}H`;
  if (m > 0) return `PT${m}M`;
  return null;
};

/** Canonical URL, e.g. /watch?type=movie&id=603 or /watch?type=tv&id=…&season=…&episode=… */
const buildTitleUrl = (type, id, name, season, episode) => {
  let url = `${SITE_URL}/watch?type=${type}&id=${id}`;
  if (type === 'tv' && season && episode) {
    url += `&season=${season}&episode=${episode}`;
  }
  return url;
};

/** Fetch a single title's details from TMDB (mirrors functions/api/[[path]].js). */
async function fetchDetails(env, type, id) {
  const token = env.VITE_TMDB_READ_ACCESS_TOKEN;
  if (!token) return null;
  try {
    const res = await fetch(
      `https://api.themoviedb.org/3/${type}/${id}?language=en-US`,
      {
        headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
        cf: { cacheTtl: 3600, cacheEverything: true },
      },
    );
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.error('watch prerender: TMDB fetch failed:', err.message);
    return null;
  }
}

/** Title/description/image — mirrors the app's generateContentMeta. */
function buildMeta(item, type, season, episode, url) {
  const name = item.title || item.name || 'Unknown';
  const year = (item.release_date || item.first_air_date || '').slice(0, 4);

  let title;
  if (type === 'tv' && season && episode) {
    title = `${name} S${season} E${episode} | Watch Free on StreamFlix`;
  } else if (year) {
    title = `${name} (${year}) | Watch Free on StreamFlix`;
  } else {
    title = `${name} | Watch Free on StreamFlix`;
  }

  const description = truncate(item.overview) || `Watch ${name} for free on StreamFlix`;
  const image = item.backdrop_path
    ? `${BACKDROP_BASE}${item.backdrop_path}`
    : item.poster_path
      ? `${POSTER_BASE}${item.poster_path}`
      : DEFAULT_IMAGE;

  return { name, title, description, image, url };
}

/** Movie/TVSeries + VideoObject JSON-LD, matching the app's schemaUtils shapes. */
function buildSchema(item, type, meta) {
  const poster = item.poster_path ? `${POSTER_BASE}${item.poster_path}` : undefined;
  const backdrop = item.backdrop_path ? `${BACKDROP_BASE}${item.backdrop_path}` : undefined;
  const genre = Array.isArray(item.genres) ? item.genres.map((g) => g.name) : undefined;

  const entity =
    type === 'movie'
      ? {
          '@type': 'Movie',
          name: item.title || item.name,
          description: item.overview || '',
          image: poster,
          datePublished: item.release_date || undefined,
          duration: formatDuration(item.runtime) || undefined,
          genre,
        }
      : {
          '@type': 'TVSeries',
          name: item.title || item.name,
          description: item.overview || '',
          image: poster,
          datePublished: item.first_air_date || undefined,
          genre,
          numberOfSeasons: item.number_of_seasons || undefined,
          numberOfEpisodes: item.number_of_episodes || undefined,
        };

  if (item.vote_average != null && item.vote_count) {
    entity.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: Number(item.vote_average).toFixed(1),
      bestRating: '10',
      worstRating: '1',
      ratingCount: item.vote_count,
    };
  }

  const video = {
    '@type': 'VideoObject',
    name: item.title || item.name,
    description: item.overview || '',
    url: meta.url,
    embedUrl: meta.url,
    thumbnailUrl: backdrop || poster,
    uploadDate: (type === 'movie' ? item.release_date : item.first_air_date) || undefined,
    potentialAction: { '@type': 'WatchAction', target: meta.url },
  };
  if (type === 'movie') video.duration = formatDuration(item.runtime) || undefined;

  return {
    '@context': 'https://schema.org',
    '@graph': [entity, video],
  };
}

/** Static head block injected in place of the homepage defaults. */
function buildHead(meta, type) {
  const ogType = type === 'movie' ? 'video.movie' : 'video.tv_show';
  return `
    <title>${esc(meta.title)}</title>
    <meta name="description" content="${esc(meta.description)}" />
    <link rel="canonical" href="${esc(meta.url)}" />
    <meta property="og:type" content="${ogType}" />
    <meta property="og:url" content="${esc(meta.url)}" />
    <meta property="og:title" content="${esc(meta.title)}" />
    <meta property="og:description" content="${esc(meta.description)}" />
    <meta property="og:image" content="${esc(meta.image)}" />
    <meta property="og:site_name" content="StreamFlix" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${esc(meta.title)}" />
    <meta name="twitter:description" content="${esc(meta.description)}" />
    <meta name="twitter:image" content="${esc(meta.image)}" />`;
}

/** Visible content for non-rendering crawlers (React replaces it on hydration). */
function buildBodyContent(item, type, meta) {
  const year = (item.release_date || item.first_air_date || '').slice(0, 4);
  const genres = Array.isArray(item.genres) ? item.genres.map((g) => g.name).join(', ') : '';
  const poster = item.poster_path ? `${POSTER_BASE}${item.poster_path}` : '';
  const rating = item.vote_average ? `${Number(item.vote_average).toFixed(1)}/10` : '';

  const facts = [year, rating, genres].filter(Boolean).join(' • ');
  const label = type === 'movie' ? 'movie' : 'TV show';

  return `
    <div id="root">
      <article style="max-width:720px;margin:0 auto;padding:48px 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#fff;background:#000;">
        ${poster ? `<img src="${esc(poster)}" alt="${esc(meta.name)} poster" style="max-width:240px;border-radius:8px;display:block;margin-bottom:16px;" />` : ''}
        <h1 style="font-size:28px;margin:0 0 8px;">${esc(meta.name)}</h1>
        ${facts ? `<p style="color:#aaa;margin:0 0 16px;">${esc(facts)}</p>` : ''}
        <p style="line-height:1.6;color:#ddd;margin:0 0 24px;">${esc(meta.description)}</p>
        <a href="${esc(meta.url)}" style="display:inline-block;background:#e50914;color:#fff;text-decoration:none;padding:12px 24px;border-radius:6px;font-weight:600;">Watch this ${label} free on StreamFlix</a>
      </article>
    </div>`;
}

const CACHE_HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
  'Vary': 'User-Agent',
};

export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '');

  // Redirect sources: /movie/:id/:slug? and /tv/:id/:slug? 301 to the
  // canonical /watch?… form below.
  const routeMatch = path.match(/^\/(movie|tv)\/(\d+)(?:\/([\w-]+))?$/);

  // Legacy form: /watch?type=movie|tv&id=123
  const legacyType = url.searchParams.get('type');
  const legacyId = url.searchParams.get('id');
  const isLegacy =
    path === '/watch' && (legacyType === 'movie' || legacyType === 'tv') && legacyId;

  // Anything else keeps the existing behavior (SPA shell via the asset handler).
  if (!routeMatch && !isLegacy) {
    return next();
  }

  const type = routeMatch ? routeMatch[1] : legacyType;
  const id = routeMatch ? routeMatch[2] : legacyId;
  const season = url.searchParams.get('season');
  const episode = url.searchParams.get('episode');

  // Get the SPA shell and the TMDB details in parallel.
  const [assetRes, item] = await Promise.all([next(), fetchDetails(env, type, id)]);
  const html = await assetRes.text();

  // Unknown/unfetchable id — real 404 so crawl budget isn't wasted on it.
  if (!item) {
    const noindex = html.replace(
      '</head>',
      '  <meta name="robots" content="noindex" />\n  </head>',
    );
    return new Response(noindex, { status: 404, headers: CACHE_HEADERS });
  }

  // Canonicalize: per-title slug URLs (/movie/:id/:slug, /tv/:id/:slug) and
  // any /watch form with stray query params 301 to the single canonical URL
  // for the title — /watch?type=&id=…, the URL the SPA itself serves.
  const canonical = buildTitleUrl(type, id, item.title || item.name, season, episode);
  if (canonical !== `${SITE_URL}${url.pathname}${url.search}`) {
    return new Response(null, {
      status: 301,
      headers: {
        Location: canonical,
        'Cache-Control': 'public, s-maxage=86400',
      },
    });
  }

  const meta = buildMeta(item, type, season, episode, canonical);
  const head = buildHead(meta, type);
  const schema = JSON.stringify(buildSchema(item, type, meta)).replace(/</g, '\\u003c');

  const prerendered = html
    // Remove the static homepage defaults, then inject the per-title set.
    .replace(/<title>[\s\S]*?<\/title>/, '')
    .replace(/<meta\s+name="description"[^>]*>/i, '')
    .replace(/<meta\s+property="og:[^"]*"[^>]*>/gi, '')
    .replace(/<meta\s+name="twitter:[^"]*"[^>]*>/gi, '')
    .replace(/<link\s+rel="canonical"[^>]*>/i, '')
    .replace(
      '</head>',
      `  ${head}\n  <script type="application/ld+json">${schema}</script>\n  </head>`,
    );

  if (isBot(request.headers.get('user-agent'))) {
    return new Response(
      prerendered.replace('<div id="root"></div>', buildBodyContent(item, type, meta)),
      { headers: CACHE_HEADERS },
    );
  }

  return new Response(prerendered, { headers: CACHE_HEADERS });
}
