import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
    initFirebase,
    isGoogleAccount,
    createGoogleProvider,
    FirebaseInitializationError
} from './firebase';

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
