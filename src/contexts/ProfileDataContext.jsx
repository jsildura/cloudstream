import React, { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useAuth } from './AuthContext';
import { useProfiles } from './ProfileContext';
import { initFirebase } from '../lib/firebase';
import { registerPendingHistoryFlush } from '../lib/pendingHistoryFlush';
import {
  mediaKey,
  isValidMediaKey,
  normalizeWatchlistItem,
  validateWatchlistItem,
  normalizeHistoryItem,
  validateHistoryItem,
  MAX_WATCHLIST_ITEMS,
  MAX_HISTORY_ITEMS
} from '../lib/mediaData';
import {
  getMigrationDecision,
  setMigrationDecision,
  hasLegacyData,
  getLegacyStorageData,
  mergeLegacyProfileData
} from '../lib/migration';
import { filterKidsCandidates } from '../lib/tmdbClient';

export const ANONYMOUS_HISTORY_KEY = 'cineflix_watch_history';
export const PROGRESS_THROTTLE_MS = 15000; // 15 seconds

const ProfileDataContext = createContext({
  watchlist: [],
  watchHistory: [],
  isWatchlistLoading: false,
  isHistoryLoading: false,
  isLoaded: false,
  profileDataError: null,
  isMigrationRequired: false,
  isMigrating: false,
  migrationPreview: { legacyWatchlistCount: 0, legacyHistoryCount: 0 },
  acceptMigration: async () => ({ ok: false }),
  declineMigration: async () => ({ ok: false }),
  isInWatchlist: () => false,
  addToWatchlist: async () => ({ ok: false }),
  removeFromWatchlist: async () => ({ ok: false }),
  toggleWatchlist: async () => ({ ok: false }),
  clearWatchlist: async () => ({ ok: false }),
  isInHistory: () => false,
  addToHistory: async () => ({ ok: false }),
  updateProgress: async () => ({ ok: false }),
  getLastWatched: () => null,
  removeFromHistory: async () => ({ ok: false }),
  clearHistory: async () => ({ ok: false }),
  flushPendingHistory: async () => {}
});

export const useProfileData = () => useContext(ProfileDataContext);

/**
 * Helper to resolve (type, id) or (item) or (id) into { type, id, key }
 */
function resolveMediaIdentifier(typeOrItemOrId, maybeId, fallbackList = []) {
  if (!typeOrItemOrId) return null;

  if (typeof typeOrItemOrId === 'object') {
    const rawType = typeOrItemOrId.type || typeOrItemOrId.media_type || (typeOrItemOrId.first_air_date || (typeOrItemOrId.name && !typeOrItemOrId.title) ? 'tv' : 'movie');
    const rawId = typeOrItemOrId.id;
    if (!rawId) return null;
    const numId = typeof rawId === 'number' ? rawId : parseInt(rawId, 10);
    if (!Number.isInteger(numId) || numId <= 0) return null;
    return { type: rawType, id: numId, key: `${rawType}_${numId}` };
  }

  if (maybeId !== undefined && maybeId !== null) {
    const type = typeOrItemOrId;
    const numId = typeof maybeId === 'number' ? maybeId : parseInt(maybeId, 10);
    if (!Number.isInteger(numId) || numId <= 0) return null;
    return { type, id: numId, key: `${type}_${numId}` };
  }

  // Bare ID provided: look up in fallback list or default to 'movie'
  const numId = typeof typeOrItemOrId === 'number' ? typeOrItemOrId : parseInt(typeOrItemOrId, 10);
  if (!Number.isInteger(numId) || numId <= 0) return null;

  const found = fallbackList.find((item) => item.id === numId);
  const type = found?.type || 'movie';
  return { type, id: numId, key: `${type}_${numId}` };
}

/**
 * Builds the pendingWrites map key for a throttled history write.
 * The owner is baked into the key so two profiles with a pending write for the
 * same title cannot overwrite each other.
 */
function pendingWriteKey(uid, profileId, key) {
  return `${uid}/${profileId}/${key}`;
}

