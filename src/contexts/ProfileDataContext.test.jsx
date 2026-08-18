import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { ProfileDataProvider, useProfileData, ANONYMOUS_HISTORY_KEY, PROGRESS_THROTTLE_MS } from './ProfileDataContext';
import { flushPendingHistoryBeforeSignOut } from '../lib/pendingHistoryFlush';

let mockAuth = {
  accountUser: null,
  isSignedIn: false
};

let mockProfiles = {
  activeProfileId: null,
  isProfileLoading: false
};

let mockListeners = {};
let mockDatabase = {};

function getPathVal(db, path) {
  if (!path) return db;
  const segments = path.split('/').filter(Boolean);
  let curr = db;
  for (const seg of segments) {
    if (curr === undefined || curr === null || typeof curr !== 'object') return undefined;
    curr = curr[seg];
  }
  return curr;
}

function setPathVal(db, path, val) {
  const segments = path.split('/').filter(Boolean);
  if (segments.length === 0) return;
  let curr = db;
  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i];
    if (!curr[seg] || typeof curr[seg] !== 'object') {
      curr[seg] = {};
    }
    curr = curr[seg];
  }
  const last = segments[segments.length - 1];
  if (val === null || val === undefined) {
    delete curr[last];
  } else {
    curr[last] = val;
  }
}

function notifyListeners() {
  for (const [path, callback] of Object.entries(mockListeners)) {
    const val = getPathVal(mockDatabase, path);
    callback({
      exists: () => val !== undefined && val !== null && (typeof val !== 'object' || Object.keys(val).length > 0),
      val: () => (val !== undefined ? val : null)
    });
  }
}

vi.mock('./AuthContext', () => ({
  useAuth: () => mockAuth
}));

vi.mock('./ProfileContext', () => ({
  useProfiles: () => mockProfiles
}));

vi.mock('../lib/firebase', () => ({
  initFirebase: () => ({
    db: {
      ref: (path = '') => ({
        on: (event, callback) => {
          mockListeners[path] = callback;
          const val = getPathVal(mockDatabase, path);
          callback({
            exists: () => val !== undefined && val !== null && (typeof val !== 'object' || Object.keys(val).length > 0),
            val: () => (val !== undefined ? val : null)
          });
        },
        off: () => {
          delete mockListeners[path];
        },
        set: vi.fn(async (data) => {
          setPathVal(mockDatabase, path, data);
          notifyListeners();
          return Promise.resolve();
        }),
        update: vi.fn(async (updates) => {
          for (const [p, val] of Object.entries(updates)) {
            setPathVal(mockDatabase, p, val);
          }
          notifyListeners();
          return Promise.resolve();
        })
      })
    }
  })
}));

const TestConsumer = ({ onRender }) => {
  const data = useProfileData();
  onRender(data);
  return null;
};

