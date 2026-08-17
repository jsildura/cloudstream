import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from './AuthContext';

function TestConsumer() {
    const {
        firebaseUser,
        accountUser,
        isSignedIn,
        isAuthLoading,
        authError,
        authEvent,
        chatIdentity,
        authClaims,
        isGlobalChatAdmin,
        refreshAuthClaims,
        signInWithGoogle,
        signOutAccount,
        clearAuthEvent
    } = useAuth();

    return (
        <div>
            <span data-testid="loading">{isAuthLoading ? 'loading' : 'ready'}</span>
            <span data-testid="signed-in">{isSignedIn ? 'signed-in' : 'not-signed-in'}</span>
            <span data-testid="uid">{firebaseUser?.uid || 'no-uid'}</span>
            <span data-testid="account-uid">{accountUser?.uid || 'no-account'}</span>
            <span data-testid="chat-identity-uid">{chatIdentity?.uid || 'no-chat-uid'}</span>
            <span data-testid="chat-identity-name">{chatIdentity?.displayName || 'no-chat-name'}</span>
            <span data-testid="chat-identity-photo">{chatIdentity?.photoURL || 'no-chat-photo'}</span>
            <span data-testid="is-chat-admin">{isGlobalChatAdmin ? 'admin' : 'not-admin'}</span>
            <span data-testid="claims">{JSON.stringify(authClaims || {})}</span>
            <span data-testid="error">{authError?.message || 'no-error'}</span>
            <span data-testid="auth-event">{authEvent ? authEvent.type : 'no-event'}</span>
            <button onClick={() => signInWithGoogle()}>Sign In</button>
            <button onClick={() => signOutAccount()}>Sign Out</button>
            <button onClick={() => clearAuthEvent()}>Clear Event</button>
            <button onClick={() => refreshAuthClaims()}>Refresh Claims</button>
        </div>
    );
}

