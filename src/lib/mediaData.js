/**
 * Streamflix Media Data Utilities
 * 
 * Provides pure validation, normalization, and composite key helpers for
 * watchlist and watch history items stored in Firebase Realtime Database.
 */

export const MAX_WATCHLIST_ITEMS = 500;
export const MAX_HISTORY_ITEMS = 20;
export const MEDIA_KEY_REGEX = /^(movie|tv)_[0-9]+$/;
export const VALID_MEDIA_TYPES = Object.freeze(['movie', 'tv']);

const ALLOWED_WATCHLIST_KEYS = new Set([
  'id',
  'type',
  'title',
  'poster_path',
  'backdrop_path',
  'overview',
  'vote_average',
  'release_date',
  'genres',
  'addedAt'
]);

const ALLOWED_HISTORY_KEYS = new Set([
  'id',
  'type',
  'title',
  'poster_path',
  'backdrop_path',
  'lastWatched',
  'currentTime',
  'duration',
  'progress',
  'lastSeason',
  'lastEpisode',
  'totalSeasons',
  'genres'
]);

/**
 * Validates a composite media key (e.g., 'movie_123', 'tv_456').
 * @param {string} key
 * @returns {boolean}
 */
export function isValidMediaKey(key) {
  return typeof key === 'string' && MEDIA_KEY_REGEX.test(key);
}

/**
 * Creates a composite media key from media type and numeric ID.
 * @param {string} type - 'movie' or 'tv'
 * @param {number|string} id - positive numeric ID
 * @returns {string} e.g. 'movie_123'
 */
export function mediaKey(type, id) {
  if (!type || !VALID_MEDIA_TYPES.includes(type)) {
    throw new Error(`Invalid media type: '${type}'. Expected 'movie' or 'tv'`);
  }
  const numericId = typeof id === 'number' ? id : parseInt(id, 10);
  if (!Number.isInteger(numericId) || numericId <= 0) {
    throw new Error(`Invalid media ID: '${id}'. Must be a positive integer`);
  }
  return `${type}_${numericId}`;
}

/**
 * Normalizes genres into a keyed object `{ '28': true }`, never an array.
 * @param {Array|Object} rawGenres
 * @returns {Object<string, boolean>}
 */
export function normalizeGenres(rawGenres) {
  if (!rawGenres) {
    return {};
  }

  const result = {};

  if (Array.isArray(rawGenres)) {
    for (const item of rawGenres) {
      if (typeof item === 'number' && item > 0) {
        result[String(item)] = true;
      } else if (typeof item === 'string' && /^[0-9]+$/.test(item)) {
        result[item] = true;
      } else if (item && typeof item === 'object' && item.id) {
        const idStr = String(item.id);
        if (/^[0-9]+$/.test(idStr)) {
          result[idStr] = true;
        }
      }
    }
  } else if (typeof rawGenres === 'object') {
    for (const [key, value] of Object.entries(rawGenres)) {
      if (/^[0-9]+$/.test(key) && Boolean(value)) {
        result[key] = true;
      }
    }
  }

  return result;
}

/**
 * Normalizes a raw watchlist item into schema-conforming object.
 * @param {Object} raw
 * @returns {Object|null}
 */
