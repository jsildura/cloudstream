import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
    initFirebase,
    isGoogleAccount,
    createGoogleProvider,
    syncGoogleProfileToUserRecord,
    FirebaseInitializationError
} from './firebase';

describe('syncGoogleProfileToUserRecord', () => {
    const makeUser = (overrides = {}) => ({
        isAnonymous: false,
        displayName: '',
        photoURL: null,
        providerData: [{
            providerId: 'google.com',
            displayName: 'Jhun Sildura',
            photoURL: 'https://lh3.googleusercontent.com/a/jhun'
        }],
        updateProfile: vi.fn().mockResolvedValue(undefined),
        ...overrides
    });

    it('backfills name and photo onto a linked account with an empty record', async () => {
        const user = makeUser();
        await expect(syncGoogleProfileToUserRecord(user)).resolves.toBe(true);
        expect(user.updateProfile).toHaveBeenCalledWith({
            displayName: 'Jhun Sildura',
            photoURL: 'https://lh3.googleusercontent.com/a/jhun'
        });
    });

    it('does not overwrite a record that already has name and photo', async () => {
        const user = makeUser({
            displayName: 'Existing Name',
            photoURL: 'https://example.com/existing.jpg'
        });
        await expect(syncGoogleProfileToUserRecord(user)).resolves.toBe(false);
        expect(user.updateProfile).not.toHaveBeenCalled();
    });

    it('fills only the missing field', async () => {
        const user = makeUser({ displayName: 'Existing Name' });
        await expect(syncGoogleProfileToUserRecord(user)).resolves.toBe(true);
        expect(user.updateProfile).toHaveBeenCalledWith({
            photoURL: 'https://lh3.googleusercontent.com/a/jhun'
        });
    });

    it('ignores a non-https provider photo', async () => {
        const user = makeUser({
            providerData: [{
                providerId: 'google.com',
                displayName: 'Jhun Sildura',
                photoURL: 'http://insecure.example/pic.png'
            }]
        });
        await expect(syncGoogleProfileToUserRecord(user)).resolves.toBe(true);
        expect(user.updateProfile).toHaveBeenCalledWith({ displayName: 'Jhun Sildura' });
    });

    it('is a no-op for anonymous, non-Google, and null users', async () => {
        await expect(syncGoogleProfileToUserRecord(null)).resolves.toBe(false);
        await expect(syncGoogleProfileToUserRecord(makeUser({ isAnonymous: true }))).resolves.toBe(false);

        const passwordOnly = makeUser({
            providerData: [{ providerId: 'password', displayName: 'Pw', photoURL: 'https://e.com/p.jpg' }]
        });
        await expect(syncGoogleProfileToUserRecord(passwordOnly)).resolves.toBe(false);
        expect(passwordOnly.updateProfile).not.toHaveBeenCalled();
    });

    it('propagates an updateProfile failure to the caller', async () => {
        const user = makeUser({ updateProfile: vi.fn().mockRejectedValue(new Error('network')) });
        await expect(syncGoogleProfileToUserRecord(user)).rejects.toThrow('network');
    });
});

describe('Firebase singleton & helpers', () => {
    const originalFirebase = window.firebase;

    beforeEach(() => {
        delete window.firebase;
    });

    afterEach(() => {
        window.firebase = originalFirebase;
        vi.restoreAllMocks();
    });

    describe('isGoogleAccount', () => {
        it('returns false for null or undefined user', () => {
            expect(isGoogleAccount(null)).toBe(false);
            expect(isGoogleAccount(undefined)).toBe(false);
        });

        it('returns false for anonymous user', () => {
            const anonUser = {
                uid: 'anon-123',
                isAnonymous: true,
                providerData: []
            };
            expect(isGoogleAccount(anonUser)).toBe(false);
        });

        it('returns false when providerData is missing or lacks google.com', () => {
            const passwordUser = {
                uid: 'user-123',
                isAnonymous: false,
                providerData: [{ providerId: 'password' }]
            };
            expect(isGoogleAccount(passwordUser)).toBe(false);
        });

        it('returns true for non-anonymous user with google.com in providerData', () => {
            const googleUser = {
                uid: 'google-uid-123',
                isAnonymous: false,
                email: 'user@gmail.com',
                displayName: 'Test User',
                providerData: [{ providerId: 'google.com' }]
            };
            expect(isGoogleAccount(googleUser)).toBe(true);
        });
    });

    describe('createGoogleProvider', () => {
        it('throws FirebaseInitializationError if window.firebase is missing', () => {
            expect(() => createGoogleProvider()).toThrow(FirebaseInitializationError);
        });

        it('creates a GoogleAuthProvider and sets prompt to select_account', () => {
            const mockSetCustomParameters = vi.fn();
            class MockGoogleAuthProvider {
                constructor() {
                    this.setCustomParameters = mockSetCustomParameters;
                }
            }

            window.firebase = {
                auth: Object.assign(vi.fn(), {
                    GoogleAuthProvider: MockGoogleAuthProvider
                })
            };

            const provider = createGoogleProvider();
            expect(provider).toBeInstanceOf(MockGoogleAuthProvider);
            expect(mockSetCustomParameters).toHaveBeenCalledWith({ prompt: 'select_account' });
        });
    });

    describe('initFirebase', () => {
        it('throws FirebaseInitializationError when window.firebase is undefined', () => {
            expect(() => initFirebase()).toThrow(FirebaseInitializationError);
            try {
                initFirebase();
            } catch (err) {
                expect(err.code).toBe('sdk-unavailable');
            }
        });

        it('initializes Firebase app when no apps exist and returns services', () => {
            const mockApp = { name: '[DEFAULT]' };
            const mockAuth = { name: 'auth' };
            const mockDb = { name: 'db' };
            const mockStorage = { name: 'storage' };

            const initializeApp = vi.fn(() => mockApp);
            const appFn = vi.fn(() => mockApp);
            const authFn = vi.fn(() => mockAuth);
            const dbFn = vi.fn(() => mockDb);
            const storageFn = vi.fn(() => mockStorage);

            window.firebase = {
                apps: [],
                initializeApp,
                app: appFn,
                auth: authFn,
                database: dbFn,
                storage: storageFn
            };

            const result = initFirebase();
            expect(initializeApp).toHaveBeenCalledTimes(1);
            expect(result.app).toBe(mockApp);
            expect(result.auth).toBe(mockAuth);
            expect(result.db).toBe(mockDb);
            expect(result.storage).toBe(mockStorage);
            expect(result.firebase).toBe(window.firebase);
        });

        it('does not re-initialize app if already initialized (idempotent)', () => {
            const mockApp = { name: '[DEFAULT]' };
            const mockAuth = { name: 'auth' };
            const mockDb = { name: 'db' };
            const mockStorage = { name: 'storage' };

            const initializeApp = vi.fn();
            const appFn = vi.fn(() => mockApp);

            window.firebase = {
                apps: [mockApp],
                initializeApp,
                app: appFn,
                auth: vi.fn(() => mockAuth),
                database: vi.fn(() => mockDb),
                storage: vi.fn(() => mockStorage)
            };

            const result = initFirebase();
            expect(initializeApp).not.toHaveBeenCalled();
            expect(appFn).toHaveBeenCalled();
            expect(result.app).toBe(mockApp);
        });
    });
});
