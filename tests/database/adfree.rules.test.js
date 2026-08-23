import { describe, it, beforeAll, beforeEach, afterAll } from 'vitest';
import { assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import {
  getTestEnvironment,
  createUnauthenticatedContext,
  createAnonymousContext,
  createGoogleContext,
  clearDatabase,
  cleanupTestEnvironment
} from './helpers.js';

describe('Firebase Realtime Database Security Rules — Ad-Free Entitlements', () => {
  beforeAll(async () => {
    await getTestEnvironment();
  });

  beforeEach(async () => {
    await clearDatabase();
  });

  afterAll(async () => {
    await cleanupTestEnvironment();
  });

  const validProfile = {
    name: 'Alice',
    avatar: 'avatar_01',
    isKids: false,
    createdAt: 1700000000000
  };

  const validAdFreeEntitlement = {
    keyHash: 'a1b2c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef0',
    activatedAt: 1720000000000,
    method: 'key'
  };

  describe('accounts/$uid/adFree read access', () => {
    it('allows Google owner to read their own adFree node', async () => {
      const testEnv = await getTestEnvironment();
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await context.database().ref('accounts/google-user-1/adFree').set(validAdFreeEntitlement);
      });

      const userDb = await createGoogleContext('google-user-1');
      await assertSucceeds(userDb.ref('accounts/google-user-1/adFree').get());
    });

    it('denies Google user from reading another user adFree node', async () => {
      const testEnv = await getTestEnvironment();
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await context.database().ref('accounts/google-user-1/adFree').set(validAdFreeEntitlement);
      });

      const otherDb = await createGoogleContext('google-user-2');
      await assertFails(otherDb.ref('accounts/google-user-1/adFree').get());
    });

    it('denies unauthenticated and anonymous users from reading adFree node', async () => {
      const testEnv = await getTestEnvironment();
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await context.database().ref('accounts/google-user-1/adFree').set(validAdFreeEntitlement);
      });

      const unauthDb = await createUnauthenticatedContext();
      await assertFails(unauthDb.ref('accounts/google-user-1/adFree').get());

      const anonDb = await createAnonymousContext('anon-user-1');
      await assertFails(anonDb.ref('accounts/google-user-1/adFree').get());
    });
  });

  describe('accounts/$uid/adFree write protection', () => {
    it('denies Google owner from writing accounts/$uid/adFree directly', async () => {
      const userDb = await createGoogleContext('google-user-1');
      await assertFails(userDb.ref('accounts/google-user-1/adFree').set(validAdFreeEntitlement));
    });

    it('denies Google owner from adding adFree through a write to accounts/$uid', async () => {
      const userDb = await createGoogleContext('google-user-1');
      await assertFails(
        userDb.ref('accounts/google-user-1').set({
          schemaVersion: 1,
          adFree: validAdFreeEntitlement,
          profiles: {
            '-NxABCD1234567890xyz': validProfile
          }
        })
      );
    });

    it('denies Google owner from changing existing adFree through parent update', async () => {
      const testEnv = await getTestEnvironment();
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await context.database().ref('accounts/google-user-1').set({
          schemaVersion: 1,
          adFree: validAdFreeEntitlement,
          profiles: {
            '-NxABCD1234567890xyz': validProfile
          }
        });
      });

      const userDb = await createGoogleContext('google-user-1');
      await assertFails(
        userDb.ref('accounts/google-user-1').update({
          adFree: {
            ...validAdFreeEntitlement,
            method: 'purchase'
          }
        })
      );
    });

    it('allows Google owner to create/update profile when adFree is absent', async () => {
      const userDb = await createGoogleContext('google-user-1');
      await assertSucceeds(
        userDb.ref('accounts/google-user-1').set({
          schemaVersion: 1,
          profiles: {
            '-NxABCD1234567890xyz': validProfile
          }
        })
      );
    });

    it('allows Google owner to create/update profile when adFree is already present', async () => {
      const testEnv = await getTestEnvironment();
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await context.database().ref('accounts/google-user-1').set({
          schemaVersion: 1,
          adFree: validAdFreeEntitlement,
          profiles: {
            '-NxABCD1234567890xyz': validProfile
          }
        });
      });

      const userDb = await createGoogleContext('google-user-1');
      await assertSucceeds(
        userDb.ref('accounts/google-user-1/profiles/-NxABCD1234567890xyz/name').set('Alice Updated')
      );
    });
  });

  describe('adFreeKeys server-only node', () => {
    it('denies all clients from reading or writing adFreeKeys', async () => {
      const testEnv = await getTestEnvironment();
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await context.database().ref('adFreeKeys/test-hash').set({
          status: 'available',
          createdAt: 1720000000000
        });
      });

      const googleDb = await createGoogleContext('google-user-1');
      await assertFails(googleDb.ref('adFreeKeys/test-hash').get());
      await assertFails(googleDb.ref('adFreeKeys/test-hash').set({ status: 'redeemed' }));

      const unauthDb = await createUnauthenticatedContext();
      await assertFails(unauthDb.ref('adFreeKeys/test-hash').get());
      await assertFails(unauthDb.ref('adFreeKeys/test-hash').set({ status: 'hacked' }));

      const anonDb = await createAnonymousContext('anon-1');
      await assertFails(anonDb.ref('adFreeKeys/test-hash').get());
      await assertFails(anonDb.ref('adFreeKeys/test-hash').set({ status: 'hacked' }));
    });
  });

  describe('adFreeOrders server-only node', () => {
    it('denies all clients from reading or writing adFreeOrders', async () => {
      const testEnv = await getTestEnvironment();
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await context.database().ref('adFreeOrders/ORDER-123').set({
          uid: 'google-user-1',
          keyHash: 'test-hash',
          completedAt: 1720000000000
        });
      });

      const googleDb = await createGoogleContext('google-user-1');
      await assertFails(googleDb.ref('adFreeOrders/ORDER-123').get());
      await assertFails(googleDb.ref('adFreeOrders/ORDER-123').set({ status: 'completed' }));

      const unauthDb = await createUnauthenticatedContext();
      await assertFails(unauthDb.ref('adFreeOrders/ORDER-123').get());
      await assertFails(unauthDb.ref('adFreeOrders/ORDER-123').set({ status: 'completed' }));
    });
  });
});