export const ProfileDataProvider = ({ children }) => {
  const { accountUser, isSignedIn } = useAuth();
  const { activeProfileId, isProfileLoading, isKidsMode } = useProfiles();

  // Cloud state
  const [cloudWatchlist, setCloudWatchlist] = useState([]);
  const [cloudHistory, setCloudHistory] = useState([]);
  const [isCloudWatchlistLoading, setIsCloudWatchlistLoading] = useState(false);
  const [isCloudHistoryLoading, setIsCloudHistoryLoading] = useState(false);
  const [profileDataError, setProfileDataError] = useState(null);

  // Kids filtered state
  const [kidsWatchlist, setKidsWatchlist] = useState([]);
  const [kidsHistory, setKidsHistory] = useState([]);
  const [isKidsFilterLoading, setIsKidsFilterLoading] = useState(false);

  // Migration state
  const [isMigrationRequired, setIsMigrationRequired] = useState(false);
  const [isMigrating, setIsMigrating] = useState(false);

  // Anonymous state (only for history, watchlist is never in anonymous storage)
  const [anonymousHistory, setAnonymousHistory] = useState([]);
  const [isAnonymousHistoryLoaded, setIsAnonymousHistoryLoaded] = useState(false);

  const pendingWritesRef = useRef(new Map()); // `${uid}/${profileId}/${mediaKey}` -> { uid, profileId, mediaKey, item, timestamp, timerId }
  const isMountedRef = useRef(true);
  const activeProfileRef = useRef(activeProfileId);
  const uidRef = useRef(accountUser?.uid || null);
  const isSignedInRef = useRef(isSignedIn);
  const accountUserRef = useRef(accountUser);
  const anonymousHistoryRef = useRef(anonymousHistory);
  const cloudHistoryRef = useRef(cloudHistory);
  const cloudWatchlistRef = useRef(cloudWatchlist);
  const currentHistoryRef = useRef([]);
  const currentWatchlistRef = useRef([]);

  activeProfileRef.current = activeProfileId;
  uidRef.current = accountUser?.uid || null;
  isSignedInRef.current = isSignedIn;
  accountUserRef.current = accountUser;
  anonymousHistoryRef.current = anonymousHistory;
  cloudHistoryRef.current = cloudHistory;
  cloudWatchlistRef.current = cloudWatchlist;

  // ─────────────────────────────────────────────
  // 1. ANONYMOUS HISTORY (Signed-out)
  // ─────────────────────────────────────────────
  const loadAnonymousHistory = useCallback(() => {
    try {
      const stored = localStorage.getItem(ANONYMOUS_HISTORY_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          const list = parsed
            .map((raw) => normalizeHistoryItem(raw))
            .filter(Boolean)
            .sort((a, b) => (b.lastWatched || 0) - (a.lastWatched || 0))
            .slice(0, MAX_HISTORY_ITEMS);
          setAnonymousHistory(list);
        }
      }
    } catch (e) {
      console.warn('[ProfileData] Failed to parse anonymous history:', e);
    } finally {
      setIsAnonymousHistoryLoaded(true);
    }
  }, []);

  const saveAnonymousHistory = useCallback((items) => {
    setAnonymousHistory(items);
    try {
      localStorage.setItem(ANONYMOUS_HISTORY_KEY, JSON.stringify(items));
    } catch (e) {
      console.warn('[ProfileData] Failed to save anonymous history:', e);
    }
  }, []);

  // ─────────────────────────────────────────────
  // 2. FLUSH PENDING THROTTLED WRITES
  // ─────────────────────────────────────────────
  /**
   * Writes queued throttled history items to the owner recorded on each entry.
   * Entries are always removed from the map — even when they cannot be written —
   * so a signed-out entry can never be inherited by the next account.
   */
  const flushPendingHistory = useCallback(async (specificKey = null) => {
    const currentUid = uidRef.current;
    const pendingWrites = pendingWritesRef.current;
    if (pendingWrites.size === 0) return;

    const keysToFlush = specificKey
      ? [specificKey]
      : Array.from(pendingWrites.keys());

    const writable = [];

    for (const key of keysToFlush) {
      const pending = pendingWrites.get(key);
      if (!pending) continue;

      if (pending.timerId) clearTimeout(pending.timerId);
      pendingWrites.delete(key); // always drain, even if unwritable

      // Security rules reject writes for a uid that is no longer authenticated,
      // so drop those instead of misfiling them under the current account.
      if (!pending.uid || !pending.profileId || pending.uid !== currentUid) continue;

      writable.push(pending);
    }

    if (writable.length === 0) return;

    try {
      const { db } = initFirebase();
      await Promise.all(
        writable.map((pending) => {
          const itemPath = `profileData/${pending.uid}/${pending.profileId}/watchHistory/${pending.mediaKey}`;
          return db.ref(itemPath).set(pending.item);
        })
      );
    } catch (err) {
      console.error('[ProfileData] flushPendingHistory error:', err);
    }
  }, []);

  // AuthProvider sits above this provider, so it cannot reach the flush through
  // context. Register it so sign-out can persist queued writes while the account
  // token is still valid.
  useEffect(() => registerPendingHistoryFlush(flushPendingHistory), [flushPendingHistory]);

  // Flush on visibility hidden, pagehide/beforeunload
  useEffect(() => {
    const handleVisibilityOrUnload = () => {
      if (document.visibilityState === 'hidden') {
        flushPendingHistory();
      }
    };

    window.addEventListener('visibilitychange', handleVisibilityOrUnload);
    window.addEventListener('pagehide', handleVisibilityOrUnload);
    window.addEventListener('beforeunload', handleVisibilityOrUnload);

    return () => {
      window.removeEventListener('visibilitychange', handleVisibilityOrUnload);
      window.removeEventListener('pagehide', handleVisibilityOrUnload);
      window.removeEventListener('beforeunload', handleVisibilityOrUnload);
      flushPendingHistory();
    };
  }, [flushPendingHistory]);

  // ─────────────────────────────────────────────
  // 3. CLOUD LISTENERS (Signed-in)
  // ─────────────────────────────────────────────
  useEffect(() => {
    isMountedRef.current = true;
    let watchlistRef = null;
    let historyRef = null;

    if (!isSignedIn || !accountUser || !activeProfileId) {
      // Clear cloud state synchronously
      setCloudWatchlist([]);
      setCloudHistory([]);
      setIsCloudWatchlistLoading(false);
      setIsCloudHistoryLoading(false);
      setProfileDataError(null);
      setIsMigrationRequired(false);

      // Lazy load anonymous history if not yet loaded
      if (!isAnonymousHistoryLoaded) {
        loadAnonymousHistory();
      }

      return () => {
        isMountedRef.current = false;
        flushPendingHistory();
      };
    }

    const uid = accountUser.uid;
    setIsCloudWatchlistLoading(true);
    setIsCloudHistoryLoading(true);
    setProfileDataError(null);

    try {
      const { db } = initFirebase();

      // Watchlist listener
      watchlistRef = db.ref(`profileData/${uid}/${activeProfileId}/watchlist`);
      watchlistRef.on('value', (snapshot) => {
        if (!isMountedRef.current) return;
        if (!snapshot.exists()) {
          setCloudWatchlist([]);
          setIsCloudWatchlistLoading(false);
          return;
        }

        const data = snapshot.val();
        const items = Object.entries(data || {})
          .map(([key, val]) => {
            if (!isValidMediaKey(key)) return null;
            return normalizeWatchlistItem(val);
          })
          .filter(Boolean)
          .sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));

        setCloudWatchlist(items);
        setIsCloudWatchlistLoading(false);
      }, (err) => {
        console.error('[ProfileData] Watchlist listener error:', err);
        if (isMountedRef.current) {
          setProfileDataError(err.message || 'Failed to load watchlist');
          setIsCloudWatchlistLoading(false);
        }
      });

      // History listener
      historyRef = db.ref(`profileData/${uid}/${activeProfileId}/watchHistory`);
      historyRef.on('value', (snapshot) => {
        if (!isMountedRef.current) return;
        if (!snapshot.exists()) {
          setCloudHistory([]);
          setIsCloudHistoryLoading(false);
          return;
        }

        const data = snapshot.val();
        const items = Object.entries(data || {})
          .map(([key, val]) => {
            if (!isValidMediaKey(key)) return null;
            return normalizeHistoryItem(val);
          })
          .filter(Boolean)
          .sort((a, b) => (b.lastWatched || 0) - (a.lastWatched || 0))
          .slice(0, MAX_HISTORY_ITEMS);

        setCloudHistory(items);
        setIsCloudHistoryLoading(false);
      }, (err) => {
        console.error('[ProfileData] History listener error:', err);
        if (isMountedRef.current) {
          setProfileDataError(err.message || 'Failed to load watch history');
          setIsCloudHistoryLoading(false);
        }
      });
    } catch (err) {
      console.error('[ProfileData] DB setup error:', err);
      if (isMountedRef.current) {
        setProfileDataError(err.message || 'Database unavailable');
        setIsCloudWatchlistLoading(false);
        setIsCloudHistoryLoading(false);
      }
    }

    return () => {
      isMountedRef.current = false;
      // Each pending entry carries its own owner, so flushing here persists the
      // profile/account we are leaving rather than the one being switched to.
      flushPendingHistory();
      if (watchlistRef) watchlistRef.off();
      if (historyRef) historyRef.off();
    };
  }, [
    isSignedIn,
    accountUser,
    activeProfileId,
    flushPendingHistory,
    isAnonymousHistoryLoaded,
    loadAnonymousHistory
  ]);

  // ─────────────────────────────────────────────
  // 4. MIGRATION EVALUATION
  // ─────────────────────────────────────────────
  useEffect(() => {
    if (!isSignedIn || !accountUser?.uid || !activeProfileId) {
      setIsMigrationRequired(false);
      return;
    }

    if (isProfileLoading || isCloudWatchlistLoading || isCloudHistoryLoading) {
      return; // Wait until initial cloud snapshot arrives
    }

    const decision = getMigrationDecision(accountUser.uid);
    if (decision === null && hasLegacyData()) {
      setIsMigrationRequired(true);
    } else {
      setIsMigrationRequired(false);
    }
  }, [
    isSignedIn,
    accountUser,
    activeProfileId,
    isProfileLoading,
    isCloudWatchlistLoading,
    isCloudHistoryLoading
  ]);

  const migrationPreview = useMemo(() => {
    if (!isSignedIn) return { legacyWatchlistCount: 0, legacyHistoryCount: 0 };
    const { legacyWatchlist, legacyHistory } = getLegacyStorageData();
    return {
      legacyWatchlistCount: legacyWatchlist.length,
      legacyHistoryCount: legacyHistory.length
    };
  }, [isSignedIn]);

  const acceptMigration = useCallback(async () => {
    if (!isSignedIn || !accountUser?.uid || !activeProfileId) {
      return { ok: false, reason: 'sign-in-required' };
    }

    const uid = accountUser.uid;
    const profileId = activeProfileId;
    setIsMigrating(true);

    try {
      const { legacyWatchlist, legacyHistory } = getLegacyStorageData();
      const merged = mergeLegacyProfileData({
        cloudWatchlist,
        cloudHistory,
        legacyWatchlist,
        legacyHistory
      });

      const updates = {};

      for (const item of merged.watchlistItemsToMigrate) {
        const key = mediaKey(item.type, item.id);
        updates[`profileData/${uid}/${profileId}/watchlist/${key}`] = item;
      }

      for (const item of merged.historyItemsToMigrate) {
        const key = mediaKey(item.type, item.id);
        updates[`profileData/${uid}/${profileId}/watchHistory/${key}`] = item;
      }

      if (Object.keys(updates).length > 0) {
        const { db } = initFirebase();
        await db.ref().update(updates);
      }

      // Write decision only after successful write
      setMigrationDecision(uid, 'accepted');
      setIsMigrationRequired(false);
      return {
        ok: true,
        migratedWatchlist: merged.watchlistItemsToMigrate.length,
        migratedHistory: merged.historyItemsToMigrate.length
      };
    } catch (err) {
      console.error('[ProfileData] Migration error:', err);
      return { ok: false, error: err, message: err.message || 'Migration failed' };
    } finally {
      setIsMigrating(false);
    }
  }, [isSignedIn, accountUser, activeProfileId, cloudWatchlist, cloudHistory]);

  const declineMigration = useCallback(async () => {
    if (!isSignedIn || !accountUser?.uid) {
      return { ok: false, reason: 'sign-in-required' };
    }

    setMigrationDecision(accountUser.uid, 'declined');
    setIsMigrationRequired(false);
    return { ok: true };
  }, [isSignedIn, accountUser]);

  // Kids-mode filtering effect: filters visible watchlist and history without modifying cloud data
  useEffect(() => {
    if (!isKidsMode) {
      setKidsWatchlist([]);
      setKidsHistory([]);
      setIsKidsFilterLoading(false);
      return;
    }

    let isMounted = true;
    const controller = new AbortController();
    setIsKidsFilterLoading(true);

    async function filterCollections() {
      try {
        const rawW = isSignedIn ? cloudWatchlist : [];
        const rawH = isSignedIn ? cloudHistory : anonymousHistory;

        const [filteredW, filteredH] = await Promise.all([
          filterKidsCandidates(rawW, { signal: controller.signal }),
          filterKidsCandidates(rawH, { signal: controller.signal })
        ]);

        if (isMounted) {
          setKidsWatchlist(filteredW);
          setKidsHistory(filteredH);
          setIsKidsFilterLoading(false);
        }
      } catch (err) {
        if (isMounted && err?.name !== 'AbortError') {
          setIsKidsFilterLoading(false);
        }
      }
    }

    filterCollections();

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [isKidsMode, isSignedIn, cloudWatchlist, cloudHistory, anonymousHistory]);

  // Active collections
  const currentWatchlist = useMemo(() => {
    if (!isSignedIn || !accountUser) return [];
    if (isKidsMode) return kidsWatchlist;
    return cloudWatchlist;
  }, [isSignedIn, accountUser, isKidsMode, kidsWatchlist, cloudWatchlist]);

  const currentHistory = useMemo(() => {
    if (isKidsMode) return kidsHistory;
    if (!isSignedIn || !accountUser) return anonymousHistory;
    return cloudHistory;
  }, [isKidsMode, kidsHistory, isSignedIn, accountUser, anonymousHistory, cloudHistory]);

  currentWatchlistRef.current = currentWatchlist;
  currentHistoryRef.current = currentHistory;

  const isWatchlistLoading = useMemo(() => {
    if (!isSignedIn) return false;
    if (isKidsMode) return isProfileLoading || isCloudWatchlistLoading || isKidsFilterLoading;
    return isProfileLoading || isCloudWatchlistLoading;
  }, [isSignedIn, isKidsMode, isProfileLoading, isCloudWatchlistLoading, isKidsFilterLoading]);

  const isHistoryLoading = useMemo(() => {
    if (isKidsMode) return isProfileLoading || (isSignedIn ? isCloudHistoryLoading : !isAnonymousHistoryLoaded) || isKidsFilterLoading;
    if (!isSignedIn) return !isAnonymousHistoryLoaded;
    return isProfileLoading || isCloudHistoryLoading;
  }, [isKidsMode, isSignedIn, isAnonymousHistoryLoaded, isProfileLoading, isCloudHistoryLoading, isKidsFilterLoading]);

  const isLoaded = !isWatchlistLoading && !isHistoryLoading;

  // ─────────────────────────────────────────────
  // 5. WATCHLIST OPERATIONS
  // ─────────────────────────────────────────────
  const isInWatchlist = useCallback((typeOrItemOrId, maybeId) => {
    const list = currentWatchlistRef.current;
    const resolved = resolveMediaIdentifier(typeOrItemOrId, maybeId, list);
    if (!resolved) return false;
    return list.some((item) => item.type === resolved.type && item.id === resolved.id);
  }, []);

  const addToWatchlist = useCallback(async (rawItem) => {
    if (!isSignedInRef.current || !accountUserRef.current) {
      return { ok: false, reason: 'sign-in-required', message: 'Sign in to add to Watchlist' };
    }

    const profileId = activeProfileRef.current;
    if (!profileId) {
      return { ok: false, reason: 'no-active-profile', message: 'Active profile required' };
    }

    const normalized = normalizeWatchlistItem(rawItem);
    if (!normalized) {
      return { ok: false, reason: 'invalid-item', message: 'Invalid watchlist item format' };
    }

    const validation = validateWatchlistItem(normalized);
    if (!validation.valid) {
      return { ok: false, reason: 'validation-failed', errors: validation.errors };
    }

    const list = currentWatchlistRef.current;
    const alreadyIn = list.some((item) => item.type === normalized.type && item.id === normalized.id);
    if (list.length >= MAX_WATCHLIST_ITEMS && !alreadyIn) {
      return { ok: false, reason: 'max-items-reached', message: `Watchlist maximum is ${MAX_WATCHLIST_ITEMS} items` };
    }

    const uid = accountUserRef.current.uid;
    const key = mediaKey(normalized.type, normalized.id);

    try {
      const { db } = initFirebase();
      await db.ref(`profileData/${uid}/${profileId}/watchlist/${key}`).set(normalized);
      return { ok: true, item: normalized };
    } catch (err) {
      console.error('[ProfileData] addToWatchlist error:', err);
      return { ok: false, reason: 'write-failed', error: err, message: err.message };
    }
  }, []);

  const removeFromWatchlist = useCallback(async (typeOrItemOrId, maybeId) => {
    if (!isSignedInRef.current || !accountUserRef.current) {
      return { ok: false, reason: 'sign-in-required' };
    }

    const profileId = activeProfileRef.current;
    if (!profileId) {
      return { ok: false, reason: 'no-active-profile' };
    }

    const list = currentWatchlistRef.current;
    const resolved = resolveMediaIdentifier(typeOrItemOrId, maybeId, list);
    if (!resolved) {
      return { ok: false, reason: 'invalid-identifier' };
    }

    const uid = accountUserRef.current.uid;
    try {
      const { db } = initFirebase();
      await db.ref(`profileData/${uid}/${profileId}/watchlist/${resolved.key}`).set(null);
      return { ok: true };
    } catch (err) {
      console.error('[ProfileData] removeFromWatchlist error:', err);
      return { ok: false, reason: 'write-failed', error: err, message: err.message };
    }
  }, []);

  const toggleWatchlist = useCallback(async (item) => {
    if (!isSignedInRef.current || !accountUserRef.current) {
      return { ok: false, reason: 'sign-in-required', message: 'Sign in to add to Watchlist' };
    }

    const alreadyIn = isInWatchlist(item);
    if (alreadyIn) {
      const res = await removeFromWatchlist(item);
      if (res.ok) {
        return { ok: true, action: 'removed', inWatchlist: false };
      }
      return res;
    } else {
      const res = await addToWatchlist(item);
      if (res.ok) {
        return { ok: true, action: 'added', inWatchlist: true, item: res.item };
      }
      return res;
    }
  }, [isInWatchlist, removeFromWatchlist, addToWatchlist]);

  const clearWatchlist = useCallback(async () => {
    if (!isSignedInRef.current || !accountUserRef.current) {
      return { ok: false, reason: 'sign-in-required' };
    }

    const profileId = activeProfileRef.current;
    if (!profileId) {
      return { ok: false, reason: 'no-active-profile' };
    }

    const uid = accountUserRef.current.uid;
    try {
      const { db } = initFirebase();
      await db.ref(`profileData/${uid}/${profileId}/watchlist`).set(null);
      return { ok: true };
    } catch (err) {
      console.error('[ProfileData] clearWatchlist error:', err);
      return { ok: false, reason: 'write-failed', error: err, message: err.message };
    }
  }, []);

  // ─────────────────────────────────────────────
  // 6. HISTORY OPERATIONS
  // ─────────────────────────────────────────────
  const isInHistory = useCallback((typeOrItemOrId, maybeId) => {
    const list = currentHistoryRef.current;
    const resolved = resolveMediaIdentifier(typeOrItemOrId, maybeId, list);
    if (!resolved) return false;
    return list.some((item) => item.type === resolved.type && item.id === resolved.id);
  }, []);

  const getLastWatched = useCallback((typeOrItemOrId, maybeId) => {
    const list = currentHistoryRef.current;
    const resolved = resolveMediaIdentifier(typeOrItemOrId, maybeId, list);
    if (!resolved) return null;
    return list.find((item) => item.type === resolved.type && item.id === resolved.id) || null;
  }, []);

  const addToHistory = useCallback(async (rawItem) => {
    const normalized = normalizeHistoryItem(rawItem);
    if (!normalized) {
      return { ok: false, reason: 'invalid-item' };
    }

    const validation = validateHistoryItem(normalized);
    if (!validation.valid) {
      return { ok: false, reason: 'validation-failed', errors: validation.errors };
    }

    const key = mediaKey(normalized.type, normalized.id);

    if (!isSignedInRef.current || !accountUserRef.current) {
      // Anonymous history update
      const filtered = anonymousHistoryRef.current.filter(
        (i) => !(i.type === normalized.type && i.id === normalized.id)
      );
      const updated = [normalized, ...filtered].slice(0, MAX_HISTORY_ITEMS);
      saveAnonymousHistory(updated);
      return { ok: true, item: normalized };
    }

    // Cloud history update
    const profileId = activeProfileRef.current;
    if (!profileId) {
      return { ok: false, reason: 'no-active-profile' };
    }

    const uid = accountUserRef.current.uid;
    try {
      const { db } = initFirebase();
      const historyList = cloudHistoryRef.current;

      // Check if we need to evict the oldest entry
      const existingIndex = historyList.findIndex(
        (i) => i.type === normalized.type && i.id === normalized.id
      );

      const updates = {};
      updates[`profileData/${uid}/${profileId}/watchHistory/${key}`] = normalized;

      if (existingIndex === -1 && historyList.length >= MAX_HISTORY_ITEMS) {
        // Evict oldest item
        const oldestItem = historyList[historyList.length - 1];
        if (oldestItem) {
          const oldestKey = mediaKey(oldestItem.type, oldestItem.id);
          updates[`profileData/${uid}/${profileId}/watchHistory/${oldestKey}`] = null;
        }
      }

      await db.ref().update(updates);
      return { ok: true, item: normalized };
    } catch (err) {
      console.error('[ProfileData] addToHistory error:', err);
      return { ok: false, reason: 'write-failed', error: err, message: err.message };
    }
  }, [saveAnonymousHistory]);

  const updateProgress = useCallback(async (typeOrItemOrId, maybeIdOrTime, maybeDuration, extraDuration, extra = {}) => {
    let resolved = null;
    let currentTime = 0;
    let duration = 0;
    let extraData = {};

    const list = currentHistoryRef.current;

    if (typeof typeOrItemOrId === 'object') {
      resolved = resolveMediaIdentifier(typeOrItemOrId, null, list);
      currentTime = typeof maybeIdOrTime === 'number' ? maybeIdOrTime : (typeOrItemOrId.currentTime || 0);
      duration = typeof maybeDuration === 'number' ? maybeDuration : (typeOrItemOrId.duration || 0);
      extraData = extraDuration && typeof extraDuration === 'object' ? extraDuration : {};
    } else if (typeof typeOrItemOrId === 'string' && (typeOrItemOrId === 'movie' || typeOrItemOrId === 'tv')) {
      resolved = resolveMediaIdentifier(typeOrItemOrId, maybeIdOrTime, list);
      currentTime = typeof maybeDuration === 'number' ? maybeDuration : 0;
      duration = typeof extraDuration === 'number' ? extraDuration : 0;
      extraData = extra;
    } else {
      // Bare ID: updateProgress(id, currentTime, duration)
      resolved = resolveMediaIdentifier(typeOrItemOrId, null, list);
      currentTime = typeof maybeIdOrTime === 'number' ? maybeIdOrTime : 0;
      duration = typeof maybeDuration === 'number' ? maybeDuration : 0;
      extraData = extraDuration && typeof extraDuration === 'object' ? extraDuration : {};
    }

    if (!resolved) {
      return { ok: false, reason: 'invalid-identifier' };
    }

    const existing = list.find((i) => i.type === resolved.type && i.id === resolved.id);
    const progress = duration > 0 ? Math.min(1, Math.max(0, currentTime / duration)) : (existing?.progress || 0);

    const merged = {
      id: resolved.id,
      type: resolved.type,
      title: extraData.title || existing?.title || 'Unknown Title',
      poster_path: extraData.poster_path || existing?.poster_path,
      backdrop_path: extraData.backdrop_path || existing?.backdrop_path,
      lastWatched: Date.now(),
      currentTime,
      duration,
      progress,
      ...(resolved.type === 'tv' && {
        lastSeason: extraData.lastSeason !== undefined ? extraData.lastSeason : existing?.lastSeason,
        lastEpisode: extraData.lastEpisode !== undefined ? extraData.lastEpisode : existing?.lastEpisode,
        totalSeasons: extraData.totalSeasons !== undefined ? extraData.totalSeasons : existing?.totalSeasons
      })
    };

    const normalized = normalizeHistoryItem(merged);
    if (!normalized) {
      return { ok: false, reason: 'normalization-failed' };
    }

    if (!isSignedInRef.current || !accountUserRef.current) {
      // Anonymous history: update in-memory and localStorage
      const filtered = anonymousHistoryRef.current.filter((i) => !(i.type === resolved.type && i.id === resolved.id));
      const updated = [normalized, ...filtered].slice(0, MAX_HISTORY_ITEMS);
      saveAnonymousHistory(updated);
      return { ok: true, item: normalized };
    }

    // Cloud: Update in-memory state immediately for instant UI feedback
    const uid = accountUserRef.current.uid;
    const profileId = activeProfileRef.current;
    if (!profileId) {
      return { ok: false, reason: 'no-active-profile' };
    }

    setCloudHistory((prev) => {
      const filtered = prev.filter((i) => !(i.type === resolved.type && i.id === resolved.id));
      return [normalized, ...filtered].slice(0, MAX_HISTORY_ITEMS);
    });

    // Throttle cloud write per owner + mediaKey (15 seconds). The owner is captured
    // now, so a later profile/account switch cannot redirect this write.
    const pendingKey = pendingWriteKey(uid, profileId, resolved.key);
    const now = Date.now();
    const existingPending = pendingWritesRef.current.get(pendingKey);

    if (existingPending) {
      existingPending.item = normalized;
      existingPending.timestamp = now;
    } else {
      const timerId = setTimeout(() => {
        flushPendingHistory(pendingKey);
      }, PROGRESS_THROTTLE_MS);

      pendingWritesRef.current.set(pendingKey, {
        uid,
        profileId,
        mediaKey: resolved.key,
        item: normalized,
        timestamp: now,
        timerId
      });
    }

    return { ok: true, item: normalized };
  }, [saveAnonymousHistory, flushPendingHistory]);

  const removeFromHistory = useCallback(async (typeOrItemOrId, maybeId) => {
    const list = currentHistoryRef.current;
    const resolved = resolveMediaIdentifier(typeOrItemOrId, maybeId, list);
    if (!resolved) {
      return { ok: false, reason: 'invalid-identifier' };
    }

    if (!isSignedInRef.current || !accountUserRef.current) {
      const filtered = anonymousHistoryRef.current.filter(
        (i) => !(i.type === resolved.type && i.id === resolved.id)
      );
      saveAnonymousHistory(filtered);
      return { ok: true };
    }

    const profileId = activeProfileRef.current;
    if (!profileId) {
      return { ok: false, reason: 'no-active-profile' };
    }

    const uid = accountUserRef.current.uid;

    // Cancel this profile's pending write if any
    const pendingKey = pendingWriteKey(uid, profileId, resolved.key);
    const pending = pendingWritesRef.current.get(pendingKey);
    if (pending?.timerId) {
      clearTimeout(pending.timerId);
    }
    pendingWritesRef.current.delete(pendingKey);

    try {
      const { db } = initFirebase();
      await db.ref(`profileData/${uid}/${profileId}/watchHistory/${resolved.key}`).set(null);
      return { ok: true };
    } catch (err) {
      console.error('[ProfileData] removeFromHistory error:', err);
      return { ok: false, reason: 'write-failed', error: err, message: err.message };
    }
  }, [saveAnonymousHistory]);

  const clearHistory = useCallback(async () => {
    if (!isSignedInRef.current || !accountUserRef.current) {
      saveAnonymousHistory([]);
      return { ok: true };
    }

    const profileId = activeProfileRef.current;
    if (!profileId) {
      return { ok: false, reason: 'no-active-profile' };
    }

    const uid = accountUserRef.current.uid;

    // Drop only this profile's pending throttled writes; another profile's queued
    // write must survive, since it targets a subtree we are not clearing.
    for (const [key, pending] of pendingWritesRef.current.entries()) {
      if (pending?.uid !== uid || pending?.profileId !== profileId) continue;
      if (pending.timerId) clearTimeout(pending.timerId);
      pendingWritesRef.current.delete(key);
    }

    try {
      const { db } = initFirebase();
      await db.ref(`profileData/${uid}/${profileId}/watchHistory`).set(null);
      return { ok: true };
    } catch (err) {
      console.error('[ProfileData] clearHistory error:', err);
      return { ok: false, reason: 'write-failed', error: err, message: err.message };
    }
  }, [saveAnonymousHistory]);

  const contextValue = useMemo(() => ({
    watchlist: currentWatchlist,
    watchHistory: currentHistory,
    isWatchlistLoading,
    isHistoryLoading,
    isLoaded,
    profileDataError,
    isMigrationRequired,
    isMigrating,
    migrationPreview,
    acceptMigration,
    declineMigration,
    isInWatchlist,
    addToWatchlist,
    removeFromWatchlist,
    toggleWatchlist,
    clearWatchlist,
    isInHistory,
    addToHistory,
    updateProgress,
    getLastWatched,
    removeFromHistory,
    clearHistory,
    flushPendingHistory
  }), [
    currentWatchlist,
    currentHistory,
    isWatchlistLoading,
    isHistoryLoading,
    isLoaded,
    profileDataError,
    isMigrationRequired,
    isMigrating,
    migrationPreview,
    acceptMigration,
    declineMigration,
    isInWatchlist,
    addToWatchlist,
    removeFromWatchlist,
    toggleWatchlist,
    clearWatchlist,
    isInHistory,
    addToHistory,
    updateProgress,
    getLastWatched,
    removeFromHistory,
    clearHistory,
    flushPendingHistory
  ]);

  return (
    <ProfileDataContext.Provider value={contextValue}>
      {children}
    </ProfileDataContext.Provider>
  );
};
