/**
 * Streamflix Kids Catalog Builder
 * 
 * Sources and builds targeted Kids catalogs (Family, Animation, Kids TV, Family TV)
 * with strict US rating hydration and composite mediaKey deduplication.
 */

import { tmdbJson, filterKidsCandidates } from './tmdbClient';
import { mediaKey } from './mediaData';

export const TMDB_GENRES = Object.freeze({
  ANIMATION: 16,
  FAMILY: 10751,
  KIDS_TV: 10762
});

/**
 * Fetches candidate family movies with US PG prefilters.
 * @param {number} [page=1]
 * @param {Object} [options]
 * @returns {Promise<Array<Object>>}
 */
export async function fetchFamilyMovieCandidates(page = 1, { signal, cacheNamespace = 'kids_catalog' } = {}) {
  const data = await tmdbJson('/discover/movie', {
    params: {
      with_genres: TMDB_GENRES.FAMILY,
      certification_country: 'US',
      'certification.lte': 'PG',
      include_adult: 'false',
      sort_by: 'popularity.desc',
      page
    },
    signal,
    cacheNamespace
  });
  return (data?.results || []).map((m) => ({ ...m, media_type: 'movie' }));
}

/**
 * Fetches candidate animation movies with US PG prefilters.
 * @param {number} [page=1]
 * @param {Object} [options]
 * @returns {Promise<Array<Object>>}
 */
export async function fetchAnimationMovieCandidates(page = 1, { signal, cacheNamespace = 'kids_catalog' } = {}) {
  const data = await tmdbJson('/discover/movie', {
    params: {
      with_genres: TMDB_GENRES.ANIMATION,
      certification_country: 'US',
      'certification.lte': 'PG',
      include_adult: 'false',
      sort_by: 'popularity.desc',
      page
    },
    signal,
    cacheNamespace
  });
  return (data?.results || []).map((m) => ({ ...m, media_type: 'movie' }));
}

/**
 * Fetches candidate kids TV series.
 * @param {number} [page=1]
 * @param {Object} [options]
 * @returns {Promise<Array<Object>>}
 */
export async function fetchKidsTvCandidates(page = 1, { signal, cacheNamespace = 'kids_catalog' } = {}) {
  const data = await tmdbJson('/discover/tv', {
    params: {
      with_genres: TMDB_GENRES.KIDS_TV,
      sort_by: 'popularity.desc',
      page
    },
    signal,
    cacheNamespace
  });
  return (data?.results || []).map((s) => ({ ...s, media_type: 'tv' }));
}

/**
 * Fetches candidate family TV series.
 * @param {number} [page=1]
 * @param {Object} [options]
 * @returns {Promise<Array<Object>>}
 */
export async function fetchFamilyTvCandidates(page = 1, { signal, cacheNamespace = 'kids_catalog' } = {}) {
  const data = await tmdbJson('/discover/tv', {
    params: {
      with_genres: TMDB_GENRES.FAMILY,
      sort_by: 'popularity.desc',
      page
    },
    signal,
    cacheNamespace
  });
  return (data?.results || []).map((s) => ({ ...s, media_type: 'tv' }));
}

/**
 * Deduplicates a list of media items by composite mediaKey.
 * @param {Array<Object>} items
 * @returns {Array<Object>}
 */
export function deduplicateMedia(items = []) {
  const seen = new Set();
  const deduped = [];

  for (const item of items) {
    if (!item || !item.id) continue;
    const type = item.media_type || (item.first_air_date ? 'tv' : 'movie');
    const key = mediaKey(type, item.id);
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(item);
    }
  }

  return deduped;
}

/**
 * Builds an approved, normalized Kids catalog grouped by section and source.
 * 
 * - Preserves source order for candidates passing policy.
 * - Hydrates no more than 60 candidates per bounded request with concurrency 4.
 * - Deduplicates by composite mediaKey.
 * - Aborts promptly when signal is aborted.
 * 
 * @param {Object} [options]
 * @param {string} [options.section='home']
 * @param {AbortSignal} [options.signal]
 * @param {number} [options.maxPages=2]
 * @param {number} [options.concurrency=4]
 * @param {string} [options.cacheNamespace='kids_catalog']
 * @returns {Promise<{
 *   bannerItems: Array<Object>,
 *   sections: {
 *     familyMovies: Array<Object>,
 *     animationMovies: Array<Object>,
 *     kidsShows: Array<Object>,
 *     familyShows: Array<Object>
 *   },
 *   allApproved: Array<Object>
 * }>}
 */
export async function buildKidsCatalog({
  _section = 'home',
  signal,
  _maxPages = 2,
  concurrency = 4,
  cacheNamespace = 'kids_catalog'
} = {}) {
  // 1. Fetch targeted candidates in parallel
  const [
    familyMovieCandidates,
    animationMovieCandidates,
    kidsTvCandidates,
    familyTvCandidates
  ] = await Promise.all([
    fetchFamilyMovieCandidates(1, { signal, cacheNamespace }),
    fetchAnimationMovieCandidates(1, { signal, cacheNamespace }),
    fetchKidsTvCandidates(1, { signal, cacheNamespace }),
    fetchFamilyTvCandidates(1, { signal, cacheNamespace })
  ]);

  if (signal?.aborted) {
    const err = new Error('The operation was aborted');
    err.name = 'AbortError';
    throw err;
  }

  // 2. Filter & hydrate each section through Kids policy
  const [
    approvedFamilyMovies,
    approvedAnimationMovies,
    approvedKidsShows,
    approvedFamilyShows
  ] = await Promise.all([
    filterKidsCandidates(familyMovieCandidates, { signal, concurrency, maxCandidates: 20 }),
    filterKidsCandidates(animationMovieCandidates, { signal, concurrency, maxCandidates: 20 }),
    filterKidsCandidates(kidsTvCandidates, { signal, concurrency, maxCandidates: 20 }),
    filterKidsCandidates(familyTvCandidates, { signal, concurrency, maxCandidates: 20 })
  ]);

  // 3. Assemble distinct allApproved list and banner items
  const combined = [
    ...approvedFamilyMovies,
    ...approvedAnimationMovies,
    ...approvedKidsShows,
    ...approvedFamilyShows
  ];

  const allApproved = deduplicateMedia(combined);

  // Top items with backdrops for banner slider
  const bannerItems = allApproved
    .filter((item) => Boolean(item.backdrop_path))
    .slice(0, 10);

  return {
    bannerItems,
    sections: {
      familyMovies: deduplicateMedia(approvedFamilyMovies),
      animationMovies: deduplicateMedia(approvedAnimationMovies),
      kidsShows: deduplicateMedia(approvedKidsShows),
      familyShows: deduplicateMedia(approvedFamilyShows)
    },
    allApproved
  };
}