describe('ProfileDataContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    localStorage.clear();
    for (const key of Object.keys(mockDatabase)) delete mockDatabase[key];
    for (const key of Object.keys(mockListeners)) delete mockListeners[key];

    mockAuth = {
      accountUser: null,
      isSignedIn: false
    };
    mockProfiles = {
      activeProfileId: null,
      isProfileLoading: false
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Signed-Out Behavior', () => {
    it('returns empty watchlist and rejects signed-out watchlist additions', async () => {
      let state;
      render(
        <ProfileDataProvider>
          <TestConsumer onRender={(s) => { state = s; }} />
        </ProfileDataProvider>
      );

      expect(state.watchlist).toEqual([]);
      expect(state.isWatchlistLoading).toBe(false);

      const addRes = await state.addToWatchlist({
        id: 550,
        type: 'movie',
        title: 'Fight Club'
      });
      expect(addRes.ok).toBe(false);
      expect(addRes.reason).toBe('sign-in-required');

      const toggleRes = await state.toggleWatchlist({
        id: 550,
        type: 'movie',
        title: 'Fight Club'
      });
      expect(toggleRes.ok).toBe(false);
      expect(toggleRes.reason).toBe('sign-in-required');
    });

    it('loads and mutates anonymous history via localStorage capped at 20', async () => {
      let state;
      render(
        <ProfileDataProvider>
          <TestConsumer onRender={(s) => { state = s; }} />
        </ProfileDataProvider>
      );

      // Add 22 items
      for (let i = 1; i <= 22; i++) {
        await act(async () => {
          await state.addToHistory({
            id: i,
            type: 'movie',
            title: `Movie ${i}`,
            lastWatched: 1000 + i
          });
        });
      }

      expect(state.watchHistory.length).toBe(20);
      expect(state.watchHistory[0].id).toBe(22); // Most recent first
      expect(state.watchHistory[19].id).toBe(3);  // Oldest remaining

      // Verify in localStorage
      const stored = JSON.parse(localStorage.getItem(ANONYMOUS_HISTORY_KEY));
      expect(stored.length).toBe(20);
    });
  });

  describe('Signed-In Cloud Sync', () => {
    it('loads cloud watchlist and watch history for active profile', async () => {
      const uid = 'google-uid-1';
      const profileId = '-NxProfile11111111111';

      setPathVal(mockDatabase, `profileData/${uid}/${profileId}/watchlist`, {
        movie_550: { id: 550, type: 'movie', title: 'Fight Club', addedAt: 100 },
        tv_1399: { id: 1399, type: 'tv', title: 'Game of Thrones', addedAt: 200 }
      });

      setPathVal(mockDatabase, `profileData/${uid}/${profileId}/watchHistory`, {
        movie_550: { id: 550, type: 'movie', title: 'Fight Club', lastWatched: 500, currentTime: 100, duration: 200, progress: 0.5 }
      });

      mockAuth = { accountUser: { uid }, isSignedIn: true };
      mockProfiles = { activeProfileId: profileId, isProfileLoading: false };

      let state;
      render(
        <ProfileDataProvider>
          <TestConsumer onRender={(s) => { state = s; }} />
        </ProfileDataProvider>
      );

      expect(state.watchlist.length).toBe(2);
      expect(state.watchlist[0].id).toBe(1399); // Most recent addedAt first
      expect(state.watchHistory.length).toBe(1);
      expect(state.isInWatchlist('movie', 550)).toBe(true);
      expect(state.isInWatchlist('tv', 1399)).toBe(true);
      expect(state.isInHistory('movie', 550)).toBe(true);
    });

    it('prevents key collisions when movie and tv show share the same ID', async () => {
      const uid = 'google-uid-1';
      const profileId = '-NxProfile11111111111';

      mockAuth = { accountUser: { uid }, isSignedIn: true };
      mockProfiles = { activeProfileId: profileId, isProfileLoading: false };

      let state;
      render(
        <ProfileDataProvider>
          <TestConsumer onRender={(s) => { state = s; }} />
        </ProfileDataProvider>
      );

      await act(async () => {
        await state.addToWatchlist({ id: 100, type: 'movie', title: 'Movie 100' });
        await state.addToWatchlist({ id: 100, type: 'tv', title: 'Show 100' });
      });

      expect(state.isInWatchlist('movie', 100)).toBe(true);
      expect(state.isInWatchlist('tv', 100)).toBe(true);
      expect(state.watchlist.length).toBe(2);

      // Remove only the movie
      await act(async () => {
        await state.removeFromWatchlist('movie', 100);
      });

      expect(state.isInWatchlist('movie', 100)).toBe(false);
      expect(state.isInWatchlist('tv', 100)).toBe(true);
      expect(state.watchlist.length).toBe(1);
    });

    it('throttles progress updates to 15 seconds and flushes on demand', async () => {
      const uid = 'google-uid-1';
      const profileId = '-NxProfile11111111111';

      mockAuth = { accountUser: { uid }, isSignedIn: true };
      mockProfiles = { activeProfileId: profileId, isProfileLoading: false };

      let state;
      render(
        <ProfileDataProvider>
          <TestConsumer onRender={(s) => { state = s; }} />
        </ProfileDataProvider>
      );

      await act(async () => {
        await state.updateProgress('movie', 777, 10, 100, { title: 'Movie 777' });
      });

      // Immediate in-memory update
      expect(state.getLastWatched('movie', 777)?.currentTime).toBe(10);

      // Advance 5 seconds (under 15s throttle)
      vi.advanceTimersByTime(5000);

      await act(async () => {
        await state.updateProgress('movie', 777, 25, 100, { title: 'Movie 777' });
      });
      expect(state.getLastWatched('movie', 777)?.currentTime).toBe(25);

      // Explicit flush
      await act(async () => {
        await state.flushPendingHistory();
      });

      expect(state.getLastWatched('movie', 777)?.currentTime).toBe(25);
    });
  });

  describe('Data Migration Lifecycle', () => {
    it('sets isMigrationRequired to true when signed in, active profile exists, and legacy data is unmigrated', async () => {
      const uid = 'google-user-mig-1';
      const profileId = '-NxProfile11111111111';

      localStorage.setItem('cineflix_watchlist', JSON.stringify([{ id: 101, title: 'Legacy Movie' }]));
      localStorage.setItem('cineflix_watch_history', JSON.stringify([{ id: 202, title: 'Legacy History' }]));

      mockAuth = { accountUser: { uid }, isSignedIn: true };
      mockProfiles = { activeProfileId: profileId, isProfileLoading: false };

      let state;
      render(
        <ProfileDataProvider>
          <TestConsumer onRender={(s) => { state = s; }} />
        </ProfileDataProvider>
      );

      expect(state.isMigrationRequired).toBe(true);
      expect(state.migrationPreview.legacyWatchlistCount).toBe(1);
      expect(state.migrationPreview.legacyHistoryCount).toBe(1);
    });

    it('accepts migration, updates Firebase multi-location, and saves decision without deleting legacy storage', async () => {
      const uid = 'google-user-mig-2';
      const profileId = '-NxProfile11111111111';

      localStorage.setItem('cineflix_watchlist', JSON.stringify([{ id: 101, title: 'Legacy Movie' }]));
      localStorage.setItem('cineflix_watch_history', JSON.stringify([{ id: 202, title: 'Legacy History' }]));

      mockAuth = { accountUser: { uid }, isSignedIn: true };
      mockProfiles = { activeProfileId: profileId, isProfileLoading: false };

      let state;
      render(
        <ProfileDataProvider>
          <TestConsumer onRender={(s) => { state = s; }} />
        </ProfileDataProvider>
      );

      expect(state.isMigrationRequired).toBe(true);

      let res;
      await act(async () => {
        res = await state.acceptMigration();
      });

      expect(res.ok).toBe(true);
      expect(res.migratedWatchlist).toBe(1);
      expect(res.migratedHistory).toBe(1);

      // Decision saved in localStorage
      expect(localStorage.getItem(`streamflix_profile_migration_v1:${uid}`)).toBe('accepted');
      expect(state.isMigrationRequired).toBe(false);

      // Legacy storage NOT deleted
      expect(localStorage.getItem('cineflix_watchlist')).not.toBeNull();
      expect(localStorage.getItem('cineflix_watch_history')).not.toBeNull();
    });

    it('declines migration and records declined decision', async () => {
      const uid = 'google-user-mig-3';
      const profileId = '-NxProfile11111111111';

      localStorage.setItem('cineflix_watchlist', JSON.stringify([{ id: 101, title: 'Legacy Movie' }]));

      mockAuth = { accountUser: { uid }, isSignedIn: true };
      mockProfiles = { activeProfileId: profileId, isProfileLoading: false };

      let state;
      render(
        <ProfileDataProvider>
          <TestConsumer onRender={(s) => { state = s; }} />
        </ProfileDataProvider>
      );

      expect(state.isMigrationRequired).toBe(true);

      await act(async () => {
        await state.declineMigration();
      });

      expect(localStorage.getItem(`streamflix_profile_migration_v1:${uid}`)).toBe('declined');
      expect(state.isMigrationRequired).toBe(false);
    });
  });

  describe('Pending Progress Write Ownership', () => {
    // Each `rerender` must be given a FRESH element. Reusing the same element
    // reference makes React bail out of the re-render, so the cloud-listener
    // effect never re-runs and these tests would pass vacuously.
    const renderProvider = (onState) => {
      const tree = () => (
        <ProfileDataProvider>
          <TestConsumer onRender={onState} />
        </ProfileDataProvider>
      );
      const { rerender } = render(tree());
      return { rerenderFresh: () => rerender(tree()) };
    };

    const historyPath = (uid, profileId, mediaKey) =>
      `profileData/${uid}/${profileId}/watchHistory/${mediaKey}`;

    it('writes a pending progress update to the profile that queued it, not the newly selected one', async () => {
      const uid = 'google-uid-switch';
      const profileA = '-NxProfileAAAAAAAAAA';
      const profileB = '-NxProfileBBBBBBBBBB';

      mockAuth = { accountUser: { uid }, isSignedIn: true };
      mockProfiles = { activeProfileId: profileA, isProfileLoading: false };

      let state;
      const { rerenderFresh } = renderProvider((s) => { state = s; });

      await act(async () => {
        await state.updateProgress('movie', 777, 42, 100, { title: 'Adult Movie 777' });
      });

      // Still inside the throttle window, so nothing is persisted yet
      expect(getPathVal(mockDatabase, historyPath(uid, profileA, 'movie_777'))).toBeUndefined();

      mockProfiles = { activeProfileId: profileB, isProfileLoading: false };
      await act(async () => {
        rerenderFresh();
      });

      expect(getPathVal(mockDatabase, historyPath(uid, profileA, 'movie_777'))?.currentTime).toBe(42);
      expect(getPathVal(mockDatabase, historyPath(uid, profileB, 'movie_777'))).toBeUndefined();
    });

    it('drops a pending progress update on sign-out instead of leaking it into the next account', async () => {
      const uid1 = 'google-uid-account-1';
      const uid2 = 'google-uid-account-2';
      const profileA = '-NxProfileAAAAAAAAAA';
      const profileZ = '-NxProfileZZZZZZZZZZ';

      mockAuth = { accountUser: { uid: uid1 }, isSignedIn: true };
      mockProfiles = { activeProfileId: profileA, isProfileLoading: false };

      let state;
      const { rerenderFresh } = renderProvider((s) => { state = s; });

      await act(async () => {
        await state.updateProgress('movie', 888, 90, 120, { title: 'Account 1 Private Movie' });
      });

      // Sign out — the queued write is no longer permitted by the security rules
      mockAuth = { accountUser: null, isSignedIn: false };
      mockProfiles = { activeProfileId: null, isProfileLoading: false };
      await act(async () => {
        rerenderFresh();
      });

      // Sign in as a different account with its own profile
      mockAuth = { accountUser: { uid: uid2 }, isSignedIn: true };
      mockProfiles = { activeProfileId: profileZ, isProfileLoading: false };
      await act(async () => {
        rerenderFresh();
      });

      // A parked entry would be drained here by the throttle timer
      await act(async () => {
        vi.advanceTimersByTime(PROGRESS_THROTTLE_MS * 2);
      });

      expect(getPathVal(mockDatabase, historyPath(uid2, profileZ, 'movie_888'))).toBeUndefined();
      expect(getPathVal(mockDatabase, `profileData/${uid2}`)).toBeUndefined();
      // Accepted trade-off: the tail of progress is dropped rather than misfiled
      expect(getPathVal(mockDatabase, historyPath(uid1, profileA, 'movie_888'))).toBeUndefined();
    });

    it('keeps separate progress values when the same title is pending under two profiles', async () => {
      const uid = 'google-uid-shared-title';
      const profileA = '-NxProfileAAAAAAAAAA';
      const profileB = '-NxProfileBBBBBBBBBB';

      mockAuth = { accountUser: { uid }, isSignedIn: true };
      mockProfiles = { activeProfileId: profileA, isProfileLoading: false };

      let state;
      const { rerenderFresh } = renderProvider((s) => { state = s; });

      await act(async () => {
        await state.updateProgress('movie', 777, 42, 100, { title: 'Shared Movie 777' });
      });

      mockProfiles = { activeProfileId: profileB, isProfileLoading: false };
      await act(async () => {
        rerenderFresh();
      });

      await act(async () => {
        await state.updateProgress('movie', 777, 90, 100, { title: 'Shared Movie 777' });
      });

      // Let the throttle timer fire, which flushes by the composite pending key
      await act(async () => {
        vi.advanceTimersByTime(PROGRESS_THROTTLE_MS + 1);
      });

      expect(getPathVal(mockDatabase, historyPath(uid, profileA, 'movie_777'))?.currentTime).toBe(42);
      expect(getPathVal(mockDatabase, historyPath(uid, profileB, 'movie_777'))?.currentTime).toBe(90);
    });

    it('clearHistory only clears the active profile, sparing other profiles history and queued writes', async () => {
      const uid = 'google-uid-clear-scope';
      const profileA = '-NxProfileAAAAAAAAAA';
      const profileB = '-NxProfileBBBBBBBBBB';

      mockAuth = { accountUser: { uid }, isSignedIn: true };
      mockProfiles = { activeProfileId: profileA, isProfileLoading: false };

      let state;
      const { rerenderFresh } = renderProvider((s) => { state = s; });

      await act(async () => {
        await state.updateProgress('movie', 777, 42, 100, { title: 'Profile A Movie' });
      });

      // Switching flushes profile A's queued write to profile A
      mockProfiles = { activeProfileId: profileB, isProfileLoading: false };
      await act(async () => {
        rerenderFresh();
      });
      expect(getPathVal(mockDatabase, historyPath(uid, profileA, 'movie_777'))?.currentTime).toBe(42);

      await act(async () => {
        await state.updateProgress('movie', 555, 30, 100, { title: 'Profile B Movie' });
      });

      let res;
      await act(async () => {
        res = await state.clearHistory();
      });
      expect(res.ok).toBe(true);

      // Profile B's queued write must be cancelled, not resurrected by its timer
      await act(async () => {
        vi.advanceTimersByTime(PROGRESS_THROTTLE_MS * 2);
      });

      expect(getPathVal(mockDatabase, `profileData/${uid}/${profileB}/watchHistory`)).toBeUndefined();
      expect(getPathVal(mockDatabase, historyPath(uid, profileA, 'movie_777'))?.currentTime).toBe(42);
    });

    it('persists queued writes through the sign-out flush registry', async () => {
      const uid = 'google-uid-signout-flush';
      const profileA = '-NxProfileAAAAAAAAAA';

      mockAuth = { accountUser: { uid }, isSignedIn: true };
      mockProfiles = { activeProfileId: profileA, isProfileLoading: false };

      let state;
      renderProvider((s) => { state = s; });

      await act(async () => {
        await state.updateProgress('movie', 777, 42, 100, { title: 'Movie 777' });
      });
      expect(getPathVal(mockDatabase, historyPath(uid, profileA, 'movie_777'))).toBeUndefined();

      // AuthContext calls this while the account token is still valid
      await act(async () => {
        await flushPendingHistoryBeforeSignOut();
      });

      expect(getPathVal(mockDatabase, historyPath(uid, profileA, 'movie_777'))?.currentTime).toBe(42);
    });
  });
});
