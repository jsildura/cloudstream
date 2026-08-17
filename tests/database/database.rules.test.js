import { describe, it, beforeAll, beforeEach, afterAll } from 'vitest';
import { assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import {
  createUnauthenticatedContext,
  createAnonymousContext,
  createGoogleContext,
  createGoogleAdminContext,
  clearDatabase,
  cleanupTestEnvironment
} from './helpers.js';

/**
 * Fixture builders for v2 GlobalChat models and payloads
 * (Kept local to rules test files so test fixtures validate rules independently of client builders)
 */
export function createValidProfileFixture(uid = 'google-user-1', overrides = {}) {
  const profile = {
    uid,
    displayName: 'Alice',
    joinedAt: 1700000000000,
    updatedAt: 1700000000000,
    ...overrides
  };
  if (overrides.photoURL === null) {
    delete profile.photoURL;
  } else if (!('photoURL' in overrides)) {
    profile.photoURL = 'https://img.test/alice.jpg';
  }
  return profile;
}

export function createValidMessageFixture(uid = 'google-user-1', overrides = {}) {
  const msg = {
    uid,
    senderName: 'Alice',
    senderIsAdmin: false,
    text: 'Hello world',
    broadcast: false,
    createdAt: 1700000000000,
    deletedForAll: false,
    ...overrides
  };
  if (overrides.senderPhotoURL === null) {
    delete msg.senderPhotoURL;
  } else if (!('senderPhotoURL' in overrides)) {
    msg.senderPhotoURL = 'https://img.test/alice.jpg';
  }
  return msg;
}

export function createValidReplyFixture(overrides = {}) {
  return {
    messageId: 'orig-msg-1',
    senderName: 'Bob',
    text: 'Original message snippet',
    ...overrides
  };
}

export function createValidMovieFixture(overrides = {}) {
  return {
    id: 12345,
    title: 'Sample Movie',
    poster_path: '/sample.jpg',
    type: 'movie',
    ...overrides
  };
}

export function createValidTicketFixture(uid = 'google-user-1', overrides = {}) {
  const ticket = {
    uid,
    senderName: 'Alice',
    senderIsAdmin: false,
    text: '',
    broadcast: false,
    createdAt: 1700000000000,
    deletedForAll: false,
    type: 'ticket',
    ticketAction: 'created',
    ticketStatus: 'open',
    ticketNo: 'TICK-1001',
    category: 'Broken Stream',
    reporterUid: uid,
    ...overrides
  };
  if (overrides.senderPhotoURL === null) {
    delete ticket.senderPhotoURL;
  } else if (!('senderPhotoURL' in overrides)) {
    ticket.senderPhotoURL = 'https://img.test/alice.jpg';
  }
  return ticket;
}

export function createValidMessageReportFixture(uid = 'google-user-1', overrides = {}) {
  return {
    reporterUid: uid,
    messageId: 'msg-123',
    reason: 'Spam or abuse',
    createdAt: 1700000000000,
    ...overrides
  };
}

export function createValidIssueReportFixture(uid = 'google-user-1', overrides = {}) {
  return {
    reporterUid: uid,
    ticketNo: 'TICK-1001',
    issueType: 'playback_failure',
    description: 'Video buffering indefinitely',
    createdAt: 1700000000000,
    ...overrides
  };
}

export function createValidPinFixture(overrides = {}) {
  return {
    messageId: 'msg-123',
    pinnedAt: 1700000000000,
    pinnedBy: 'admin-google-1',
    ...overrides
  };
}

describe('Firebase Realtime Database Security Rules', () => {
  beforeAll(async () => {
    await clearDatabase();
  });

  beforeEach(async () => {
    await clearDatabase();
  });

  afterAll(async () => {
    await cleanupTestEnvironment();
  });

  describe('accounts', () => {
    const validProfileId = '-NxABCD1234567890xyz';
    const validProfile = {
      name: 'Alice',
      avatar: 'avatar_01',
      isKids: false,
      createdAt: 1700000000000
    };

    it('denies unauthenticated read/write to accounts', async () => {
      const db = await createUnauthenticatedContext();
      await assertFails(db.ref('accounts/google-user-1').get());
      await assertFails(db.ref('accounts/google-user-1').set({
        schemaVersion: 1,
        profiles: { [validProfileId]: validProfile }
      }));
    });

    it('denies anonymous user read/write to accounts', async () => {
      const db = await createAnonymousContext('anon-1');
      await assertFails(db.ref('accounts/anon-1').get());
      await assertFails(db.ref('accounts/anon-1').set({
        schemaVersion: 1,
        profiles: { [validProfileId]: validProfile }
      }));
    });

    it('allows Google user to read and write their own account', async () => {
      const db = await createGoogleContext('google-user-1');
      await assertSucceeds(db.ref('accounts/google-user-1').set({
        schemaVersion: 1,
        profiles: { [validProfileId]: validProfile }
      }));
      await assertSucceeds(db.ref('accounts/google-user-1').get());
    });

    it('denies Google user accessing another user account', async () => {
      const db = await createGoogleContext('google-user-1');
      await assertFails(db.ref('accounts/google-user-2').get());
      await assertFails(db.ref('accounts/google-user-2').set({
        schemaVersion: 1,
        profiles: { [validProfileId]: validProfile }
      }));
    });

    it('denies invalid schemaVersion', async () => {
      const db = await createGoogleContext('google-user-1');
      await assertFails(db.ref('accounts/google-user-1').set({
        schemaVersion: 2,
        profiles: { [validProfileId]: validProfile }
      }));
    });

    it('denies invalid profile ID (non push-ID)', async () => {
      const db = await createGoogleContext('google-user-1');
      await assertFails(db.ref('accounts/google-user-1/profiles/invalid_id').set(validProfile));
    });

    it('denies profile with invalid name length', async () => {
      const db = await createGoogleContext('google-user-1');
      await assertFails(db.ref(`accounts/google-user-1/profiles/${validProfileId}`).set({
        ...validProfile,
        name: ''
      }));
      await assertFails(db.ref(`accounts/google-user-1/profiles/${validProfileId}`).set({
        ...validProfile,
        name: 'A'.repeat(21)
      }));
    });

    it('denies profile with non-allowlisted avatar', async () => {
      const db = await createGoogleContext('google-user-1');
      await assertFails(db.ref(`accounts/google-user-1/profiles/${validProfileId}`).set({
        ...validProfile,
        avatar: 'avatar_99'
      }));
    });

    it('denies pinHash on non-Kids profile', async () => {
      const db = await createGoogleContext('google-user-1');
      await assertFails(db.ref(`accounts/google-user-1/profiles/${validProfileId}`).set({
        ...validProfile,
        isKids: false,
        pinHash: 'salt:hash'
      }));
    });

    it('allows pinHash on Kids profile', async () => {
      const db = await createGoogleContext('google-user-1');
      await assertSucceeds(db.ref(`accounts/google-user-1/profiles/${validProfileId}`).set({
        name: 'Kiddo',
        avatar: 'avatar_10',
        isKids: true,
        pinHash: 'salt123:hash456',
        createdAt: 1700000000000
      }));
    });

    it('denies modifying immutable createdAt', async () => {
      const db = await createGoogleContext('google-user-1');
      await assertSucceeds(db.ref(`accounts/google-user-1/profiles/${validProfileId}`).set(validProfile));
      // Attempt to change createdAt
      await assertFails(db.ref(`accounts/google-user-1/profiles/${validProfileId}/createdAt`).set(1800000000000));
    });

    it('denies unknown fields on profile or account', async () => {
      const db = await createGoogleContext('google-user-1');
      await assertFails(db.ref(`accounts/google-user-1/profiles/${validProfileId}`).set({
        ...validProfile,
        unauthorizedField: 'bad'
      }));
      await assertFails(db.ref('accounts/google-user-1/extraBranch').set('forbidden'));
    });

    it('allows profile deletion', async () => {
      const db = await createGoogleContext('google-user-1');
      await assertSucceeds(db.ref(`accounts/google-user-1/profiles/${validProfileId}`).set(validProfile));
      await assertSucceeds(db.ref(`accounts/google-user-1/profiles/${validProfileId}`).remove());
    });
  });

  describe('profileData', () => {
    const validProfileId = '-NxABCD1234567890xyz';
    const validProfile = {
      name: 'Alice',
      avatar: 'avatar_01',
      isKids: false,
      createdAt: 1700000000000
    };

    const validWatchlistItem = {
      id: 550,
      type: 'movie',
      title: 'Fight Club',
      addedAt: 1700000000000,
      poster_path: '/poster.jpg',
      genres: { '18': true, '53': true }
    };

    const validHistoryItem = {
      id: 1399,
      type: 'tv',
      title: 'Game of Thrones',
      lastWatched: 1700000000000,
      currentTime: 1200,
      duration: 3600,
      progress: 0.333,
      lastSeason: 2,
      lastEpisode: 5,
      totalSeasons: 8
    };

    it('denies unauthenticated or anonymous access to profileData', async () => {
      const unauthDb = await createUnauthenticatedContext();
      await assertFails(unauthDb.ref('profileData/google-user-1').get());

      const anonDb = await createAnonymousContext('anon-1');
      await assertFails(anonDb.ref('profileData/anon-1').get());
      await assertFails(anonDb.ref(`profileData/anon-1/${validProfileId}/watchlist/movie_550`).set(validWatchlistItem));
    });

    it('denies profileData writes if profile does not exist in accounts', async () => {
      const db = await createGoogleContext('google-user-1');
      // No profile created under accounts/google-user-1/profiles/validProfileId yet
      await assertFails(db.ref(`profileData/google-user-1/${validProfileId}/watchlist/movie_550`).set(validWatchlistItem));
    });

    it('allows valid watchlist and history writes when profile exists', async () => {
      const db = await createGoogleContext('google-user-1');
      // Create profile first
      await assertSucceeds(db.ref('accounts/google-user-1').set({
        schemaVersion: 1,
        profiles: { [validProfileId]: validProfile }
      }));

      // Write watchlist item
      await assertSucceeds(db.ref(`profileData/google-user-1/${validProfileId}/watchlist/movie_550`).set(validWatchlistItem));
      // Read watchlist item
      await assertSucceeds(db.ref(`profileData/google-user-1/${validProfileId}/watchlist/movie_550`).get());

      // Write history item
      await assertSucceeds(db.ref(`profileData/google-user-1/${validProfileId}/watchHistory/tv_1399`).set(validHistoryItem));
      // Read history item
      await assertSucceeds(db.ref(`profileData/google-user-1/${validProfileId}/watchHistory/tv_1399`).get());
    });

    it('denies invalid composite media key', async () => {
      const db = await createGoogleContext('google-user-1');
      await db.ref('accounts/google-user-1').set({
        schemaVersion: 1,
        profiles: { [validProfileId]: validProfile }
      });

      await assertFails(db.ref(`profileData/google-user-1/${validProfileId}/watchlist/anime_550`).set(validWatchlistItem));
      await assertFails(db.ref(`profileData/google-user-1/${validProfileId}/watchlist/550`).set(validWatchlistItem));
      await assertFails(db.ref(`profileData/google-user-1/${validProfileId}/watchHistory/movie_`).set(validHistoryItem));
    });

    it('denies malformed watchlist items (genres as array, unknown fields, negative id)', async () => {
      const db = await createGoogleContext('google-user-1');
      await db.ref('accounts/google-user-1').set({
        schemaVersion: 1,
        profiles: { [validProfileId]: validProfile }
      });

      // Genres as array
      await assertFails(db.ref(`profileData/google-user-1/${validProfileId}/watchlist/movie_550`).set({
        ...validWatchlistItem,
        genres: [18, 53]
      }));

      // Unknown field
      await assertFails(db.ref(`profileData/google-user-1/${validProfileId}/watchlist/movie_550`).set({
        ...validWatchlistItem,
        unauthorizedField: 123
      }));

      // Negative id
      await assertFails(db.ref(`profileData/google-user-1/${validProfileId}/watchlist/movie_550`).set({
        ...validWatchlistItem,
        id: -550
      }));
    });

    it('denies malformed history items (progress out of range, TV attributes on movie)', async () => {
      const db = await createGoogleContext('google-user-1');
      await db.ref('accounts/google-user-1').set({
        schemaVersion: 1,
        profiles: { [validProfileId]: validProfile }
      });

      // Progress > 1
      await assertFails(db.ref(`profileData/google-user-1/${validProfileId}/watchHistory/tv_1399`).set({
        ...validHistoryItem,
        progress: 1.5
      }));

      // Progress < 0
      await assertFails(db.ref(`profileData/google-user-1/${validProfileId}/watchHistory/tv_1399`).set({
        ...validHistoryItem,
        progress: -0.1
      }));

      // TV attributes on movie
      await assertFails(db.ref(`profileData/google-user-1/${validProfileId}/watchHistory/movie_550`).set({
        id: 550,
        type: 'movie',
        title: 'Movie',
        lastWatched: 1700000000000,
        currentTime: 100,
        duration: 200,
        progress: 0.5,
        lastSeason: 1
      }));
    });

    it('allows deletion of items and profileData nodes', async () => {
      const db = await createGoogleContext('google-user-1');
      await db.ref('accounts/google-user-1').set({
        schemaVersion: 1,
        profiles: { [validProfileId]: validProfile }
      });
      await db.ref(`profileData/google-user-1/${validProfileId}/watchlist/movie_550`).set(validWatchlistItem);

      // Remove single item
      await assertSucceeds(db.ref(`profileData/google-user-1/${validProfileId}/watchlist/movie_550`).remove());

      // Remove entire profileData for profile
      await assertSucceeds(db.ref(`profileData/google-user-1/${validProfileId}`).remove());
    });
  });

  const isTransitional = process.env.RULES_FILE === 'database.rules.transitional.json';

  if (isTransitional) {
    describe('legacy chat roots (transitional compatibility)', () => {
      it('allows public read for legacy messages and authenticated writes', async () => {
        const unauthDb = await createUnauthenticatedContext();
        await assertSucceeds(unauthDb.ref('messages').get());
        await assertFails(unauthDb.ref('messages/msg-1').set({ uid: 'anon-1', text: 'hello', timestamp: Date.now() }));

        const anonDb = await createAnonymousContext('anon-1');
        await assertSucceeds(anonDb.ref('messages/msg-1').set({ uid: 'anon-1', text: 'hello from anon', timestamp: Date.now() }));
        await assertFails(anonDb.ref('messages/msg-1').set({ uid: 'other-user', text: 'spoofed', timestamp: Date.now() }));
      });

      it('allows legacy users profile access with self-only writes', async () => {
        const unauthDb = await createUnauthenticatedContext();
        await assertSucceeds(unauthDb.ref('users/user-1').get());

        const userDb = await createGoogleContext('user-1');
        await assertSucceeds(userDb.ref('users/user-1').set({ nickname: 'Alice', avatarUrl: 'https://example.com/avatar.png' }));
        await assertFails(userDb.ref('users/user-2').set({ nickname: 'Bob' }));
        await assertFails(userDb.ref('users/user-1').set({ nickname: 'Alice', isAdmin: true }));
      });

      it('allows legacy nicknames claiming with own uid', async () => {
        const unauthDb = await createUnauthenticatedContext();
        await assertSucceeds(unauthDb.ref('nicknames').get());

        const userDb = await createGoogleContext('user-1');
        await assertSucceeds(userDb.ref('nicknames/alice').set({ uid: 'user-1', claimedAt: 123456789 }));
        await assertFails(userDb.ref('nicknames/alice').set({ uid: 'user-2', claimedAt: 123456789 }));
      });

      it('allows legacy reports creation and restricts queue read', async () => {
        const anonDb = await createAnonymousContext('anon-1');
        await assertSucceeds(anonDb.ref('reports/rep-1').set({ kind: 'message', reportedBy: 'anon-1', timestamp: Date.now() }));
        await assertFails(anonDb.ref('reports').get());
      });

      it('allows legacy pinnedMessage read and authenticated write', async () => {
        const unauthDb = await createUnauthenticatedContext();
        await assertSucceeds(unauthDb.ref('pinnedMessage').get());
        await assertFails(unauthDb.ref('pinnedMessage').set({ text: 'unauth pin' }));

        const anonDb = await createAnonymousContext('anon-1');
        await assertSucceeds(anonDb.ref('pinnedMessage').set({ text: 'anon pin' }));
      });

      it('allows authenticated read for legacy secrets as temporary compatibility', async () => {
        const unauthDb = await createUnauthenticatedContext();
        await assertFails(unauthDb.ref('secrets/admin_key').get());
        await assertFails(unauthDb.ref('secrets/admin_profile').get());

        const userDb = await createGoogleContext('user-1');
        await assertSucceeds(userDb.ref('secrets/admin_key').get());
        await assertSucceeds(userDb.ref('secrets/admin_profile').get());
        await assertFails(userDb.ref('secrets/admin_key').set({ key: 'new' }));
        await assertSucceeds(userDb.ref('secrets/admin_profile').set({ name: 'admin' }));
      });
    });
  } else {
    describe('legacy chat roots (final lockout denial)', () => {
      const legacyRoots = ['messages', 'users', 'nicknames', 'reports', 'pinnedMessage', 'secrets'];

      it('denies unauthenticated access to all legacy chat roots', async () => {
        const db = await createUnauthenticatedContext();
        for (const root of legacyRoots) {
          await assertFails(db.ref(root).get());
          await assertFails(db.ref(`${root}/test-item`).set({ data: 'val' }));
        }
        await assertFails(db.ref('secrets/admin_key').get());
        await assertFails(db.ref('secrets/admin_key').set('key'));
        await assertFails(db.ref('secrets/admin_profile').get());
        await assertFails(db.ref('secrets/admin_profile').set({ name: 'admin' }));
      });

      it('denies anonymous user access to all legacy chat roots', async () => {
        const db = await createAnonymousContext('anon-1');
        for (const root of legacyRoots) {
          await assertFails(db.ref(root).get());
          await assertFails(db.ref(`${root}/test-item`).set({ data: 'val' }));
        }
        await assertFails(db.ref('secrets/admin_key').get());
        await assertFails(db.ref('secrets/admin_key').set('key'));
        await assertFails(db.ref('secrets/admin_profile').get());
        await assertFails(db.ref('secrets/admin_profile').set({ name: 'admin' }));
      });

      it('denies regular Google user access to all legacy chat roots', async () => {
        const db = await createGoogleContext('google-user-1');
        for (const root of legacyRoots) {
          await assertFails(db.ref(root).get());
          await assertFails(db.ref(`${root}/test-item`).set({ data: 'val' }));
        }
        await assertFails(db.ref('secrets/admin_key').get());
        await assertFails(db.ref('secrets/admin_key').set('key'));
        await assertFails(db.ref('secrets/admin_profile').get());
        await assertFails(db.ref('secrets/admin_profile').set({ name: 'admin' }));
      });

      it('denies claims admin Google user access to all legacy chat roots', async () => {
        const db = await createGoogleAdminContext('google-admin-1');
        for (const root of legacyRoots) {
          await assertFails(db.ref(root).get());
          await assertFails(db.ref(`${root}/test-item`).set({ data: 'val' }));
        }
        await assertFails(db.ref('secrets/admin_key').get());
        await assertFails(db.ref('secrets/admin_key').set('key'));
        await assertFails(db.ref('secrets/admin_profile').get());
        await assertFails(db.ref('secrets/admin_profile').set({ name: 'admin' }));
      });
    });
  }

  describe('popular_this_week', () => {
    it('allows public read and write for tracking', async () => {
      const db = await createUnauthenticatedContext();
      await assertSucceeds(db.ref('popular_this_week/2026-W33/movie-123').set({
        count: 1,
        title: 'Test Movie'
      }));
      await assertSucceeds(db.ref('popular_this_week').get());
    });
  });

  describe('globalChat/v2/profiles', () => {
    it('denies unauthenticated read and write to profiles', async () => {
      const db = await createUnauthenticatedContext();
      await assertFails(db.ref('globalChat/v2/profiles/google-user-1').get());
      await assertFails(db.ref('globalChat/v2/profiles/google-user-1').set(createValidProfileFixture('google-user-1')));
    });

    it('denies anonymous user read and write to profiles', async () => {
      const db = await createAnonymousContext('anon-1');
      await assertFails(db.ref('globalChat/v2/profiles/anon-1').get());
      await assertFails(db.ref('globalChat/v2/profiles/anon-1').set(createValidProfileFixture('anon-1')));
    });

    it('allows Google user to read any profile', async () => {
      const db = await createGoogleContext('google-user-1');
      await assertSucceeds(db.ref('globalChat/v2/profiles/google-user-2').get());
    });

    it('allows Google user to create their own profile with matching token claims', async () => {
      const db = await createGoogleContext('google-user-1', {
        name: 'Alice',
        picture: 'https://img.test/alice.jpg'
      });
      const profile = createValidProfileFixture('google-user-1', {
        displayName: 'Alice',
        photoURL: 'https://img.test/alice.jpg'
      });
      await assertSucceeds(db.ref('globalChat/v2/profiles/google-user-1').set(profile));
    });

    it('allows Google user without photo in token to create profile omitting photoURL', async () => {
      const db = await createGoogleContext('google-user-2', {
        name: 'Bob',
        picture: null
      });
      const profile = createValidProfileFixture('google-user-2', {
        displayName: 'Bob',
        photoURL: null
      });
      await assertSucceeds(db.ref('globalChat/v2/profiles/google-user-2').set(profile));
    });

    it('allows fallback name "Google User" when token has empty/no name', async () => {
      const db = await createGoogleContext('google-user-3', {
        name: '',
        picture: 'https://img.test/user3.jpg'
      });
      const profile = createValidProfileFixture('google-user-3', {
        displayName: 'Google User',
        photoURL: 'https://img.test/user3.jpg'
      });
      await assertSucceeds(db.ref('globalChat/v2/profiles/google-user-3').set(profile));
    });

    it('denies Google user creating profile for another UID', async () => {
      const db = await createGoogleContext('google-user-1');
      const profile = createValidProfileFixture('google-user-2');
      await assertFails(db.ref('globalChat/v2/profiles/google-user-2').set(profile));
    });

    it('denies profile creation with mismatched displayName vs token', async () => {
      const db = await createGoogleContext('google-user-1', { name: 'Alice' });
      const profile = createValidProfileFixture('google-user-1', { displayName: 'Impostor' });
      await assertFails(db.ref('globalChat/v2/profiles/google-user-1').set(profile));
    });

    it('denies profile creation with mismatched photoURL vs token', async () => {
      const db = await createGoogleContext('google-user-1', {
        name: 'Alice',
        picture: 'https://img.test/alice.jpg'
      });
      const profile = createValidProfileFixture('google-user-1', {
        displayName: 'Alice',
        photoURL: 'https://img.test/fake.jpg'
      });
      await assertFails(db.ref('globalChat/v2/profiles/google-user-1').set(profile));
    });

    it('denies profile with email or unknown fields ($other: false)', async () => {
      const db = await createGoogleContext('google-user-1', { name: 'Alice' });
      const profile = {
        ...createValidProfileFixture('google-user-1', { displayName: 'Alice' }),
        email: 'alice@example.com'
      };
      await assertFails(db.ref('globalChat/v2/profiles/google-user-1').set(profile));
    });

    it('denies profile with displayName longer than 80 characters', async () => {
      const longName = 'A'.repeat(81);
      const db = await createGoogleContext('google-user-1', { name: longName });
      const profile = createValidProfileFixture('google-user-1', { displayName: longName });
      await assertFails(db.ref('globalChat/v2/profiles/google-user-1').set(profile));
    });

    it('denies modifying immutable joinedAt on profile update', async () => {
      const db = await createGoogleContext('google-user-1', {
        name: 'Alice',
        picture: 'https://img.test/alice.jpg'
      });
      const initial = createValidProfileFixture('google-user-1', {
        displayName: 'Alice',
        joinedAt: 1700000000000,
        updatedAt: 1700000000000
      });
      await assertSucceeds(db.ref('globalChat/v2/profiles/google-user-1').set(initial));

      // Attempt changing joinedAt
      const mutated = {
        ...initial,
        joinedAt: 1700000999999,
        updatedAt: 1700001000000
      };
      await assertFails(db.ref('globalChat/v2/profiles/google-user-1').set(mutated));
    });

    it('allows owner refreshing profile updatedAt and photo while preserving joinedAt', async () => {
      const db = await createGoogleContext('google-user-1', {
        name: 'Alice',
        picture: 'https://img.test/alice.jpg'
      });
      const initial = createValidProfileFixture('google-user-1', {
        displayName: 'Alice',
        photoURL: 'https://img.test/alice.jpg',
        joinedAt: 1700000000000,
        updatedAt: 1700000000000
      });
      await assertSucceeds(db.ref('globalChat/v2/profiles/google-user-1').set(initial));

      const updated = {
        ...initial,
        updatedAt: 1700001000000
      };
      await assertSucceeds(db.ref('globalChat/v2/profiles/google-user-1').set(updated));
    });
  });

  describe('globalChat/v2/messages', () => {
    it('denies unauthenticated and anonymous read/write for messages', async () => {
      const unauthDb = await createUnauthenticatedContext();
      await assertFails(unauthDb.ref('globalChat/v2/messages').get());
      await assertFails(unauthDb.ref('globalChat/v2/messages/msg-1').set(createValidMessageFixture('u1')));

      const anonDb = await createAnonymousContext('anon-1');
      await assertFails(anonDb.ref('globalChat/v2/messages').get());
      await assertFails(anonDb.ref('globalChat/v2/messages/msg-1').set(createValidMessageFixture('anon-1')));
    });

    it('allows Google user to read messages', async () => {
      const db = await createGoogleContext('google-user-1');
      await assertSucceeds(db.ref('globalChat/v2/messages').get());
    });

    it('allows Google user to create valid message with own matching token claims', async () => {
      const db = await createGoogleContext('google-user-1', {
        name: 'Alice',
        picture: 'https://img.test/alice.jpg',
        globalChatAdmin: false
      });
      const msg = createValidMessageFixture('google-user-1', {
        senderName: 'Alice',
        senderPhotoURL: 'https://img.test/alice.jpg',
        senderIsAdmin: false,
        text: 'Hello from Alice'
      });
      await assertSucceeds(db.ref('globalChat/v2/messages/msg-101').set(msg));
    });

    it('denies creating message spoofing another uid', async () => {
      const db = await createGoogleContext('google-user-1', { name: 'Alice' });
      const msg = createValidMessageFixture('google-user-2', { senderName: 'Alice' });
      await assertFails(db.ref('globalChat/v2/messages/msg-102').set(msg));
    });

    it('denies creating message with forged senderName vs token', async () => {
      const db = await createGoogleContext('google-user-1', { name: 'Alice' });
      const msg = createValidMessageFixture('google-user-1', { senderName: 'Not Alice' });
      await assertFails(db.ref('globalChat/v2/messages/msg-103').set(msg));
    });

    it('denies non-admin setting senderIsAdmin: true', async () => {
      const db = await createGoogleContext('google-user-1', {
        name: 'Alice',
        globalChatAdmin: false
      });
      const msg = createValidMessageFixture('google-user-1', {
        senderName: 'Alice',
        senderIsAdmin: true
      });
      await assertFails(db.ref('globalChat/v2/messages/msg-104').set(msg));
    });

    it('denies non-admin setting broadcast: true', async () => {
      const db = await createGoogleContext('google-user-1', {
        name: 'Alice',
        globalChatAdmin: false
      });
      const msg = createValidMessageFixture('google-user-1', {
        senderName: 'Alice',
        senderIsAdmin: false,
        text: '@everyone Announcement',
        broadcast: true
      });
      await assertFails(db.ref('globalChat/v2/messages/msg-105').set(msg));
    });

    it('allows claims admin creating broadcast message with @everyone', async () => {
      const db = await createGoogleAdminContext('google-admin-1', {
        name: 'Admin Alice',
        picture: 'https://img.test/admin.jpg'
      });
      const msg = createValidMessageFixture('google-admin-1', {
        senderName: 'Admin Alice',
        senderPhotoURL: 'https://img.test/admin.jpg',
        senderIsAdmin: true,
        text: '@everyone System update tonight',
        broadcast: true
      });
      await assertSucceeds(db.ref('globalChat/v2/messages/msg-106').set(msg));
    });

    it('denies message with zero content (no text, movies, rec, or media)', async () => {
      const db = await createGoogleContext('google-user-1', { name: 'Alice' });
      const msg = createValidMessageFixture('google-user-1', {
        senderName: 'Alice',
        text: ''
      });
      await assertFails(db.ref('globalChat/v2/messages/msg-107').set(msg));
    });

    it('allows message with valid movies array and reply snapshot', async () => {
      const db = await createGoogleContext('google-user-1', {
        name: 'Alice',
        picture: 'https://img.test/alice.jpg'
      });
      const msg = createValidMessageFixture('google-user-1', {
        senderName: 'Alice',
        senderPhotoURL: 'https://img.test/alice.jpg',
        text: 'Check these out',
        movies: [
          createValidMovieFixture({ id: 101, title: 'Movie 1', type: 'movie' }),
          createValidMovieFixture({ id: 102, title: 'TV Show 1', type: 'tv' })
        ],
        replyTo: createValidReplyFixture({
          messageId: 'orig-1',
          senderName: 'Bob',
          text: 'What should I watch?'
        })
      });
      await assertSucceeds(db.ref('globalChat/v2/messages/msg-108').set(msg));
    });

    it('allows owner to edit message content within 3 minutes', async () => {
      const db = await createGoogleContext('google-user-1', {
        name: 'Alice',
        picture: 'https://img.test/alice.jpg'
      });
      const now = Date.now();
      const original = createValidMessageFixture('google-user-1', {
        senderName: 'Alice',
        senderPhotoURL: 'https://img.test/alice.jpg',
        text: 'Initial text',
        createdAt: now
      });
      await assertSucceeds(db.ref('globalChat/v2/messages/msg-109').set(original));

      const edited = {
        ...original,
        text: 'Edited text content',
        editedAt: now + 5000
      };
      await assertSucceeds(db.ref('globalChat/v2/messages/msg-109').set(edited));
    });

    it('denies owner editing message after 3 minutes (180001 ms)', async () => {
      const db = await createGoogleContext('google-user-1', {
        name: 'Alice',
        picture: 'https://img.test/alice.jpg'
      });
      const pastTime = Date.now() - 180001;
      const original = createValidMessageFixture('google-user-1', {
        senderName: 'Alice',
        senderPhotoURL: 'https://img.test/alice.jpg',
        text: 'Old message',
        createdAt: pastTime
      });
      await assertSucceeds(db.ref('globalChat/v2/messages/msg-109-old').set(original));

      const edited = {
        ...original,
        text: 'Attempting to edit expired message',
        editedAt: Date.now()
      };
      await assertFails(db.ref('globalChat/v2/messages/msg-109-old').set(edited));
    });

    it('denies non-owner from editing message content', async () => {
      const aliceDb = await createGoogleContext('alice-uid', { name: 'Alice' });
      const msg = createValidMessageFixture('alice-uid', {
        senderName: 'Alice',
        text: 'Alice message',
        createdAt: Date.now()
      });
      await assertSucceeds(aliceDb.ref('globalChat/v2/messages/msg-110').set(msg));

      const eveDb = await createGoogleContext('eve-uid', { name: 'Eve' });
      const forged = {
        ...msg,
        text: 'Eve altered Alice message'
      };
      await assertFails(eveDb.ref('globalChat/v2/messages/msg-110').set(forged));
    });

    it('allows owner to soft-delete message (deletedForAll: true)', async () => {
      const db = await createGoogleContext('google-user-1', {
        name: 'Alice',
        picture: 'https://img.test/alice.jpg'
      });
      const original = createValidMessageFixture('google-user-1', {
        senderName: 'Alice',
        senderPhotoURL: 'https://img.test/alice.jpg',
        text: 'I want to delete this',
        createdAt: Date.now()
      });
      await assertSucceeds(db.ref('globalChat/v2/messages/msg-111').set(original));

      const deleted = {
        ...original,
        deletedForAll: true
      };
      await assertSucceeds(db.ref('globalChat/v2/messages/msg-111').set(deleted));

      // Cannot revert back to false
      const unDeleted = {
        ...original,
        deletedForAll: false
      };
      await assertFails(db.ref('globalChat/v2/messages/msg-111').set(unDeleted));
    });

    it('denies non-admin hard-deleting a message, allows claims admin hard-delete', async () => {
      const userDb = await createGoogleContext('google-user-1', { name: 'Alice' });
      const msg = createValidMessageFixture('google-user-1', {
        senderName: 'Alice',
        text: 'Message to be hard deleted',
        createdAt: Date.now()
      });
      await assertSucceeds(userDb.ref('globalChat/v2/messages/msg-112').set(msg));

      // Regular user cannot hard-delete
      await assertFails(userDb.ref('globalChat/v2/messages/msg-112').remove());

      // Claims admin can hard-delete
      const adminDb = await createGoogleAdminContext('google-admin-1', { name: 'Admin' });
      await assertSucceeds(adminDb.ref('globalChat/v2/messages/msg-112').remove());
    });
  });

  describe('globalChat/v2/messages reactions and seenBy', () => {
    it('allows any Google user to react with allowed emojis to another user message', async () => {
      const aliceDb = await createGoogleContext('alice-uid', { name: 'Alice' });
      const msg = createValidMessageFixture('alice-uid', {
        senderName: 'Alice',
        text: 'Great movie suggestion',
        createdAt: Date.now()
      });
      await assertSucceeds(aliceDb.ref('globalChat/v2/messages/msg-201').set(msg));

      const bobDb = await createGoogleContext('bob-uid', { name: 'Bob' });
      const allowedEmojis = ['❤️', '😂', '😮', '😢', '😡', '👍'];
      for (const emoji of allowedEmojis) {
        await assertSucceeds(bobDb.ref('globalChat/v2/messages/msg-201/reactions/bob-uid').set(emoji));
      }

      // Allows removing own reaction
      await assertSucceeds(bobDb.ref('globalChat/v2/messages/msg-201/reactions/bob-uid').remove());
    });

    it('denies reactions with unallowed emojis or arbitrary strings', async () => {
      const aliceDb = await createGoogleContext('alice-uid', { name: 'Alice' });
      const msg = createValidMessageFixture('alice-uid', {
        senderName: 'Alice',
        text: 'React test',
        createdAt: Date.now()
      });
      await assertSucceeds(aliceDb.ref('globalChat/v2/messages/msg-202').set(msg));

      const bobDb = await createGoogleContext('bob-uid', { name: 'Bob' });
      await assertFails(bobDb.ref('globalChat/v2/messages/msg-202/reactions/bob-uid').set('🔥'));
      await assertFails(bobDb.ref('globalChat/v2/messages/msg-202/reactions/bob-uid').set('like'));
    });

    it('denies user writing reaction under someone else uid', async () => {
      const aliceDb = await createGoogleContext('alice-uid', { name: 'Alice' });
      const msg = createValidMessageFixture('alice-uid', {
        senderName: 'Alice',
        text: 'React test',
        createdAt: Date.now()
      });
      await assertSucceeds(aliceDb.ref('globalChat/v2/messages/msg-203').set(msg));

      const bobDb = await createGoogleContext('bob-uid', { name: 'Bob' });
      await assertFails(bobDb.ref('globalChat/v2/messages/msg-203/reactions/charlie-uid').set('👍'));
    });

    it('allows user marking message as seen with true at seenBy/{auth.uid}', async () => {
      const aliceDb = await createGoogleContext('alice-uid', { name: 'Alice' });
      const msg = createValidMessageFixture('alice-uid', {
        senderName: 'Alice',
        text: 'Seen test message',
        createdAt: Date.now()
      });
      await assertSucceeds(aliceDb.ref('globalChat/v2/messages/msg-204').set(msg));

      const bobDb = await createGoogleContext('bob-uid', { name: 'Bob' });
      await assertSucceeds(bobDb.ref('globalChat/v2/messages/msg-204/seenBy/bob-uid').set(true));

      // Denies writing false or string
      await assertFails(bobDb.ref('globalChat/v2/messages/msg-204/seenBy/bob-uid').set(false));
      await assertFails(bobDb.ref('globalChat/v2/messages/msg-204/seenBy/bob-uid').set('seen'));
      // Denies writing under someone else uid
      await assertFails(bobDb.ref('globalChat/v2/messages/msg-204/seenBy/charlie-uid').set(true));
    });
  });

  describe('globalChat/v2/messages tickets', () => {
    it('allows Google user to create a reporter-authored ticket message', async () => {
      const db = await createGoogleContext('reporter-1', {
        name: 'Reporter Alice',
        picture: 'https://img.test/reporter.jpg'
      });
      const ticket = createValidTicketFixture('reporter-1', {
        senderName: 'Reporter Alice',
        senderPhotoURL: 'https://img.test/reporter.jpg',
        category: 'Buffers or stops',
        ticketNo: 'TICK-2001',
        createdAt: Date.now()
      });
      await assertSucceeds(db.ref('globalChat/v2/messages/ticket-msg-1').set(ticket));
    });

    it('denies ticket creation with forged reporterUid or synthetic system uid', async () => {
      const db = await createGoogleContext('reporter-1', { name: 'Reporter Alice' });
      const forgedReporter = createValidTicketFixture('reporter-1', {
        reporterUid: 'other-user',
        ticketNo: 'TICK-2002'
      });
      await assertFails(db.ref('globalChat/v2/messages/ticket-msg-2').set(forgedReporter));

      const systemUidTicket = {
        ...createValidTicketFixture('reporter-1', { ticketNo: 'TICK-2003' }),
        uid: 'system'
      };
      await assertFails(db.ref('globalChat/v2/messages/ticket-msg-3').set(systemUidTicket));
    });

    it('denies regular user setting senderIsAdmin: true or broadcast: true on ticket', async () => {
      const db = await createGoogleContext('reporter-1', { name: 'Reporter Alice' });
      const adminTicket = createValidTicketFixture('reporter-1', {
        senderIsAdmin: true,
        ticketNo: 'TICK-2004'
      });
      await assertFails(db.ref('globalChat/v2/messages/ticket-msg-4').set(adminTicket));
    });

    it('denies regular user from changing ticketStatus, allows claims admin to resolve ticket', async () => {
      const userDb = await createGoogleContext('reporter-1', { name: 'Reporter Alice' });
      const ticket = createValidTicketFixture('reporter-1', {
        senderName: 'Reporter Alice',
        ticketNo: 'TICK-2005',
        createdAt: Date.now()
      });
      await assertSucceeds(userDb.ref('globalChat/v2/messages/ticket-msg-5').set(ticket));

      // Regular user cannot resolve
      const resolvedByUser = {
        ...ticket,
        ticketStatus: 'resolved',
        resolvedAt: Date.now(),
        resolvedBy: 'reporter-1'
      };
      await assertFails(userDb.ref('globalChat/v2/messages/ticket-msg-5').set(resolvedByUser));

      // Claims admin can resolve
      const adminDb = await createGoogleAdminContext('admin-1', { name: 'Admin Charlie' });
      const resolvedByAdmin = {
        ...ticket,
        ticketStatus: 'resolved',
        resolvedAt: Date.now(),
        resolvedBy: 'admin-1'
      };
      await assertSucceeds(adminDb.ref('globalChat/v2/messages/ticket-msg-5').set(resolvedByAdmin));

      // Cannot revert resolved ticket back to open
      const revertToOpen = {
        ...ticket,
        ticketStatus: 'open'
      };
      await assertFails(adminDb.ref('globalChat/v2/messages/ticket-msg-5').set(revertToOpen));
    });
  });

  describe('globalChat/v2/reports', () => {
    it('denies unauthenticated and anonymous access to reports', async () => {
      const unauthDb = await createUnauthenticatedContext();
      await assertFails(unauthDb.ref('globalChat/v2/reports').get());
      await assertFails(unauthDb.ref('globalChat/v2/reports/rep-1').set(createValidMessageReportFixture('anon')));

      const anonDb = await createAnonymousContext('anon-1');
      await assertFails(anonDb.ref('globalChat/v2/reports').get());
      await assertFails(anonDb.ref('globalChat/v2/reports/rep-1').set(createValidMessageReportFixture('anon-1')));
    });

    it('denies regular Google users from reading reports queue', async () => {
      const userDb = await createGoogleContext('user-1', { name: 'Regular User' });
      await assertFails(userDb.ref('globalChat/v2/reports').get());
      await assertFails(userDb.ref('globalChat/v2/reports/rep-1').get());
    });

    it('allows Google user to submit a message report with matching token identity', async () => {
      const userDb = await createGoogleContext('reporter-1', { name: 'Alice Reporter' });
      const report = {
        kind: 'message',
        reportedBy: 'reporter-1',
        reportedByName: 'Alice Reporter',
        msgId: 'msg-target-123',
        messageText: 'Offensive message content',
        messageSenderName: 'BadActor',
        messageMedia: 'image',
        timestamp: Date.now()
      };
      await assertSucceeds(userDb.ref('globalChat/v2/reports/rep-msg-1').set(report));
    });

    it('denies message report with forged reporter identity or extra fields', async () => {
      const userDb = await createGoogleContext('reporter-1', { name: 'Alice Reporter' });
      const forgedReport = {
        kind: 'message',
        reportedBy: 'other-user',
        reportedByName: 'Alice Reporter',
        msgId: 'msg-123',
        messageText: 'Test',
        messageSenderName: 'BadActor',
        timestamp: Date.now()
      };
      await assertFails(userDb.ref('globalChat/v2/reports/rep-msg-2').set(forgedReport));

      const extraFieldReport = {
        kind: 'message',
        reportedBy: 'reporter-1',
        reportedByName: 'Alice Reporter',
        msgId: 'msg-123',
        messageText: 'Test',
        messageSenderName: 'BadActor',
        timestamp: Date.now(),
        arbitraryField: 'hack'
      };
      await assertFails(userDb.ref('globalChat/v2/reports/rep-msg-3').set(extraFieldReport));
    });

    it('allows Google user to submit an issue report with valid category and structured context', async () => {
      const userDb = await createGoogleContext('reporter-1', { name: 'Alice Reporter' });
      const issueReport = {
        kind: 'issue',
        category: "Video won't play",
        description: 'Black screen when loading stream',
        reportedBy: 'reporter-1',
        reportedByName: 'Alice Reporter',
        ticketNo: 'TICK-3001',
        ticketMsgId: 'msg-ticket-3001',
        timestamp: Date.now(),
        context: {
          route: '/watch?type=movie&id=550',
          ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
          playback: true,
          title: 'Fight Club',
          tmdbId: '550',
          mediaType: 'movie',
          fromServer: 'Server 1',
          toServer: 'Server 2'
        }
      };
      await assertSucceeds(userDb.ref('globalChat/v2/reports/rep-issue-1').set(issueReport));
    });

    it('denies issue report with unallowed category', async () => {
      const userDb = await createGoogleContext('reporter-1', { name: 'Alice Reporter' });
      const invalidCategoryReport = {
        kind: 'issue',
        category: 'Fake Category Not Allowlisted',
        description: 'Some description',
        reportedBy: 'reporter-1',
        reportedByName: 'Alice Reporter',
        ticketNo: 'TICK-3002',
        ticketMsgId: 'msg-3002',
        timestamp: Date.now(),
        context: {
          route: '/watch',
          ua: 'Mozilla/5.0',
          playback: false
        }
      };
      await assertFails(userDb.ref('globalChat/v2/reports/rep-issue-2').set(invalidCategoryReport));
    });

    it('denies regular user from updating or deleting submitted reports', async () => {
      const userDb = await createGoogleContext('reporter-1', { name: 'Alice Reporter' });
      const report = {
        kind: 'message',
        reportedBy: 'reporter-1',
        reportedByName: 'Alice Reporter',
        msgId: 'msg-123',
        messageText: 'Test',
        messageSenderName: 'BadActor',
        timestamp: Date.now()
      };
      await assertSucceeds(userDb.ref('globalChat/v2/reports/rep-msg-4').set(report));

      // User cannot update or delete
      await assertFails(userDb.ref('globalChat/v2/reports/rep-msg-4').update({ status: 'resolved' }));
      await assertFails(userDb.ref('globalChat/v2/reports/rep-msg-4').remove());
    });

    it('allows claims admin to read, resolve, and delete reports', async () => {
      const userDb = await createGoogleContext('reporter-1', { name: 'Alice Reporter' });
      const report = {
        kind: 'message',
        reportedBy: 'reporter-1',
        reportedByName: 'Alice Reporter',
        msgId: 'msg-123',
        messageText: 'Test report',
        messageSenderName: 'BadActor',
        timestamp: Date.now()
      };
      await assertSucceeds(userDb.ref('globalChat/v2/reports/rep-msg-5').set(report));

      const adminDb = await createGoogleAdminContext('admin-1', { name: 'Admin Alice' });
      // Admin can read queue
      await assertSucceeds(adminDb.ref('globalChat/v2/reports').get());
      await assertSucceeds(adminDb.ref('globalChat/v2/reports/rep-msg-5').get());

      // Admin can update status
      const resolvedReport = {
        ...report,
        status: 'resolved',
        resolvedAt: Date.now(),
        resolvedBy: 'admin-1'
      };
      await assertSucceeds(adminDb.ref('globalChat/v2/reports/rep-msg-5').set(resolvedReport));

      // Admin can delete
      await assertSucceeds(adminDb.ref('globalChat/v2/reports/rep-msg-5').remove());
    });
  });

  describe('globalChat/v2/pinnedMessage', () => {
    it('denies unauthenticated and anonymous access to pinnedMessage', async () => {
      const unauthDb = await createUnauthenticatedContext();
      await assertFails(unauthDb.ref('globalChat/v2/pinnedMessage').get());
      await assertFails(unauthDb.ref('globalChat/v2/pinnedMessage').set(createValidPinFixture()));

      const anonDb = await createAnonymousContext('anon-1');
      await assertFails(anonDb.ref('globalChat/v2/pinnedMessage').get());
      await assertFails(anonDb.ref('globalChat/v2/pinnedMessage').set(createValidPinFixture()));
    });

    it('allows Google users to read pinnedMessage', async () => {
      const userDb = await createGoogleContext('user-1');
      await assertSucceeds(userDb.ref('globalChat/v2/pinnedMessage').get());
    });

    it('denies regular Google user from writing or deleting pinnedMessage', async () => {
      const userDb = await createGoogleContext('user-1', { name: 'Alice' });
      const pin = {
        id: 'msg-123',
        text: 'Important info',
        senderName: 'Alice',
        pinnedAt: Date.now(),
        pinnedBy: 'user-1'
      };
      await assertFails(userDb.ref('globalChat/v2/pinnedMessage').set(pin));
      await assertFails(userDb.ref('globalChat/v2/pinnedMessage').remove());
    });

    it('allows claims admin to set and delete pinnedMessage with self-bound pinnedBy', async () => {
      const adminDb = await createGoogleAdminContext('admin-1', { name: 'Admin Alice' });
      const pin = {
        id: 'msg-123',
        text: 'Community guidelines: be respectful!',
        senderName: 'Admin Alice',
        pinnedAt: Date.now(),
        pinnedBy: 'admin-1'
      };
      await assertSucceeds(adminDb.ref('globalChat/v2/pinnedMessage').set(pin));

      // Denies setting pinnedBy to someone else
      const forgedPin = {
        ...pin,
        pinnedBy: 'someone-else'
      };
      await assertFails(adminDb.ref('globalChat/v2/pinnedMessage').set(forgedPin));

      // Admin can remove / unpin
      await assertSucceeds(adminDb.ref('globalChat/v2/pinnedMessage').remove());
    });
  });
});