export function normalizeWatchlistItem(raw = {}) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const id = typeof raw.id === 'number' ? raw.id : parseInt(raw.id, 10);
  if (!Number.isInteger(id) || id <= 0) {
    return null;
  }

  const rawType = raw.type || raw.media_type;
  const inferredType = (raw.first_air_date || (raw.name && !raw.title)) ? 'tv' : 'movie';
  const type = VALID_MEDIA_TYPES.includes(rawType) ? rawType : (rawType === undefined ? inferredType : null);
  if (!type) {
    return null;
  }

  const rawTitle = raw.title || raw.name;
  const title = typeof rawTitle === 'string' ? rawTitle.trim() : '';
  if (!title) {
    return null;
  }

  const addedAt = (typeof raw.addedAt === 'number' && Number.isFinite(raw.addedAt) && raw.addedAt > 0)
    ? raw.addedAt
    : Date.now();

  const item = {
    id,
    type,
    title,
    addedAt
  };

  if (typeof raw.poster_path === 'string' && raw.poster_path.trim().length > 0) {
    item.poster_path = raw.poster_path.trim();
  }
  if (typeof raw.backdrop_path === 'string' && raw.backdrop_path.trim().length > 0) {
    item.backdrop_path = raw.backdrop_path.trim();
  }
  if (typeof raw.overview === 'string' && raw.overview.trim().length > 0) {
    item.overview = raw.overview.trim();
  }
  if (typeof raw.vote_average === 'number' && Number.isFinite(raw.vote_average)) {
    item.vote_average = raw.vote_average;
  }
  const releaseDate = raw.release_date || raw.first_air_date;
  if (typeof releaseDate === 'string' && releaseDate.trim().length > 0) {
    item.release_date = releaseDate.trim();
  }

  const genres = normalizeGenres(raw.genres || raw.genre_ids);
  if (Object.keys(genres).length > 0) {
    item.genres = genres;
  }

  return item;
}

/**
 * Validates a watchlist item against database schema rules.
 * @param {Object} item
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateWatchlistItem(item) {
  const errors = [];
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    return { valid: false, errors: ['Watchlist item must be a non-null object'] };
  }

  for (const key of Object.keys(item)) {
    if (!ALLOWED_WATCHLIST_KEYS.has(key)) {
      errors.push(`Unknown field '${key}'`);
    }
    if (item[key] === undefined) {
      errors.push(`Field '${key}' cannot be undefined`);
    }
  }

  if (typeof item.id !== 'number' || !Number.isInteger(item.id) || item.id <= 0) {
    errors.push('id must be a positive integer');
  }

  if (!VALID_MEDIA_TYPES.includes(item.type)) {
    errors.push("type must be 'movie' or 'tv'");
  }

  if (typeof item.title !== 'string' || item.title.trim().length === 0) {
    errors.push('title must be a non-empty string');
  }

  if (typeof item.addedAt !== 'number' || !Number.isFinite(item.addedAt) || item.addedAt <= 0) {
    errors.push('addedAt must be a positive number');
  }

  if (item.poster_path !== undefined && (typeof item.poster_path !== 'string' || item.poster_path.trim().length === 0)) {
    errors.push('poster_path must be a non-empty string');
  }
  if (item.backdrop_path !== undefined && (typeof item.backdrop_path !== 'string' || item.backdrop_path.trim().length === 0)) {
    errors.push('backdrop_path must be a non-empty string');
  }
  if (item.overview !== undefined && (typeof item.overview !== 'string' || item.overview.trim().length === 0)) {
    errors.push('overview must be a non-empty string');
  }
  if (item.vote_average !== undefined && (typeof item.vote_average !== 'number' || !Number.isFinite(item.vote_average))) {
    errors.push('vote_average must be a valid number');
  }
  if (item.release_date !== undefined && (typeof item.release_date !== 'string' || item.release_date.trim().length === 0)) {
    errors.push('release_date must be a non-empty string');
  }

  if (item.genres !== undefined) {
    if (typeof item.genres !== 'object' || Array.isArray(item.genres) || item.genres === null) {
      errors.push('genres must be a keyed object, not an array');
    } else {
      for (const [genreId, val] of Object.entries(item.genres)) {
        if (!/^[0-9]+$/.test(genreId) || val !== true) {
          errors.push(`Invalid genre mapping for key '${genreId}'`);
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Normalizes a raw watch history item into schema-conforming object.
 * @param {Object} raw
 * @returns {Object|null}
 */
