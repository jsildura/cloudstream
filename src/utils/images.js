/**
 * wsrv.nl image proxy helpers.
 *
 * WHY: TMDB only serves JPEG/PNG. Routing card art through wsrv.nl converts it
 * to WebP on the fly (~25-35% smaller) and caches it on Cloudflare's edge.
 *
 * PHASE 1 RULE: every helper below requests the SAME pixel width the code
 * already used. Format changes, dimensions do not. That keeps this swap
 * visually risk-free and makes any regression obviously a wsrv problem.
 * Width tuning is Phase 2 — see the plan's section 8.
 */

const TMDB_ORIGIN = 'https://image.tmdb.org/t/p';

/**
 * Wrap any TMDB image path in a wsrv.nl URL.
 *
 * @param {string|null} path   TMDB path, always starts with "/" e.g. "/abc.jpg"
 * @param {object}      opts
 * @param {number}      opts.w      target width in px
 * @param {'cover'|'contain'} [opts.fit='cover']
 * @param {number}      [opts.q=82] WebP quality, 1-100
 * @param {string}      [opts.size='original'] TMDB size segment to pull from
 * @returns {string|null} null when path is null, so callers keep their
 *                        existing `? :` placeholder fallbacks unchanged.
 */
export function wsUrl(path, { w, fit = 'cover', q = 82, size = 'original' } = {}) {
  if (!path) return null;

  const source = `${TMDB_ORIGIN}/${size}${path}`;
  const params = new URLSearchParams({
    url: source,          // URLSearchParams handles the encoding for us
    w: String(w),
    fit,
    output: 'webp',
    q: String(q),
  });

  return `https://wsrv.nl/?${params}`;
}

/* ---- Curated helpers. Use these in components, not wsUrl directly. ---- */

/** 16:9 backdrop on a row/grid card. Matches today's w780. */
export const cardBackdrop = (path) => wsUrl(path, { w: 780 });

/** Large backdrop inside the hover-preview card. Matches today's w1280. */
export const previewBackdrop = (path) => wsUrl(path, { w: 1280 });

/**
 * A POSTER used as the fallback image inside a 16:9 backdrop slot.
 *
 * Width only, NO height: wsrv keeps the 2:3 aspect and the card's existing
 * `object-fit: cover` does the cropping, exactly as it does today.
 *
 * Default w=500 matches `POSTER_URL`, which is what 7 of the 8 call sites use.
 * The 8th (PopularOnStreamflix:317) hardcodes w780, so it passes 780 explicitly
 * — Phase 1 changes format, never dimensions.
 */
export const posterAsBackdrop = (path, w = 500) => wsUrl(path, { w });

/** A real portrait poster tile (2:3 card). Matches today's w500. */
export const cardPoster = (path) => wsUrl(path, { w: 500 });

/**
 * Transparent show/movie logo. `fit: 'contain'` so text is never cropped,
 * higher quality because logo edges show artefacts first. Matches today's w500.
 */
export const cardLogo = (path) => wsUrl(path, { w: 500, fit: 'contain', q: 90 });

/** Episode thumbnail on the watch page. Matches today's w300. */
export const episodeStill = (path) => wsUrl(path, { w: 300 });