describe('AuthContext & AuthProvider', () => {
    let authStateCallback = null;
    let mockAuth = null;
    let originalFirebase = window.firebase;

    beforeEach(() => {
        authStateCallback = null;
        mockAuth = {
            currentUser: null,
            setPersistence: vi.fn().mockResolvedValue(),
            getRedirectResult: vi.fn().mockResolvedValue(null),
            signInAnonymously: vi.fn().mockImplementation(() => {
                const user = { uid: 'anon-999', isAnonymous: true, providerData: [] };
                mockAuth.currentUser = user;
                if (authStateCallback) authStateCallback(user);
                return Promise.resolve({ user });
            }),
            signInWithPopup: vi.fn(),
            signInWithRedirect: vi.fn(),
            signInWithCredential: vi.fn(),
            signOut: vi.fn().mockImplementation(() => {
                mockAuth.currentUser = null;
                if (authStateCallback) authStateCallback(null);
                return Promise.resolve();
            }),
            onAuthStateChanged: vi.fn().mockImplementation((cb) => {
                authStateCallback = cb;
                // Emulate Firebase immediate initial emission
                setTimeout(() => cb(mockAuth.currentUser), 0);
                return () => { authStateCallback = null; };
            })
        };

        class MockGoogleAuthProvider {
            constructor() {
                this.setCustomParameters = vi.fn();
            }
        }

        window.firebase = {
            apps: [{ name: '[DEFAULT]' }],
            app: vi.fn(() => ({})),
            auth: Object.assign(vi.fn(() => mockAuth), {
                GoogleAuthProvider: MockGoogleAuthProvider,
                Auth: { Persistence: { LOCAL: 'local' } }
            }),
            database: vi.fn(() => ({})),
            storage: vi.fn(() => ({}))
        };
    });

    afterEach(() => {
        window.firebase = originalFirebase;
        sessionStorage.clear();
        vi.restoreAllMocks();
    });

    it('initializes and creates an anonymous user when no user exists', async () => {
        render(
            <AuthProvider>
                <TestConsumer />
            </AuthProvider>
        );

        await waitFor(() => {
            expect(screen.getByTestId('loading').textContent).toBe('ready');
        });

        expect(screen.getByTestId('signed-in').textContent).toBe('not-signed-in');
        expect(screen.getByTestId('uid').textContent).toBe('anon-999');
        expect(screen.getByTestId('account-uid').textContent).toBe('no-account');
        expect(screen.getByTestId('chat-identity-uid').textContent).toBe('no-chat-uid');
        expect(screen.getByTestId('is-chat-admin').textContent).toBe('not-admin');
        expect(mockAuth.signInAnonymously).toHaveBeenCalledTimes(1);
    });

    it('restores existing anonymous user without calling signInAnonymously', async () => {
        const existingAnon = { uid: 'anon-existing', isAnonymous: true, providerData: [] };
        mockAuth.currentUser = existingAnon;

        render(
            <AuthProvider>
                <TestConsumer />
            </AuthProvider>
        );

        await waitFor(() => {
            expect(screen.getByTestId('loading').textContent).toBe('ready');
        });

        expect(screen.getByTestId('signed-in').textContent).toBe('not-signed-in');
        expect(screen.getByTestId('uid').textContent).toBe('anon-existing');
        expect(screen.getByTestId('chat-identity-uid').textContent).toBe('no-chat-uid');
        expect(screen.getByTestId('is-chat-admin').textContent).toBe('not-admin');
        expect(mockAuth.signInAnonymously).not.toHaveBeenCalled();
    });

    it('restores existing Google user as signed-in accountUser with chat identity and admin claims', async () => {
        const existingGoogleUser = {
            uid: 'google-uid-123',
            isAnonymous: false,
            displayName: 'Google User',
            email: 'user@example.com',
            providerData: [{ providerId: 'google.com' }],
            getIdTokenResult: vi.fn().mockResolvedValue({
                claims: {
                    name: 'Alice Cooper',
                    picture: 'https://lh3.googleusercontent.com/alice',
                    globalChatAdmin: true
                }
            })
        };
        mockAuth.currentUser = existingGoogleUser;

        render(
            <AuthProvider>
                <TestConsumer />
            </AuthProvider>
        );

        await waitFor(() => {
            expect(screen.getByTestId('loading').textContent).toBe('ready');
        });

        expect(screen.getByTestId('signed-in').textContent).toBe('signed-in');
        expect(screen.getByTestId('uid').textContent).toBe('google-uid-123');
        expect(screen.getByTestId('account-uid').textContent).toBe('google-uid-123');

        await waitFor(() => {
            expect(screen.getByTestId('chat-identity-uid').textContent).toBe('google-uid-123');
            expect(screen.getByTestId('chat-identity-name').textContent).toBe('Alice Cooper');
            expect(screen.getByTestId('chat-identity-photo').textContent).toBe('https://lh3.googleusercontent.com/alice');
            expect(screen.getByTestId('is-chat-admin').textContent).toBe('admin');
        });

        expect(existingGoogleUser.getIdTokenResult).toHaveBeenCalledWith(true);
    });

    it('prioritizes token claims over user metadata when they disagree', async () => {
        const googleUser = {
            uid: 'google-meta-test',
            isAnonymous: false,
            displayName: 'Metadata Name',
            photoURL: 'https://metadata.com/old.jpg',
            providerData: [{ providerId: 'google.com' }],
            getIdTokenResult: vi.fn().mockResolvedValue({
                claims: {
                    name: 'Token Claim Name',
                    picture: 'https://token.com/new.jpg'
                }
            })
        };
        mockAuth.currentUser = googleUser;

        render(
            <AuthProvider>
                <TestConsumer />
            </AuthProvider>
        );

        await waitFor(() => {
            expect(screen.getByTestId('chat-identity-name').textContent).toBe('Token Claim Name');
            expect(screen.getByTestId('chat-identity-photo').textContent).toBe('https://token.com/new.jpg');
        });
    });

    it('supports forced refresh of claims via refreshAuthClaims()', async () => {
        const googleUser = {
            uid: 'google-refresh-test',
            isAnonymous: false,
            providerData: [{ providerId: 'google.com' }],
            getIdTokenResult: vi.fn()
                .mockResolvedValueOnce({
                    claims: { name: 'User Initial', globalChatAdmin: false }
                })
                .mockResolvedValueOnce({
                    claims: { name: 'User Promoted', globalChatAdmin: true }
                })
        };
        mockAuth.currentUser = googleUser;

        render(
            <AuthProvider>
                <TestConsumer />
            </AuthProvider>
        );

        await waitFor(() => {
            expect(screen.getByTestId('chat-identity-name').textContent).toBe('User Initial');
            expect(screen.getByTestId('is-chat-admin').textContent).toBe('not-admin');
        });

        await act(async () => {
            screen.getByText('Refresh Claims').click();
        });

        await waitFor(() => {
            expect(screen.getByTestId('chat-identity-name').textContent).toBe('User Promoted');
            expect(screen.getByTestId('is-chat-admin').textContent).toBe('admin');
        });

        expect(googleUser.getIdTokenResult).toHaveBeenLastCalledWith(true);
    });

    it('immediately clears chat identity and admin status on sign out', async () => {
        const googleUser = {
            uid: 'google-user-777',
            isAnonymous: false,
            providerData: [{ providerId: 'google.com' }],
            getIdTokenResult: vi.fn().mockResolvedValue({
                claims: { name: 'Admin Guy', globalChatAdmin: true }
            })
        };
        mockAuth.currentUser = googleUser;

        render(
            <AuthProvider>
                <TestConsumer />
            </AuthProvider>
        );

        await waitFor(() => {
            expect(screen.getByTestId('chat-identity-uid').textContent).toBe('google-user-777');
            expect(screen.getByTestId('is-chat-admin').textContent).toBe('admin');
        });

        await act(async () => {
            screen.getByText('Sign Out').click();
        });

        await waitFor(() => {
            expect(screen.getByTestId('signed-in').textContent).toBe('not-signed-in');
            expect(screen.getByTestId('chat-identity-uid').textContent).toBe('no-chat-uid');
            expect(screen.getByTestId('is-chat-admin').textContent).toBe('not-admin');
        });
    });

    it('correctly handles account switch from A to B', async () => {
        let userA_resolver;
        const userA_promise = new Promise((res) => { userA_resolver = res; });
        const userA = {
            uid: 'user-A',
            isAnonymous: false,
            providerData: [{ providerId: 'google.com' }],
            getIdTokenResult: vi.fn().mockReturnValue(userA_promise)
        };

        const userB = {
            uid: 'user-B',
            isAnonymous: false,
            providerData: [{ providerId: 'google.com' }],
            getIdTokenResult: vi.fn().mockResolvedValue({
                claims: { name: 'User B', globalChatAdmin: true }
            })
        };

        mockAuth.currentUser = userA;

        render(
            <AuthProvider>
                <TestConsumer />
            </AuthProvider>
        );

        // Switch quickly to userB before userA resolves
        await act(async () => {
            mockAuth.currentUser = userB;
            if (authStateCallback) authStateCallback(userB);
        });

        await waitFor(() => {
            expect(screen.getByTestId('chat-identity-uid').textContent).toBe('user-B');
            expect(screen.getByTestId('chat-identity-name').textContent).toBe('User B');
            expect(screen.getByTestId('is-chat-admin').textContent).toBe('admin');
        });

        // Now user A resolves late with admin claim - must be rejected and not overwrite User B
        await act(async () => {
            userA_resolver({
                claims: { name: 'User A Late', globalChatAdmin: false }
            });
        });

        // User B must still be active and untouched
        expect(screen.getByTestId('chat-identity-uid').textContent).toBe('user-B');
        expect(screen.getByTestId('chat-identity-name').textContent).toBe('User B');
        expect(screen.getByTestId('is-chat-admin').textContent).toBe('admin');
    });

    it('links anonymous user with Google account via popup', async () => {
        const anonUser = {
            uid: 'anon-123',
            isAnonymous: true,
            providerData: [],
            linkWithPopup: vi.fn().mockImplementation(() => {
                const linkedUser = {
                    uid: 'anon-123',
                    isAnonymous: false,
                    displayName: 'Linked Google User',
                    providerData: [{ providerId: 'google.com' }],
                    getIdTokenResult: vi.fn().mockResolvedValue({ claims: { name: 'Linked Google User' } })
                };
                mockAuth.currentUser = linkedUser;
                if (authStateCallback) authStateCallback(linkedUser);
                return Promise.resolve({ user: linkedUser });
            })
        };
        mockAuth.currentUser = anonUser;

        render(
            <AuthProvider>
                <TestConsumer />
            </AuthProvider>
        );

        await waitFor(() => {
            expect(screen.getByTestId('loading').textContent).toBe('ready');
        });

        await act(async () => {
            screen.getByText('Sign In').click();
        });

        await waitFor(() => {
            expect(screen.getByTestId('signed-in').textContent).toBe('signed-in');
            expect(screen.getByTestId('auth-event').textContent).toBe('interactive-google-sign-in-complete');
        });

        expect(anonUser.linkWithPopup).toHaveBeenCalledTimes(1);
    });

    it('handles credential collision during linkWithPopup by signing into existing account', async () => {
        const credential = { idToken: 'token-123' };
        const collisionError = new Error('Credential already in use');
        collisionError.code = 'auth/credential-already-in-use';
        collisionError.credential = credential;

        const existingAccountUser = {
            uid: 'existing-google-uid',
            isAnonymous: false,
            providerData: [{ providerId: 'google.com' }],
            getIdTokenResult: vi.fn().mockResolvedValue({ claims: { name: 'Existing User' } })
        };

        const anonUser = {
            uid: 'anon-123',
            isAnonymous: true,
            providerData: [],
            linkWithPopup: vi.fn().mockRejectedValue(collisionError)
        };
        mockAuth.currentUser = anonUser;
        mockAuth.signInWithCredential.mockImplementation(() => {
            mockAuth.currentUser = existingAccountUser;
            if (authStateCallback) authStateCallback(existingAccountUser);
            return Promise.resolve({ user: existingAccountUser });
        });

        render(
            <AuthProvider>
                <TestConsumer />
            </AuthProvider>
        );

        await waitFor(() => {
            expect(screen.getByTestId('loading').textContent).toBe('ready');
        });

        await act(async () => {
            screen.getByText('Sign In').click();
        });

        await waitFor(() => {
            expect(screen.getByTestId('signed-in').textContent).toBe('signed-in');
            expect(screen.getByTestId('account-uid').textContent).toBe('existing-google-uid');
        });

        expect(mockAuth.signInWithCredential).toHaveBeenCalledWith(credential);
    });

    it('handles missing window.firebase gracefully', async () => {
        delete window.firebase;

        render(
            <AuthProvider>
                <TestConsumer />
            </AuthProvider>
        );

        await waitFor(() => {
            expect(screen.getByTestId('loading').textContent).toBe('ready');
            expect(screen.getByTestId('error').textContent).not.toBe('no-error');
        });
    });
});