export function normalizeHistoryItem(raw = {}) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const id = typeof raw.id === 'number' ? raw.id : parseInt(raw.id, 10);
  if (!Number.isInteger(id) || id <= 0) {
    return null;
  }

  const rawType = raw.type || raw.media_type;
  const inferredType = (raw.first_air_date || (raw.name && !raw.title)) ? 'tv' : 'movie';
  const type = VALID_MEDIA_TYPES.includes(rawType) ? rawType : (rawType === undefined ? inferredType : null);
  if (!type) {
    return null;
  }

  const rawTitle = raw.title || raw.name;
  const title = typeof rawTitle === 'string' ? rawTitle.trim() : '';
  if (!title) {
    return null;
  }

  const lastWatched = (typeof raw.lastWatched === 'number' && Number.isFinite(raw.lastWatched) && raw.lastWatched > 0)
    ? raw.lastWatched
    : Date.now();

  const currentTime = (typeof raw.currentTime === 'number' && Number.isFinite(raw.currentTime) && raw.currentTime >= 0)
    ? raw.currentTime
    : 0;

  const duration = (typeof raw.duration === 'number' && Number.isFinite(raw.duration) && raw.duration >= 0)
    ? raw.duration
    : 0;

  let progress = 0;
  if (typeof raw.progress === 'number' && Number.isFinite(raw.progress)) {
    progress = Math.min(1, Math.max(0, raw.progress));
  } else if (duration > 0) {
    progress = Math.min(1, Math.max(0, currentTime / duration));
  }

  const item = {
    id,
    type,
    title,
    lastWatched,
    currentTime,
    duration,
    progress
  };

  if (typeof raw.poster_path === 'string' && raw.poster_path.trim().length > 0) {
    item.poster_path = raw.poster_path.trim();
  }
  if (typeof raw.backdrop_path === 'string' && raw.backdrop_path.trim().length > 0) {
    item.backdrop_path = raw.backdrop_path.trim();
  }

  if (type === 'tv') {
    if (typeof raw.lastSeason === 'number' && Number.isInteger(raw.lastSeason) && raw.lastSeason >= 0) {
      item.lastSeason = raw.lastSeason;
    }
    if (typeof raw.lastEpisode === 'number' && Number.isInteger(raw.lastEpisode) && raw.lastEpisode >= 0) {
      item.lastEpisode = raw.lastEpisode;
    }
    if (typeof raw.totalSeasons === 'number' && Number.isInteger(raw.totalSeasons) && raw.totalSeasons >= 0) {
      item.totalSeasons = raw.totalSeasons;
    }
  }

  const genres = normalizeGenres(raw.genres || raw.genre_ids);
  if (Object.keys(genres).length > 0) {
    item.genres = genres;
  }

  return item;
}

/**
 * Validates a watch history item against database schema rules.
 * @param {Object} item
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateHistoryItem(item) {
  const errors = [];
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    return { valid: false, errors: ['History item must be a non-null object'] };
  }

  for (const key of Object.keys(item)) {
    if (!ALLOWED_HISTORY_KEYS.has(key)) {
      errors.push(`Unknown field '${key}'`);
    }
    if (item[key] === undefined) {
      errors.push(`Field '${key}' cannot be undefined`);
    }
  }

  if (typeof item.id !== 'number' || !Number.isInteger(item.id) || item.id <= 0) {
    errors.push('id must be a positive integer');
  }

  if (!VALID_MEDIA_TYPES.includes(item.type)) {
    errors.push("type must be 'movie' or 'tv'");
  }

  if (typeof item.title !== 'string' || item.title.trim().length === 0) {
    errors.push('title must be a non-empty string');
  }

  if (typeof item.lastWatched !== 'number' || !Number.isFinite(item.lastWatched) || item.lastWatched <= 0) {
    errors.push('lastWatched must be a positive number');
  }

  if (typeof item.currentTime !== 'number' || !Number.isFinite(item.currentTime) || item.currentTime < 0) {
    errors.push('currentTime must be a non-negative number');
  }

  if (typeof item.duration !== 'number' || !Number.isFinite(item.duration) || item.duration < 0) {
    errors.push('duration must be a non-negative number');
  }

  if (typeof item.progress !== 'number' || !Number.isFinite(item.progress) || item.progress < 0 || item.progress > 1) {
    errors.push('progress must be a number between 0 and 1');
  }

  if (item.poster_path !== undefined && typeof item.poster_path !== 'string') {
    errors.push('poster_path must be a string');
  }
  if (item.backdrop_path !== undefined && typeof item.backdrop_path !== 'string') {
    errors.push('backdrop_path must be a string');
  }

  if (item.type !== 'tv') {
    if (item.lastSeason !== undefined || item.lastEpisode !== undefined || item.totalSeasons !== undefined) {
      errors.push('TV episode/season fields are only allowed for TV items');
    }
  } else {
    if (item.lastSeason !== undefined && (typeof item.lastSeason !== 'number' || !Number.isInteger(item.lastSeason) || item.lastSeason < 0)) {
      errors.push('lastSeason must be a non-negative integer');
    }
    if (item.lastEpisode !== undefined && (typeof item.lastEpisode !== 'number' || !Number.isInteger(item.lastEpisode) || item.lastEpisode < 0)) {
      errors.push('lastEpisode must be a non-negative integer');
    }
    if (item.totalSeasons !== undefined && (typeof item.totalSeasons !== 'number' || !Number.isInteger(item.totalSeasons) || item.totalSeasons < 0)) {
      errors.push('totalSeasons must be a non-negative integer');
    }
  }

  if (item.genres !== undefined) {
    if (typeof item.genres !== 'object' || Array.isArray(item.genres) || item.genres === null) {
      errors.push('genres must be a keyed object, not an array');
    } else {
      for (const [genreId, val] of Object.entries(item.genres)) {
        if (!/^[0-9]+$/.test(genreId) || val !== true) {
          errors.push(`Invalid genre mapping for key '${genreId}'`);
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Normalizes legacy localStorage data into sanitized watchlist and history collections.
 * @param {Array|string} legacyWatchlist
 * @param {Array|string} legacyHistory
 * @returns {{
 *   watchlist: Array<Object>,
 *   history: Array<Object>,
 *   watchlistByKey: Object<string, Object>,
 *   historyByKey: Object<string, Object>,
 *   rejectedCount: number
 * }}
 */
