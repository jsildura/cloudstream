import React, { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useAuth } from './AuthContext';
import { initFirebase } from '../lib/firebase';
import {
  MAX_PROFILES,
  MIN_PROFILES,
  SCHEMA_VERSION,
  normalizeProfile,
  validateProfile,
  hashPin,
  verifyPin,
  isValidProfileId
} from '../lib/profileModel';

export const ACTIVE_PROFILE_STORAGE_PREFIX = 'streamflix_active_profile_v1:';
export const MAX_PIN_ATTEMPTS = 3;
export const PIN_COOLDOWN_MS = 30000; // 30 seconds

const ProfileContext = createContext({
  profiles: [],
  activeProfile: null,
  activeProfileId: null,
  isProfileLoading: true,
  profileError: null,
  isKidsMode: false,
  createProfile: async () => ({ ok: false }),
  updateProfile: async () => ({ ok: false }),
  deleteProfile: async () => ({ ok: false }),
  selectProfile: () => ({ ok: false }),
  isPinModalOpen: false,
  pinAction: null,
  remainingAttempts: MAX_PIN_ATTEMPTS,
  cooldownUntil: null,
  isKidsUnlocked: false,
  submitKidsPin: async () => ({ ok: false }),
  requestKidsExit: () => ({ ok: false }),
  cancelKidsExit: () => {},
  resetKidsUnlock: () => {}
});

export const useProfiles = () => useContext(ProfileContext);

