import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act, waitFor } from '@testing-library/react';
import { ProfileProvider, useProfiles, ACTIVE_PROFILE_STORAGE_PREFIX } from './ProfileContext';
import { hashPin, verifyPin } from '../lib/profileModel';

// Mock dependencies
const mockAuthUser = {
  uid: 'google-user-123',
  displayName: 'Alice Walker',
  isAnonymous: false,
  providerData: [{ providerId: 'google.com' }]
};

let mockAuthContextValue = {
  accountUser: mockAuthUser,
  signOutAccount: vi.fn().mockResolvedValue({ ok: true })
};

vi.mock('./AuthContext', () => ({
  useAuth: () => mockAuthContextValue
}));

// Mock Firebase DB
let dbData = {};
let dbListeners = {};

let idCounter = 1000;
const generatePushId = () => {
  idCounter++;
  const suffix = `PushId${idCounter}`.padEnd(19, 'x').slice(0, 19);
  return `-${suffix}`;
};

const createMockDb = () => {
  return {
    ref: (path = '') => {
      return {
        key: generatePushId(),
        push: () => ({
          key: generatePushId()
        }),
        set: vi.fn(async (val) => {
          dbData[path] = JSON.parse(JSON.stringify(val));
          // If setting a subpath like accounts/uid/profiles/profileId, update parent
          if (path.startsWith('accounts/')) {
            const parts = path.split('/');
            const rootAccountPath = `accounts/${parts[1]}`;
            if (parts.length === 4 && parts[2] === 'profiles') {
              const profileId = parts[3];
              if (!dbData[rootAccountPath]) {
                dbData[rootAccountPath] = { schemaVersion: 1, profiles: {} };
              }
              if (!dbData[rootAccountPath].profiles) {
                dbData[rootAccountPath].profiles = {};
              }
              dbData[rootAccountPath].profiles[profileId] = JSON.parse(JSON.stringify(val));
            }
            if (dbListeners[rootAccountPath]) {
              const snap = {
                exists: () => dbData[rootAccountPath] !== undefined && dbData[rootAccountPath] !== null,
                val: () => dbData[rootAccountPath]
              };
              dbListeners[rootAccountPath].forEach((cb) => cb(snap));
            }
          }

          if (dbListeners[path]) {
            const snap = {
              exists: () => dbData[path] !== undefined && dbData[path] !== null,
              val: () => dbData[path]
            };
            dbListeners[path].forEach((cb) => cb(snap));
          }
        }),
        update: vi.fn(async (updates) => {
          for (const [subPath, val] of Object.entries(updates)) {
            if (val === null) {
              delete dbData[subPath];
              if (subPath.startsWith('accounts/')) {
                const parts = subPath.split('/');
                const rootAccountPath = `accounts/${parts[1]}`;
                if (parts.length === 4 && parts[2] === 'profiles' && dbData[rootAccountPath]?.profiles) {
                  delete dbData[rootAccountPath].profiles[parts[3]];
                }
              }
            } else {
              dbData[subPath] = val;
            }
          }
          // Notify any listeners matching base path
          for (const [listenerPath, cbs] of Object.entries(dbListeners)) {
            const snap = {
              exists: () => dbData[listenerPath] !== undefined && dbData[listenerPath] !== null,
              val: () => dbData[listenerPath]
            };
            cbs.forEach((cb) => cb(snap));
          }
        }),
        remove: vi.fn(async () => {
          delete dbData[path];
          if (dbListeners[path]) {
            const snap = { exists: () => false, val: () => null };
            dbListeners[path].forEach((cb) => cb(snap));
          }
        }),
        on: vi.fn((event, cb) => {
          if (!dbListeners[path]) dbListeners[path] = [];
          dbListeners[path].push(cb);
          // Initial trigger
          const snap = {
            exists: () => dbData[path] !== undefined && dbData[path] !== null,
            val: () => dbData[path]
          };
          cb(snap);
        }),
        off: vi.fn(() => {
          delete dbListeners[path];
        })
      };
    }
  };
};

