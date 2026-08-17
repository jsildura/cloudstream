/**
 * Streamflix TMDB Client with Bounded Hydration and Kids Cache Namespaces
 */

import {
  extractUsMovieCertification,
  extractUsTvRating,
  isMovieRatingAllowed,
  isTvRatingAllowed
} from './kidsPolicy';

const tmdbCache = new Map(); // namespace -> Map(cacheKey, { data, timestamp })

/**
 * Builds a deterministic URL with sorted query parameters.
 * @param {string} path - TMDB path (e.g. "/movie/550" or "discover/movie")
 * @param {Object} params - Query parameters
 * @returns {string} Relative URL string starting with "/api/..."
 */
export function buildSortedQueryUrl(path, params = {}) {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const base = typeof window !== 'undefined' && window.location?.origin
    ? window.location.origin
    : 'http://localhost';
  const url = new URL(`/api${cleanPath}`, base);

  const sortedKeys = Object.keys(params).sort();
  for (const k of sortedKeys) {
    const v = params[k];
    if (v !== undefined && v !== null && v !== '') {
      url.searchParams.set(k, String(v));
    }
  }

  return url.pathname + url.search;
}

/**
 * Clears cached TMDB responses.
 * @param {string} [namespace] - Specific namespace to clear, or clears all if omitted
 */
export function clearTmdbCache(namespace) {
  if (namespace) {
    tmdbCache.delete(namespace);
  } else {
    tmdbCache.clear();
  }
}

/**
 * Fetches JSON from TMDB via /api proxy with sorted query parameters,
 * namespace caching, non-2xx error handling, and AbortError propagation.
 * 
 * @param {string} path - TMDB endpoint path
 * @param {Object} [options]
 * @param {Object} [options.params] - Query parameters
 * @param {AbortSignal} [options.signal] - Abort controller signal
 * @param {number} [options.cacheTtlMs=600000] - Cache TTL in milliseconds (default 10m)
 * @param {string} [options.cacheNamespace='default'] - Cache namespace
 * @returns {Promise<any>}
 */
export async function tmdbJson(path, {
  params = {},
  signal,
  cacheTtlMs = 600000,
  cacheNamespace = 'default'
} = {}) {
  const url = buildSortedQueryUrl(path, params);

  // Check namespace cache
  let nsCache = tmdbCache.get(cacheNamespace);
  if (!nsCache) {
    nsCache = new Map();
    tmdbCache.set(cacheNamespace, nsCache);
  }

  const cached = nsCache.get(url);
  const now = Date.now();
  if (cached && (now - cached.timestamp < cacheTtlMs)) {
    return cached.data;
  }

  if (signal?.aborted) {
    const err = new Error('The operation was aborted');
    err.name = 'AbortError';
    throw err;
  }

  const response = await fetch(url, {
    signal,
    headers: {
      Accept: 'application/json'
    }
  });

  if (!response.ok) {
    const err = new Error(`TMDB HTTP error ${response.status}: ${response.statusText}`);
    err.status = response.status;
    err.statusText = response.statusText;
    throw err;
  }

  const data = await response.json();

  // Store in cache
  nsCache.set(url, { data, timestamp: now });

  return data;
}

/**
 * Fetches and verifies Kids rating for a single movie or TV show.
 * Caches approval/denial results in memory by `${type}_${id}`.
 * Request failures are not permanently cached.
 * 
 * @param {'movie' | 'tv' | string} type
 * @param {number | string} id
 * @param {Object} [options]
 * @param {AbortSignal} [options.signal]
 * @param {string} [options.cacheNamespace='kids_ratings']
 * @returns {Promise<{ approved: boolean, rating: string | null, type: string, id: number }>}
 */
export async function getKidsRating(type, id, {
  signal,
  cacheNamespace = 'kids_ratings'
} = {}) {
  const normType = (type || 'movie').toLowerCase();
  const numId = typeof id === 'number' ? id : parseInt(id, 10);
  const cacheKey = `${normType}_${numId}`;

  let nsCache = tmdbCache.get(cacheNamespace);
  if (!nsCache) {
    nsCache = new Map();
    tmdbCache.set(cacheNamespace, nsCache);
  }

  const cached = nsCache.get(cacheKey);
  if (cached) {
    return cached.data;
  }

  let rating = null;
  let approved = false;

  if (normType === 'movie') {
    const data = await tmdbJson(`/movie/${numId}/release_dates`, {
      signal,
      cacheNamespace: `${cacheNamespace}_raw`
    });
    rating = extractUsMovieCertification(data);
    approved = isMovieRatingAllowed(rating);
  } else if (normType === 'tv') {
    const data = await tmdbJson(`/tv/${numId}/content_ratings`, {
      signal,
      cacheNamespace: `${cacheNamespace}_raw`
    });
    rating = extractUsTvRating(data);
    approved = isTvRatingAllowed(rating);
  }

  const result = { approved, rating, type: normType, id: numId };

  // Cache approved and denied ratings
  nsCache.set(cacheKey, { data: result, timestamp: Date.now() });

  return result;
}

/**
 * Hydrates and filters a list of candidate titles with bounded concurrency and caps.
 * 
 * - Preserves source order of approved titles.
 * - Caps candidates to maxCandidates (default 60).
 * - Concurrency pool limit (default 4).
 * - Propagates abort signals immediately.
 * 
 * @param {Array<Object>} candidates
 * @param {Object} [options]
 * @param {AbortSignal} [options.signal]
 * @param {number} [options.concurrency=4]
 * @param {number} [options.maxCandidates=60]
 * @param {string} [options.cacheNamespace='kids_ratings']
 * @returns {Promise<Array<Object>>}
 */
export async function filterKidsCandidates(candidates = [], {
  signal,
  concurrency = 4,
  maxCandidates = 60,
  cacheNamespace = 'kids_ratings'
} = {}) {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return [];
  }

  const boundedList = candidates.slice(0, maxCandidates);
  const results = new Array(boundedList.length);

  let currentIndex = 0;

  async function worker() {
    while (currentIndex < boundedList.length) {
      if (signal?.aborted) {
        const err = new Error('The operation was aborted');
        err.name = 'AbortError';
        throw err;
      }

      const index = currentIndex++;
      const item = boundedList[index];

      if (!item || !item.id || item.adult === true) {
        results[index] = null;
        continue;
      }

      const type = item.type || item.media_type || (item.first_air_date || (item.name && !item.title) ? 'tv' : 'movie');

      try {
        const check = await getKidsRating(type, item.id, { signal, cacheNamespace });
        if (check.approved) {
          results[index] = {
            ...item,
            media_type: type,
            contentRating: check.rating,
            rating: check.rating
          };
        } else {
          results[index] = null;
        }
      } catch (err) {
        if (err?.name === 'AbortError') {
          throw err;
        }
        // Do not cache failures permanently, discard candidate
        results[index] = null;
      }
    }
  }

  const workers = [];
  const workerCount = Math.min(concurrency, boundedList.length);
  for (let i = 0; i < workerCount; i++) {
    workers.push(worker());
  }

  await Promise.all(workers);

  // Return approved items in exact input candidate order
  return results.filter(Boolean);
}
