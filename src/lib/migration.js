/**
 * Streamflix Profile Migration Utilities
 * 
 * Handles non-destructive merging of legacy localStorage watchlist/history
 * into cloud profile collections once per Google UID and browser origin.
 */

import {
  mediaKey,
  normalizeWatchlistItem,
  validateWatchlistItem,
  normalizeHistoryItem,
  validateHistoryItem,
  MAX_WATCHLIST_ITEMS,
  MAX_HISTORY_ITEMS
} from './mediaData';

export const STORAGE_MIGRATION_PREFIX = 'streamflix_profile_migration_v1:';
export const LEGACY_WATCHLIST_KEY = 'cineflix_watchlist';
export const LEGACY_HISTORY_KEY = 'cineflix_watch_history';

/**
 * Returns the localStorage key for tracking a user's migration decision.
 * @param {string} uid
 * @returns {string}
 */
export function getMigrationKey(uid) {
  if (!uid) return '';
  return `${STORAGE_MIGRATION_PREFIX}${uid}`;
}

/**
 * Gets the stored migration decision for a UID ('accepted', 'declined', or null).
 * @param {string} uid
 * @returns {'accepted' | 'declined' | null}
 */
export function getMigrationDecision(uid) {
  if (!uid || typeof window === 'undefined' || !window.localStorage) return null;
  try {
    const val = localStorage.getItem(getMigrationKey(uid));
    if (val === 'accepted' || val === 'declined') {
      return val;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Stores the migration decision for a UID.
 * @param {string} uid
 * @param {'accepted' | 'declined'} decision
 */
export function setMigrationDecision(uid, decision) {
  if (!uid || typeof window === 'undefined' || !window.localStorage) return;
  if (decision !== 'accepted' && decision !== 'declined') return;
  try {
    localStorage.setItem(getMigrationKey(uid), decision);
  } catch (err) {
    console.warn('[Migration] Failed to save migration decision:', err);
  }
}

/**
 * Safely parses legacy data from localStorage without modifying or deleting it.
 * @returns {{ legacyWatchlist: Array<any>, legacyHistory: Array<any> }}
 */
export function getLegacyStorageData() {
  if (typeof window === 'undefined' || !window.localStorage) {
    return { legacyWatchlist: [], legacyHistory: [] };
  }

  let legacyWatchlist = [];
  let legacyHistory = [];

  try {
    const rawWatchlist = localStorage.getItem(LEGACY_WATCHLIST_KEY);
    if (rawWatchlist) {
      const parsed = JSON.parse(rawWatchlist);
      if (Array.isArray(parsed)) legacyWatchlist = parsed;
    }
  } catch (e) {
    console.warn('[Migration] Error reading legacy watchlist:', e);
  }

  try {
    const rawHistory = localStorage.getItem(LEGACY_HISTORY_KEY);
    if (rawHistory) {
      const parsed = JSON.parse(rawHistory);
      if (Array.isArray(parsed)) legacyHistory = parsed;
    }
  } catch (e) {
    console.warn('[Migration] Error reading legacy history:', e);
  }

  return { legacyWatchlist, legacyHistory };
}

/**
 * Checks if there is any legacy data on this device eligible for migration.
 * @returns {boolean}
 */
export function hasLegacyData() {
  const { legacyWatchlist, legacyHistory } = getLegacyStorageData();
  return legacyWatchlist.length > 0 || legacyHistory.length > 0;
}

/**
 * Pure function to merge legacy device data into cloud profile data.
 * 
 * Rules:
 * - Cloud items win exact-key conflicts.
 * - Legacy items are sanitized and normalized.
 * - Nonpositive IDs, invalid types, or malformed records are rejected.
 * - History capped at 20 newest items.
 * - Watchlist capped at 500 items.
 * 
 * @param {Object} params
 * @param {Array|Object} params.cloudWatchlist - Existing cloud watchlist (array or byKey map)
 * @param {Array|Object} params.cloudHistory - Existing cloud history (array or byKey map)
 * @param {Array|string} params.legacyWatchlist - Raw legacy watchlist array or JSON
 * @param {Array|string} params.legacyHistory - Raw legacy history array or JSON
 * @returns {{
 *   watchlistByKey: Object<string, Object>,
 *   historyByKey: Object<string, Object>,
 *   rejectedRecords: number,
 *   watchlistItemsToMigrate: Array<Object>,
 *   historyItemsToMigrate: Array<Object>,
 *   totalLegacyWatchlist: number,
 *   totalLegacyHistory: number
 * }}
 */
export function mergeLegacyProfileData({
  cloudWatchlist = [],
  cloudHistory = [],
  legacyWatchlist = [],
  legacyHistory = []
} = {}) {
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

  let rejectedRecords = 0;

  // Build existing cloud maps
  const cloudWatchlistMap = {};
  const cloudHistoryMap = {};

  const cloudWList = Array.isArray(cloudWatchlist) ? cloudWatchlist : Object.values(cloudWatchlist || {});
  for (const item of cloudWList) {
    if (item && item.type && item.id) {
      try {
        const key = mediaKey(item.type, item.id);
        cloudWatchlistMap[key] = item;
      } catch {
        // Ignore invalid cloud keys
      }
    }
  }

  const cloudHList = Array.isArray(cloudHistory) ? cloudHistory : Object.values(cloudHistory || {});
  for (const item of cloudHList) {
    if (item && item.type && item.id) {
      try {
        const key = mediaKey(item.type, item.id);
        cloudHistoryMap[key] = item;
      } catch {
        // Ignore invalid cloud keys
      }
    }
  }

  // 1. Process legacy watchlist
  const mergedWatchlistByKey = { ...cloudWatchlistMap };
  const newWatchlistItems = [];

  for (const raw of rawWatchlist) {
    const normalized = normalizeWatchlistItem(raw);
    if (!normalized) {
      rejectedRecords++;
      continue;
    }
    const validation = validateWatchlistItem(normalized);
    if (!validation.valid) {
      rejectedRecords++;
      continue;
    }

    const key = mediaKey(normalized.type, normalized.id);
    // Cloud exact-key conflicts win: only add if not already in cloud
    if (!cloudWatchlistMap[key]) {
      if (!mergedWatchlistByKey[key]) {
        mergedWatchlistByKey[key] = normalized;
        newWatchlistItems.push(normalized);
      }
    }
  }

  // 2. Process legacy history
  const mergedHistoryByKey = { ...cloudHistoryMap };
  const newHistoryItems = [];

  for (const raw of rawHistory) {
    const normalized = normalizeHistoryItem(raw);
    if (!normalized) {
      rejectedRecords++;
      continue;
    }
    const validation = validateHistoryItem(normalized);
    if (!validation.valid) {
      rejectedRecords++;
      continue;
    }

    const key = mediaKey(normalized.type, normalized.id);
    // Cloud exact-key conflicts win: only add if not already in cloud
    if (!cloudHistoryMap[key]) {
      if (!mergedHistoryByKey[key]) {
        mergedHistoryByKey[key] = normalized;
        newHistoryItems.push(normalized);
      }
    }
  }

  // Cap watchlist at 500 items, sorted by addedAt desc
  const sortedWatchlist = Object.values(mergedWatchlistByKey)
    .sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0))
    .slice(0, MAX_WATCHLIST_ITEMS);

  const finalWatchlistByKey = {};
  for (const item of sortedWatchlist) {
    finalWatchlistByKey[mediaKey(item.type, item.id)] = item;
  }

  // Cap history at 20 items, sorted by lastWatched desc
  const sortedHistory = Object.values(mergedHistoryByKey)
    .sort((a, b) => (b.lastWatched || 0) - (a.lastWatched || 0))
    .slice(0, MAX_HISTORY_ITEMS);

  const finalHistoryByKey = {};
  for (const item of sortedHistory) {
    finalHistoryByKey[mediaKey(item.type, item.id)] = item;
  }

  // Filter items to migrate to only those that will be written into Firebase
  const watchlistItemsToMigrate = newWatchlistItems.filter(
    (item) => finalWatchlistByKey[mediaKey(item.type, item.id)] !== undefined
  );
  const historyItemsToMigrate = newHistoryItems.filter(
    (item) => finalHistoryByKey[mediaKey(item.type, item.id)] !== undefined
  );

  return {
    watchlistByKey: finalWatchlistByKey,
    historyByKey: finalHistoryByKey,
    rejectedRecords,
    watchlistItemsToMigrate,
    historyItemsToMigrate,
    totalLegacyWatchlist: rawWatchlist.length,
    totalLegacyHistory: rawHistory.length
  };
}