export const ProfileProvider = ({ children }) => {
  const { accountUser, signOutAccount } = useAuth();

  const [profiles, setProfiles] = useState([]);
  const [activeProfileId, setActiveProfileId] = useState(null);
  const [isProfileLoading, setIsProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState(null);

  // Kids PIN state machine
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [pinAction, setPinAction] = useState(null);
  const [remainingAttempts, setRemainingAttempts] = useState(MAX_PIN_ATTEMPTS);
  const [cooldownUntil, setCooldownUntil] = useState(null);
  const [isKidsUnlocked, setIsKidsUnlocked] = useState(false);

  const isMountedRef = useRef(true);
  const dbRef = useRef(null);
  const activeProfileRef = useRef(null);

  const activeProfile = useMemo(() => {
    if (!activeProfileId || !profiles.length) return null;
    return profiles.find((p) => p.id === activeProfileId) || null;
  }, [activeProfileId, profiles]);

  activeProfileRef.current = activeProfile;

  const isKidsMode = Boolean(activeProfile?.isKids);

  // Helper to get device-local active profile key
  const getStorageKey = useCallback((uid) => {
    return `${ACTIVE_PROFILE_STORAGE_PREFIX}${uid}`;
  }, []);

  // Reset PIN attempts and cooldown
  const resetPinState = useCallback(() => {
    setRemainingAttempts(MAX_PIN_ATTEMPTS);
    setCooldownUntil(null);
    setPinAction(null);
    setIsPinModalOpen(false);
  }, []);

  // Reset temporary Kids unlock status
  const resetKidsUnlock = useCallback(() => {
    setIsKidsUnlocked(false);
  }, []);

  // Listen to accounts/{uid} in Firebase RTDB
  useEffect(() => {
    isMountedRef.current = true;
    let accountsDbRef = null;

    if (!accountUser) {
      // User is signed out or anonymous
      setProfiles([]);
      setActiveProfileId(null);
      setProfileError(null);
      setIsProfileLoading(false);
      setIsKidsUnlocked(false);
      resetPinState();
      return () => {
        isMountedRef.current = false;
      };
    }

    const uid = accountUser.uid;
    setIsProfileLoading(true);
    setProfileError(null);
    resetPinState();

    try {
      const { db } = initFirebase();
      dbRef.current = db;
      accountsDbRef = db.ref(`accounts/${uid}`);

      accountsDbRef.on('value', async (snapshot) => {
        if (!isMountedRef.current) return;

        if (!snapshot.exists()) {
          // Absent account: create initial account in one transaction
          try {
            const initialPushRef = db.ref(`accounts/${uid}/profiles`).push();
            const initialProfileId = initialPushRef.key;

            const displayName = accountUser.displayName ? accountUser.displayName.trim() : '';
            const initialName = displayName && displayName.length <= 20 ? displayName : 'Profile 1';

            const firstProfile = {
              name: initialName,
              avatar: 'avatar_01',
              isKids: false,
              createdAt: Date.now()
            };

            await db.ref(`accounts/${uid}`).set({
              schemaVersion: SCHEMA_VERSION,
              profiles: {
                [initialProfileId]: firstProfile
              }
            });
            // Snapshot listener will fire again with new data
          } catch (seedErr) {
            console.error('[ProfileContext] Failed to seed initial account:', seedErr);
            if (isMountedRef.current) {
              setProfileError(seedErr.message || 'Failed to initialize account');
              setIsProfileLoading(false);
            }
          }
          return;
        }

        const data = snapshot.val();
        if (!data || typeof data !== 'object' || data.schemaVersion !== SCHEMA_VERSION || !data.profiles || typeof data.profiles !== 'object') {
          // Malformed account: set profileError and DO NOT overwrite automatically
          if (isMountedRef.current) {
            setProfileError('malformed-account');
            setIsProfileLoading(false);
          }
          return;
        }

        // Convert profiles object to list with id
        const rawProfilesObj = data.profiles;
        const list = Object.entries(rawProfilesObj)
          .map(([id, profile]) => ({
            id,
            ...profile
          }))
          .filter((p) => isValidProfileId(p.id))
          .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0) || a.id.localeCompare(b.id));

        if (!list.length) {
          if (isMountedRef.current) {
            setProfileError('malformed-account');
            setIsProfileLoading(false);
          }
          return;
        }

        // Restore active profile from localStorage if valid, otherwise oldest
        const storageKey = getStorageKey(uid);
        let savedId = null;
        try {
          savedId = localStorage.getItem(storageKey);
        } catch {
          savedId = null;
        }

        const validSaved = savedId ? list.find((p) => p.id === savedId) : null;
        const chosenProfile = validSaved || list[0];

        try {
          localStorage.setItem(storageKey, chosenProfile.id);
        } catch (e) {
          console.warn('[ProfileContext] Failed to save active profile to localStorage:', e);
        }

        if (isMountedRef.current) {
          setProfiles(list);
          setActiveProfileId(chosenProfile.id);
          setProfileError(null);
          setIsProfileLoading(false);
        }
      }, (listenerErr) => {
        console.error('[ProfileContext] Account listener error:', listenerErr);
        if (isMountedRef.current) {
          setProfileError(listenerErr.message || 'Database error');
          setIsProfileLoading(false);
        }
      });
    } catch (err) {
      console.error('[ProfileContext] Firebase DB initialization error:', err);
      if (isMountedRef.current) {
        setProfileError(err.message || 'Firebase DB unavailable');
        setIsProfileLoading(false);
      }
    }

    return () => {
      isMountedRef.current = false;
      if (accountsDbRef) {
        accountsDbRef.off();
      }
    };
  }, [accountUser, getStorageKey, resetPinState]);

  /**
   * Create a new profile.
   * @param {Object} rawData
   * @param {string} [pin]
   * @returns {Promise<{ ok: boolean, profile?: Object, reason?: string, error?: any }>}
   */
  const createProfile = useCallback(async (rawData = {}, pin = '') => {
    if (!accountUser) {
      return { ok: false, reason: 'unauthenticated' };
    }
    if (profiles.length >= MAX_PROFILES) {
      return { ok: false, reason: 'max-profiles-exceeded', message: `Maximum ${MAX_PROFILES} profiles allowed` };
    }

    const uid = accountUser.uid;
    const db = dbRef.current || initFirebase().db;

    try {
      const pushRef = db.ref(`accounts/${uid}/profiles`).push();
      const newId = pushRef.key;

      let normalized = normalizeProfile({
        ...rawData,
        createdAt: Date.now()
      });

      if (normalized.isKids) {
        if (!pin || pin.trim().length === 0) {
          return { ok: false, reason: 'pin-required', message: 'PIN is required for Kids profiles' };
        }
        const pinHash = await hashPin(pin.trim());
        normalized.pinHash = pinHash;
      } else {
        delete normalized.pinHash;
      }

      const validation = validateProfile(normalized, { requirePinForKids: normalized.isKids });
      if (!validation.valid) {
        return { ok: false, reason: 'validation-failed', errors: validation.errors };
      }

      await db.ref(`accounts/${uid}/profiles/${newId}`).set(normalized);

      const created = { id: newId, ...normalized };
      return { ok: true, profile: created };
    } catch (err) {
      console.error('[ProfileContext] createProfile error:', err);
      return { ok: false, reason: 'write-failed', error: err, message: err.message };
    }
  }, [accountUser, profiles.length]);

  /**
   * Update an existing profile.
   * @param {string} profileId
   * @param {Object} updates
   * @param {string} [newPin]
   * @param {string} [currentPin]
   * @returns {Promise<{ ok: boolean, profile?: Object, reason?: string, error?: any }>}
   */
  const updateProfile = useCallback(async (profileId, updates = {}, newPin, currentPin) => {
    if (!accountUser) {
      return { ok: false, reason: 'unauthenticated' };
    }

    const target = profiles.find((p) => p.id === profileId);
    if (!target) {
      return { ok: false, reason: 'profile-not-found' };
    }

    const uid = accountUser.uid;
    const db = dbRef.current || initFirebase().db;

    try {
      let nextIsKids = updates.isKids !== undefined ? Boolean(updates.isKids) : target.isKids;
      let nextPinHash = target.pinHash;

      if (nextIsKids) {
        if (newPin && newPin.trim().length > 0) {
          if (target.isKids && target.pinHash) {
            if (!currentPin || currentPin.trim().length === 0) {
              return { ok: false, reason: 'current-pin-required', message: 'Current PIN is required to set a new PIN' };
            }
            const isCurrentMatch = await verifyPin(currentPin.trim(), target.pinHash);
            if (!isCurrentMatch) {
              return { ok: false, reason: 'invalid-current-pin', message: 'Current PIN is incorrect' };
            }
          }
          nextPinHash = await hashPin(newPin.trim());
        } else if (!target.isKids || !nextPinHash) {
          return { ok: false, reason: 'pin-required', message: 'PIN is required when enabling Kids mode' };
        }
      } else {
        nextPinHash = undefined;
      }

      const merged = {
        name: updates.name !== undefined ? updates.name : target.name,
        avatar: updates.avatar !== undefined ? updates.avatar : target.avatar,
        isKids: nextIsKids,
        createdAt: target.createdAt // Immutable createdAt
      };

      if (nextIsKids && nextPinHash) {
        merged.pinHash = nextPinHash;
      }

      const normalized = normalizeProfile(merged);
      if (nextIsKids && nextPinHash) {
        normalized.pinHash = nextPinHash;
      }

      const validation = validateProfile(normalized, { requirePinForKids: nextIsKids });
      if (!validation.valid) {
        return { ok: false, reason: 'validation-failed', errors: validation.errors };
      }

      await db.ref(`accounts/${uid}/profiles/${profileId}`).set(normalized);

      return { ok: true, profile: { id: profileId, ...normalized } };
    } catch (err) {
      console.error('[ProfileContext] updateProfile error:', err);
      return { ok: false, reason: 'write-failed', error: err, message: err.message };
    }
  }, [accountUser, profiles]);

  /**
   * Delete a profile (cannot delete final profile).
   * Cascades root deletion of metadata + profileData.
   * @param {string} profileId
   * @returns {Promise<{ ok: boolean, reason?: string, error?: any }>}
   */
  const deleteProfile = useCallback(async (profileId) => {
    if (!accountUser) {
      return { ok: false, reason: 'unauthenticated' };
    }
    if (profiles.length <= MIN_PROFILES) {
      return { ok: false, reason: 'cannot-delete-last-profile', message: 'Cannot delete the final profile' };
    }

    const target = profiles.find((p) => p.id === profileId);
    if (!target) {
      return { ok: false, reason: 'profile-not-found' };
    }

    const uid = accountUser.uid;
    const db = dbRef.current || initFirebase().db;

    try {
      // Multi-location deletion for atomic cleanup
      const updates = {};
      updates[`accounts/${uid}/profiles/${profileId}`] = null;
      updates[`profileData/${uid}/${profileId}`] = null;

      await db.ref().update(updates);

      // If active profile was deleted, switch to oldest remaining
      if (activeProfileId === profileId) {
        const remaining = profiles.filter((p) => p.id !== profileId);
        if (remaining.length > 0) {
          const nextActive = remaining[0];
          setActiveProfileId(nextActive.id);
          try {
            localStorage.setItem(getStorageKey(uid), nextActive.id);
          } catch {
            // Ignore storage errors
          }
        }
      }

      return { ok: true };
    } catch (err) {
      console.error('[ProfileContext] deleteProfile error:', err);
      return { ok: false, reason: 'delete-failed', error: err, message: err.message };
    }
  }, [accountUser, profiles, activeProfileId, getStorageKey]);

  /**
   * Select active profile and persist locally.
   * @param {string} profileId
   * @returns {{ ok: boolean, profile?: Object, reason?: string }}
   */
  const selectProfile = useCallback((profileId) => {
    const target = profiles.find((p) => p.id === profileId);
    if (!target) {
      return { ok: false, reason: 'profile-not-found' };
    }

    setActiveProfileId(target.id);
    setIsKidsUnlocked(false);
    if (accountUser) {
      try {
        localStorage.setItem(getStorageKey(accountUser.uid), target.id);
      } catch (e) {
        console.warn('[ProfileContext] Failed to persist active profile:', e);
      }
    }
    return { ok: true, profile: target };
  }, [profiles, accountUser, getStorageKey]);

  /**
   * Execute a queued action after PIN validation.
   */
  const executeQueuedAction = useCallback(async (action) => {
    if (!action) return;

    if (action.type === 'switch_profile' && action.profileId) {
      selectProfile(action.profileId);
    } else if (action.type === 'sign_out') {
      await signOutAccount();
    } else if (action.type === 'callback' && typeof action.callback === 'function') {
      await action.callback();
    } else if (action.type === 'manage_profiles' && typeof action.navigate === 'function') {
      action.navigate('/profiles/manage');
    }
  }, [selectProfile, signOutAccount]);

  /**
   * Request an action that requires exiting Kids mode.
   * If in Kids mode, opens PinModal and queues action.
   * If not in Kids mode or already unlocked in current session, executes action immediately.
   * @param {Object} action
   * @returns {{ ok: boolean, immediate?: boolean, modalOpened?: boolean }}
   */
  const requestKidsExit = useCallback((action) => {
    const current = activeProfileRef.current;
    if (!current || !current.isKids || !current.pinHash || isKidsUnlocked) {
      // Not in Kids mode, Kids profile without PIN, or already authenticated in current session
      executeQueuedAction(action);
      return { ok: true, immediate: true };
    }

    // Kids mode: queue action and open modal
    setPinAction(action);
    setIsPinModalOpen(true);
    return { ok: true, modalOpened: true };
  }, [isKidsUnlocked, executeQueuedAction]);

  /**
   * Cancel Kids exit flow.
   */
  const cancelKidsExit = useCallback(() => {
    setPinAction(null);
    setIsPinModalOpen(false);
    setIsKidsUnlocked(false);
  }, []);

  /**
   * Submit 4-digit PIN for Kids exit verification.
   * @param {string} pin
   * @returns {Promise<{ ok: boolean, reason?: string, remainingAttempts?: number, remainingSeconds?: number }>}
   */
  const submitKidsPin = useCallback(async (pin) => {
    // Check cooldown
    if (cooldownUntil) {
      const diff = cooldownUntil - Date.now();
      if (diff > 0) {
        return { ok: false, reason: 'cooldown-active', remainingSeconds: Math.ceil(diff / 1000) };
      }
      // Cooldown expired
      setCooldownUntil(null);
      setRemainingAttempts(MAX_PIN_ATTEMPTS);
    }

    const current = activeProfileRef.current;
    if (!current || !current.pinHash) {
      // No PIN configured, allow exit
      setIsKidsUnlocked(true);
      resetPinState();
      if (pinAction) {
        await executeQueuedAction(pinAction);
      }
      return { ok: true };
    }

    const isMatch = await verifyPin(pin, current.pinHash);
    if (isMatch) {
      setIsKidsUnlocked(true);
      const actionToRun = pinAction;
      resetPinState();
      if (actionToRun) {
        await executeQueuedAction(actionToRun);
      }
      return { ok: true };
    }

    // Incorrect PIN
    const nextAttempts = remainingAttempts - 1;
    if (nextAttempts <= 0) {
      const newCooldown = Date.now() + PIN_COOLDOWN_MS;
      setCooldownUntil(newCooldown);
      setRemainingAttempts(MAX_PIN_ATTEMPTS);
      return { ok: false, reason: 'invalid-pin', remainingAttempts: 0, cooldownActivated: true };
    } else {
      setRemainingAttempts(nextAttempts);
      return { ok: false, reason: 'invalid-pin', remainingAttempts: nextAttempts };
    }
  }, [cooldownUntil, pinAction, remainingAttempts, resetPinState, executeQueuedAction]);

  const contextValue = useMemo(() => ({
    profiles,
    activeProfile,
    activeProfileId,
    isProfileLoading,
    profileError,
    isKidsMode,
    createProfile,
    updateProfile,
    deleteProfile,
    selectProfile,
    isPinModalOpen,
    pinAction,
    remainingAttempts,
    cooldownUntil,
    isKidsUnlocked,
    submitKidsPin,
    requestKidsExit,
    cancelKidsExit,
    resetKidsUnlock
  }), [
    profiles,
    activeProfile,
    activeProfileId,
    isProfileLoading,
    profileError,
    isKidsMode,
    createProfile,
    updateProfile,
    deleteProfile,
    selectProfile,
    isPinModalOpen,
    pinAction,
    remainingAttempts,
    cooldownUntil,
    isKidsUnlocked,
    submitKidsPin,
    requestKidsExit,
    cancelKidsExit,
    resetKidsUnlock
  ]);

  return (
    <ProfileContext.Provider value={contextValue}>
      {children}
    </ProfileContext.Provider>
  );
};