let mockDb = createMockDb();

vi.mock('../lib/firebase', () => ({
  initFirebase: () => ({
    db: mockDb
  })
}));

// Test consumer component
function ProfileTestConsumer({ onRender }) {
  const profileState = useProfiles();
  if (onRender) onRender(profileState);

  return (
    <div>
      <div data-testid="loading">{String(profileState.isProfileLoading)}</div>
      <div data-testid="error">{profileState.profileError || 'none'}</div>
      <div data-testid="profiles-count">{profileState.profiles.length}</div>
      <div data-testid="active-profile">{profileState.activeProfile?.name || 'none'}</div>
      <div data-testid="is-kids">{String(profileState.isKidsMode)}</div>
    </div>
  );
}

describe('ProfileContext & ProfileProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    dbData = {};
    dbListeners = {};
    idCounter = 1000;
    mockDb = createMockDb();
    mockAuthContextValue = {
      accountUser: mockAuthUser,
      signOutAccount: vi.fn().mockResolvedValue({ ok: true })
    };
  });

  describe('Initialization and Seeding', () => {
    it('creates a complete first account when absent in database', async () => {
      let state;
      render(
        <ProfileProvider>
          <ProfileTestConsumer onRender={(s) => { state = s; }} />
        </ProfileProvider>
      );

      await waitFor(() => {
        expect(state.isProfileLoading).toBe(false);
      });

      // Verify created in DB
      const accountInDb = dbData[`accounts/${mockAuthUser.uid}`];
      expect(accountInDb).toBeDefined();
      expect(accountInDb.schemaVersion).toBe(1);
      expect(Object.keys(accountInDb.profiles)).toHaveLength(1);

      const firstProfile = Object.values(accountInDb.profiles)[0];
      expect(firstProfile.name).toBe('Alice Walker');
      expect(firstProfile.avatar).toBe('avatar_01');
      expect(firstProfile.isKids).toBe(false);
      expect(typeof firstProfile.createdAt).toBe('number');

      // Verify context state
      expect(state.profiles).toHaveLength(1);
      expect(state.activeProfile.name).toBe('Alice Walker');
      expect(state.isKidsMode).toBe(false);
    });

    it('sets profileError on malformed accounts without overwriting', async () => {
      // Seed malformed account (bad schemaVersion)
      dbData[`accounts/${mockAuthUser.uid}`] = {
        schemaVersion: 99,
        profiles: { '-Nx12345678901234567': { name: 'Broken' } }
      };

      let state;
      render(
        <ProfileProvider>
          <ProfileTestConsumer onRender={(s) => { state = s; }} />
        </ProfileProvider>
      );

      await waitFor(() => {
        expect(state.isProfileLoading).toBe(false);
      });

      expect(state.profileError).toBe('malformed-account');
      expect(state.profiles).toHaveLength(0);
      expect(dbData[`accounts/${mockAuthUser.uid}`].schemaVersion).toBe(99); // Untouched
    });

    it('restores valid active profile from localStorage', async () => {
      const p1Id = '-Nx11111111111111111';
      const p2Id = '-Nx22222222222222222';

      dbData[`accounts/${mockAuthUser.uid}`] = {
        schemaVersion: 1,
        profiles: {
          [p1Id]: { name: 'Adult Profile', avatar: 'avatar_01', isKids: false, createdAt: 1000 },
          [p2Id]: { name: 'Kids Profile', avatar: 'avatar_09', isKids: true, pinHash: 'salt:hash', createdAt: 2000 }
        }
      };

      // Set localStorage to p2Id
      localStorage.setItem(`${ACTIVE_PROFILE_STORAGE_PREFIX}${mockAuthUser.uid}`, p2Id);

      let state;
      render(
        <ProfileProvider>
          <ProfileTestConsumer onRender={(s) => { state = s; }} />
        </ProfileProvider>
      );

      await waitFor(() => {
        expect(state.isProfileLoading).toBe(false);
      });

      expect(state.activeProfileId).toBe(p2Id);
      expect(state.activeProfile.name).toBe('Kids Profile');
      expect(state.isKidsMode).toBe(true);
    });

    it('falls back to oldest profile when localStorage has invalid ID', async () => {
      const p1Id = '-Nx11111111111111111';
      const p2Id = '-Nx22222222222222222';

      dbData[`accounts/${mockAuthUser.uid}`] = {
        schemaVersion: 1,
        profiles: {
          [p1Id]: { name: 'Oldest Profile', avatar: 'avatar_01', isKids: false, createdAt: 1000 },
          [p2Id]: { name: 'Newer Profile', avatar: 'avatar_02', isKids: false, createdAt: 2000 }
        }
      };

      localStorage.setItem(`${ACTIVE_PROFILE_STORAGE_PREFIX}${mockAuthUser.uid}`, '-NxInvalidId99999999');

      let state;
      render(
        <ProfileProvider>
          <ProfileTestConsumer onRender={(s) => { state = s; }} />
        </ProfileProvider>
      );

      await waitFor(() => {
        expect(state.isProfileLoading).toBe(false);
      });

      expect(state.activeProfileId).toBe(p1Id);
      expect(state.activeProfile.name).toBe('Oldest Profile');
      expect(localStorage.getItem(`${ACTIVE_PROFILE_STORAGE_PREFIX}${mockAuthUser.uid}`)).toBe(p1Id);
    });

    it('clears state when user is signed out or anonymous', async () => {
      mockAuthContextValue = {
        accountUser: null,
        signOutAccount: vi.fn()
      };

      let state;
      render(
        <ProfileProvider>
          <ProfileTestConsumer onRender={(s) => { state = s; }} />
        </ProfileProvider>
      );

      expect(state.isProfileLoading).toBe(false);
      expect(state.profiles).toHaveLength(0);
      expect(state.activeProfile).toBeNull();
      expect(state.activeProfileId).toBeNull();
    });
  });

  describe('Profile CRUD Operations', () => {
    it('creates adult and kids profiles up to limit 5', async () => {
      let state;
      render(
        <ProfileProvider>
          <ProfileTestConsumer onRender={(s) => { state = s; }} />
        </ProfileProvider>
      );

      await waitFor(() => {
        expect(state.isProfileLoading).toBe(false);
      });

      // Profile 1 created automatically by seeding
      expect(state.profiles).toHaveLength(1);

      // Create Profile 2 (Adult)
      let res2;
      await act(async () => {
        res2 = await state.createProfile({ name: 'Bob', avatar: 'avatar_02', isKids: false });
      });
      expect(res2.ok).toBe(true);
      expect(res2.profile.name).toBe('Bob');

      // Create Profile 3 (Kids with PIN)
      let res3;
      await act(async () => {
        res3 = await state.createProfile({ name: 'Charlie', avatar: 'avatar_09', isKids: true }, '1234');
      });
      expect(res3.ok).toBe(true);
      expect(res3.profile.isKids).toBe(true);
      expect(res3.profile.pinHash).toBeDefined();

      // Create Profile 4
      await act(async () => {
        await state.createProfile({ name: 'Profile 4', avatar: 'avatar_04', isKids: false });
      });

      // Create Profile 5
      await act(async () => {
        await state.createProfile({ name: 'Profile 5', avatar: 'avatar_05', isKids: false });
      });

      // Attempt Profile 6 (should fail due to MAX_PROFILES = 5)
      let res6;
      await act(async () => {
        res6 = await state.createProfile({ name: 'Profile 6', avatar: 'avatar_06', isKids: false });
      });
      expect(res6.ok).toBe(false);
      expect(res6.reason).toBe('max-profiles-exceeded');
    });

    it('requires PIN when creating Kids profile', async () => {
      let state;
      render(
        <ProfileProvider>
          <ProfileTestConsumer onRender={(s) => { state = s; }} />
        </ProfileProvider>
      );

      await waitFor(() => {
        expect(state.isProfileLoading).toBe(false);
      });

      let res;
      await act(async () => {
        res = await state.createProfile({ name: 'Kiddo', avatar: 'avatar_10', isKids: true });
      });
      expect(res.ok).toBe(false);
      expect(res.reason).toBe('pin-required');
    });

    it('updates profile fields and handles Kids mode transitions', async () => {
      let state;
      render(
        <ProfileProvider>
          <ProfileTestConsumer onRender={(s) => { state = s; }} />
        </ProfileProvider>
      );

      await waitFor(() => {
        expect(state.isProfileLoading).toBe(false);
      });

      const initialId = state.profiles[0].id;
      const initialCreatedAt = state.profiles[0].createdAt;

      // Update name and avatar
      let updateRes;
      await act(async () => {
        updateRes = await state.updateProfile(initialId, { name: 'Alicia', avatar: 'avatar_03' });
      });
      expect(updateRes.ok).toBe(true);
      expect(updateRes.profile.name).toBe('Alicia');
      expect(updateRes.profile.avatar).toBe('avatar_03');
      expect(updateRes.profile.createdAt).toBe(initialCreatedAt); // Immutable

      // Turn into Kids profile (requires PIN)
      let kidsResNoPin;
      await act(async () => {
        kidsResNoPin = await state.updateProfile(initialId, { isKids: true });
      });
      expect(kidsResNoPin.ok).toBe(false);
      expect(kidsResNoPin.reason).toBe('pin-required');

      let kidsResWithPin;
      await act(async () => {
        kidsResWithPin = await state.updateProfile(initialId, { isKids: true }, '4321');
      });
      expect(kidsResWithPin.ok).toBe(true);
      expect(kidsResWithPin.profile.isKids).toBe(true);
      expect(kidsResWithPin.profile.pinHash).toBeDefined();

      // Change PIN without current PIN -> rejected
      let changePinNoCurrent;
      await act(async () => {
        changePinNoCurrent = await state.updateProfile(initialId, { isKids: true }, '9999');
      });
      expect(changePinNoCurrent.ok).toBe(false);
      expect(changePinNoCurrent.reason).toBe('current-pin-required');

      // Change PIN with wrong current PIN -> rejected
      let changePinWrongCurrent;
      await act(async () => {
        changePinWrongCurrent = await state.updateProfile(initialId, { isKids: true }, '9999', '0000');
      });
      expect(changePinWrongCurrent.ok).toBe(false);
      expect(changePinWrongCurrent.reason).toBe('invalid-current-pin');

      // Change PIN with correct current PIN -> succeeds
      let changePinSuccess;
      await act(async () => {
        changePinSuccess = await state.updateProfile(initialId, { isKids: true }, '9999', '4321');
      });
      expect(changePinSuccess.ok).toBe(true);
      expect(await verifyPin('9999', changePinSuccess.profile.pinHash)).toBe(true);

      // Disable Kids mode (removes pinHash)
      let disableKidsRes;
      await act(async () => {
        disableKidsRes = await state.updateProfile(initialId, { isKids: false });
      });
      expect(disableKidsRes.ok).toBe(true);
      expect(disableKidsRes.profile.isKids).toBe(false);
      expect(disableKidsRes.profile.pinHash).toBeUndefined();
    });

    it('deletes non-final profile and cascades profileData deletion', async () => {
      let state;
      render(
        <ProfileProvider>
          <ProfileTestConsumer onRender={(s) => { state = s; }} />
        </ProfileProvider>
      );

      await waitFor(() => {
        expect(state.isProfileLoading).toBe(false);
      });

      // Cannot delete the only profile
      const onlyId = state.profiles[0].id;
      let delOnlyRes;
      await act(async () => {
        delOnlyRes = await state.deleteProfile(onlyId);
      });
      expect(delOnlyRes.ok).toBe(false);
      expect(delOnlyRes.reason).toBe('cannot-delete-last-profile');

      // Create a 2nd profile
      let createRes;
      await act(async () => {
        createRes = await state.createProfile({ name: 'Second', avatar: 'avatar_02', isKids: false });
      });
      const secondId = createRes.profile.id;

      // Delete 1st profile
      let delRes;
      await act(async () => {
        delRes = await state.deleteProfile(onlyId);
      });
      expect(delRes.ok).toBe(true);

      // Active profile should have switched to secondId
      expect(state.activeProfileId).toBe(secondId);
    });

    it('selectProfile switches active profile and persists to localStorage', async () => {
      let state;
      render(
        <ProfileProvider>
          <ProfileTestConsumer onRender={(s) => { state = s; }} />
        </ProfileProvider>
      );

      await waitFor(() => {
        expect(state.isProfileLoading).toBe(false);
      });

      let res2;
      await act(async () => {
        res2 = await state.createProfile({ name: 'Bob', avatar: 'avatar_02', isKids: false });
      });

      act(() => {
        state.selectProfile(res2.profile.id);
      });

      expect(state.activeProfileId).toBe(res2.profile.id);
      expect(localStorage.getItem(`${ACTIVE_PROFILE_STORAGE_PREFIX}${mockAuthUser.uid}`)).toBe(res2.profile.id);
    });
  });

  describe('Kids PIN State Machine', () => {
    it('executes actions immediately when not in Kids mode', () => {
      let state;
      render(
        <ProfileProvider>
          <ProfileTestConsumer onRender={(s) => { state = s; }} />
        </ProfileProvider>
      );

      const callback = vi.fn();
      const reqRes = state.requestKidsExit({ type: 'callback', callback });
      expect(reqRes.immediate).toBe(true);
      expect(callback).toHaveBeenCalled();
      expect(state.isPinModalOpen).toBe(false);
    });

    it('opens PIN modal and requires valid PIN when in Kids mode', async () => {
      const pin = '8888';
      const pinHash = await hashPin(pin);
      const kidsId = '-NxKids1234567890abc';

      dbData[`accounts/${mockAuthUser.uid}`] = {
        schemaVersion: 1,
        profiles: {
          [kidsId]: { name: 'Kids User', avatar: 'avatar_11', isKids: true, pinHash, createdAt: 1000 }
        }
      };

      let state;
      render(
        <ProfileProvider>
          <ProfileTestConsumer onRender={(s) => { state = s; }} />
        </ProfileProvider>
      );

      await waitFor(() => {
        expect(state.isProfileLoading).toBe(false);
      });

      expect(state.isKidsMode).toBe(true);

      const actionCb = vi.fn();
      act(() => {
        state.requestKidsExit({ type: 'callback', callback: actionCb });
      });

      expect(state.isPinModalOpen).toBe(true);
      expect(actionCb).not.toHaveBeenCalled();

      // Submit incorrect PIN
      let wrongRes;
      await act(async () => {
        wrongRes = await state.submitKidsPin('1111');
      });
      expect(wrongRes.ok).toBe(false);
      expect(wrongRes.reason).toBe('invalid-pin');
      expect(wrongRes.remainingAttempts).toBe(2);
      expect(actionCb).not.toHaveBeenCalled();

      // Submit correct PIN
      let correctRes;
      await act(async () => {
        correctRes = await state.submitKidsPin(pin);
      });
      expect(correctRes.ok).toBe(true);
      expect(state.isPinModalOpen).toBe(false);
      expect(actionCb).toHaveBeenCalled();
    });

    it('triggers 30-second cooldown after 3 failed attempts', async () => {
      const pin = '5555';
      const pinHash = await hashPin(pin);
      const kidsId = '-NxKids1234567890abc';

      dbData[`accounts/${mockAuthUser.uid}`] = {
        schemaVersion: 1,
        profiles: {
          [kidsId]: { name: 'Kids User', avatar: 'avatar_11', isKids: true, pinHash, createdAt: 1000 }
        }
      };

      let state;
      render(
        <ProfileProvider>
          <ProfileTestConsumer onRender={(s) => { state = s; }} />
        </ProfileProvider>
      );

      await waitFor(() => {
        expect(state.isProfileLoading).toBe(false);
      });

      act(() => {
        state.requestKidsExit({ type: 'switch_profile', profileId: 'some-id' });
      });

      // Attempt 1
      await act(async () => { await state.submitKidsPin('0001'); });
      expect(state.remainingAttempts).toBe(2);

      // Attempt 2
      await act(async () => { await state.submitKidsPin('0002'); });
      expect(state.remainingAttempts).toBe(1);

      // Attempt 3 -> activates cooldown
      let res3;
      await act(async () => { res3 = await state.submitKidsPin('0003'); });
      expect(res3.cooldownActivated).toBe(true);
      expect(state.cooldownUntil).toBeGreaterThan(Date.now());

      // Attempt 4 while in cooldown -> rejected
      let res4;
      await act(async () => { res4 = await state.submitKidsPin(pin); });
      expect(res4.ok).toBe(false);
      expect(res4.reason).toBe('cooldown-active');
    });

    it('cancels Kids exit and closes modal without executing queued action', async () => {
      const kidsId = '-NxKids1234567890abc';
      const pinHash = await hashPin('1234');

      dbData[`accounts/${mockAuthUser.uid}`] = {
        schemaVersion: 1,
        profiles: {
          [kidsId]: { name: 'Kids User', avatar: 'avatar_11', isKids: true, pinHash, createdAt: 1000 }
        }
      };

      let state;
      render(
        <ProfileProvider>
          <ProfileTestConsumer onRender={(s) => { state = s; }} />
        </ProfileProvider>
      );

      await waitFor(() => {
        expect(state.isProfileLoading).toBe(false);
      });

      const queuedCb = vi.fn();
      act(() => {
        state.requestKidsExit({ type: 'callback', callback: queuedCb });
      });
      expect(state.isPinModalOpen).toBe(true);

      act(() => {
        state.cancelKidsExit();
      });
      expect(state.isPinModalOpen).toBe(false);
      expect(state.pinAction).toBeNull();
      expect(queuedCb).not.toHaveBeenCalled();
    });

    it('unlocks session after successful PIN entry and does not re-prompt on subsequent requests', async () => {
      const pin = '9999';
      const pinHash = await hashPin(pin);
      const kidsId = '-Nx12345678901234567';
      const normalId = '-Nx23456789012345678';

      dbData[`accounts/${mockAuthUser.uid}`] = {
        schemaVersion: 1,
        profiles: {
          [kidsId]: { name: 'Kids User', avatar: 'avatar_11', isKids: true, pinHash, createdAt: 1000 },
          [normalId]: { name: 'Adult User', avatar: 'avatar_01', isKids: false, createdAt: 2000 }
        }
      };

      let state;
      render(
        <ProfileProvider>
          <ProfileTestConsumer onRender={(s) => { state = s; }} />
        </ProfileProvider>
      );

      await waitFor(() => {
        expect(state.isProfileLoading).toBe(false);
      });

      // 1. Initial request (e.g. switch profile button) -> asks for PIN
      const cb1 = vi.fn();
      act(() => {
        state.requestKidsExit({ type: 'callback', callback: cb1 });
      });
      expect(state.isPinModalOpen).toBe(true);

      // 2. Submit PIN successfully
      await act(async () => {
        await state.submitKidsPin(pin);
      });
      expect(cb1).toHaveBeenCalled();
      expect(state.isKidsUnlocked).toBe(true);

      // 3. Second request in same session (e.g. clicking target profile card) -> executes immediately
      const cb2 = vi.fn();
      let res2;
      act(() => {
        res2 = state.requestKidsExit({ type: 'callback', callback: cb2 });
      });
      expect(res2.immediate).toBe(true);
      expect(cb2).toHaveBeenCalled();
      expect(state.isPinModalOpen).toBe(false);

      // 4. Switching profile resets unlock
      act(() => {
        state.selectProfile(normalId);
      });
      expect(state.isKidsUnlocked).toBe(false);
    });
  });
});