export function normalizeLegacyData(legacyWatchlist, legacyHistory) {
  let rawWatchlist = legacyWatchlist;
  let rawHistory = legacyHistory;

  if (typeof rawWatchlist === 'string') {
    try {
      rawWatchlist = JSON.parse(rawWatchlist);
    } catch {
      rawWatchlist = [];
    }
  }
  if (typeof rawHistory === 'string') {
    try {
      rawHistory = JSON.parse(rawHistory);
    } catch {
      rawHistory = [];
    }
  }

  if (!Array.isArray(rawWatchlist)) rawWatchlist = [];
  if (!Array.isArray(rawHistory)) rawHistory = [];

  let rejectedCount = 0;
  const watchlistByKey = {};
  const historyByKey = {};

  for (const raw of rawWatchlist) {
    const item = normalizeWatchlistItem(raw);
    if (!item) {
      rejectedCount++;
      continue;
    }
    const key = mediaKey(item.type, item.id);
    if (!watchlistByKey[key]) {
      watchlistByKey[key] = item;
    }
  }

  for (const raw of rawHistory) {
    const item = normalizeHistoryItem(raw);
    if (!item) {
      rejectedCount++;
      continue;
    }
    const key = mediaKey(item.type, item.id);
    if (!historyByKey[key]) {
      historyByKey[key] = item;
    }
  }

  // Sort watchlist by addedAt descending, cap at MAX_WATCHLIST_ITEMS
  const watchlist = Object.values(watchlistByKey)
    .sort((a, b) => b.addedAt - a.addedAt)
    .slice(0, MAX_WATCHLIST_ITEMS);

  // Sort history by lastWatched descending, cap at MAX_HISTORY_ITEMS
  const history = Object.values(historyByKey)
    .sort((a, b) => b.lastWatched - a.lastWatched)
    .slice(0, MAX_HISTORY_ITEMS);

  const cappedWatchlistByKey = {};
  for (const item of watchlist) {
    cappedWatchlistByKey[mediaKey(item.type, item.id)] = item;
  }

  const cappedHistoryByKey = {};
  for (const item of history) {
    cappedHistoryByKey[mediaKey(item.type, item.id)] = item;
  }

  return {
    watchlist,
    history,
    watchlistByKey: cappedWatchlistByKey,
    historyByKey: cappedHistoryByKey,
    rejectedCount
  };
}
