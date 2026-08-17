import React, { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
    initFirebase,
    isGoogleAccount,
    createGoogleProvider,
    FirebaseInitializationError
} from '../lib/firebase';
import { getGoogleTokenIdentity } from '../lib/globalChatIdentity';
import { isTVDevice } from '../utils/platform';

const REDIRECT_PENDING_KEY = 'streamflix_google_auth_pending_v1';

const AuthContext = createContext({
    firebaseUser: null,
    accountUser: null,
    isSignedIn: false,
    isAuthLoading: true,
    authError: null,
    authEvent: null,
    chatIdentity: null,
    authClaims: {},
    isGlobalChatAdmin: false,
    refreshAuthClaims: async () => ({ ok: false }),
    signInWithGoogle: async () => ({ ok: false }),
    signOutAccount: async () => ({ ok: false }),
    clearAuthEvent: () => {}
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
    const [firebaseUser, setFirebaseUser] = useState(null);
    const [isAuthLoading, setIsAuthLoading] = useState(true);
    const [authError, setAuthError] = useState(null);
    const [authEvent, setAuthEvent] = useState(null);
    const [chatIdentity, setChatIdentity] = useState(null);
    const [authClaims, setAuthClaims] = useState({});

    const authInstanceRef = useRef(null);
    const anonPromiseRef = useRef(null);
    const signOutResolveRef = useRef(null);
    const isMountedRef = useRef(true);
    const claimsReqRef = useRef(0);

    const accountUser = useMemo(() => {
        return isGoogleAccount(firebaseUser) ? firebaseUser : null;
    }, [firebaseUser]);

    const isSignedIn = !!accountUser;
    const isGlobalChatAdmin = authClaims.globalChatAdmin === true;

    // Synchronize ID-token claims and Google token identity on principal changes
    useEffect(() => {
        if (!accountUser || typeof accountUser.getIdTokenResult !== 'function') {
            setAuthClaims({});
            setChatIdentity(null);
            return;
        }

        const currentGeneration = ++claimsReqRef.current;
        const currentUid = accountUser.uid;

        setAuthClaims({});
        setChatIdentity(null);

        accountUser.getIdTokenResult(true)
            .then((tokenResult) => {
                if (!isMountedRef.current) return;
                if (claimsReqRef.current !== currentGeneration) return;
                if (accountUser.uid !== currentUid) return;

                const claims = tokenResult?.claims || {};
                setAuthClaims(claims);
                setChatIdentity(getGoogleTokenIdentity(currentUid, claims));
            })
            .catch((err) => {
                if (!isMountedRef.current) return;
                if (claimsReqRef.current !== currentGeneration) return;
                if (accountUser.uid !== currentUid) return;

                console.warn('[AuthContext] Failed to get token claims:', err);
                setAuthClaims({});
                setChatIdentity(getGoogleTokenIdentity(currentUid, {}));
            });
    }, [accountUser]);

    const clearAuthEvent = useCallback(() => {
        setAuthEvent(null);
    }, []);

    /**
     * Deduplicated anonymous user creation.
     * Ensures only one signInAnonymously call is in flight.
     */
    const ensureAnonymousUser = useCallback(async (authInstance) => {
        const auth = authInstance || authInstanceRef.current;
        if (!auth) return null;

        if (auth.currentUser && auth.currentUser.isAnonymous) {
            return auth.currentUser;
        }

        if (anonPromiseRef.current) {
            return anonPromiseRef.current;
        }

        anonPromiseRef.current = (async () => {
            try {
                const cred = await auth.signInAnonymously();
                return cred.user;
            } catch (err) {
                console.error('[AuthContext] Failed to create anonymous user:', err);
                if (isMountedRef.current) {
                    setAuthError(err);
                }
                throw err;
            } finally {
                anonPromiseRef.current = null;
            }
        })();

        return anonPromiseRef.current;
    }, []);

    // Initialize Firebase Auth on mount
    useEffect(() => {
        isMountedRef.current = true;
        let unsubscribe = () => {};

        const setupAuth = () => {
            try {
                const { auth } = initFirebase();
                authInstanceRef.current = auth;

                // Set local persistence
                if (window.firebase?.auth?.Auth?.Persistence?.LOCAL) {
                    auth.setPersistence(window.firebase.auth.Auth.Persistence.LOCAL).catch((err) => {
                        console.warn('[AuthContext] setPersistence error:', err);
                    });
                }

                // Check for redirect result in background
                auth.getRedirectResult().then(async (redirectResult) => {
                    if (!isMountedRef.current) return;
                    if (redirectResult && redirectResult.user) {
                        const redirectUser = redirectResult.user;
                        const pendingRaw = sessionStorage.getItem(REDIRECT_PENDING_KEY);
                        let returnPath = '/';
                        let redirectLinked = false;
                        if (pendingRaw) {
                            try {
                                const parsed = JSON.parse(pendingRaw);
                                returnPath = parsed.returnPath || '/';
                                redirectLinked = !!parsed.linkedAnonymous;
                            } catch {
                                returnPath = pendingRaw;
                            }
                            sessionStorage.removeItem(REDIRECT_PENDING_KEY);
                        }

                        setAuthEvent({
                            type: 'interactive-google-sign-in-complete',
                            uid: redirectUser.uid,
                            returnPath,
                            linkedAnonymous: redirectLinked
                        });
                    }
                }).catch(async (redirectErr) => {
                    console.warn('[AuthContext] getRedirectResult error:', redirectErr);
                    if (redirectErr.code === 'auth/credential-already-in-use' && redirectErr.credential) {
                        try {
                            const credResult = await auth.signInWithCredential(redirectErr.credential);
                            sessionStorage.removeItem(REDIRECT_PENDING_KEY);
                            if (isMountedRef.current) {
                                setAuthEvent({
                                    type: 'interactive-google-sign-in-complete',
                                    uid: credResult.user.uid,
                                    returnPath: '/',
                                    linkedAnonymous: false
                                });
                            }
                        } catch (credErr) {
                            console.error('[AuthContext] signInWithCredential after redirect error:', credErr);
                        }
                    }
                });

                // Listen for auth state changes
                unsubscribe = auth.onAuthStateChanged(async (user) => {
                    if (!isMountedRef.current) return;

                    if (user) {
                        setFirebaseUser(user);
                        setIsAuthLoading(false);
                        setAuthError(null);

                        // If a sign-out was waiting for replacement anonymous user
                        if (signOutResolveRef.current) {
                            const resolve = signOutResolveRef.current;
                            signOutResolveRef.current = null;
                            resolve({ ok: true, user });
                        }
                    } else {
                        // User is null — ensure an anonymous user session exists
                        try {
                            const anonUser = await ensureAnonymousUser(auth);
                            if (isMountedRef.current) {
                                setFirebaseUser(anonUser);
                                setIsAuthLoading(false);
                            }
                        } catch (anonErr) {
                            if (isMountedRef.current) {
                                setFirebaseUser(null);
                                setIsAuthLoading(false);
                                setAuthError(anonErr);
                            }
                            if (signOutResolveRef.current) {
                                const resolve = signOutResolveRef.current;
                                signOutResolveRef.current = null;
                                resolve({ ok: false, error: anonErr });
                            }
                        }
                    }
                });
            } catch (err) {
                console.warn('[AuthContext] Firebase initialization failed:', err);
                if (isMountedRef.current) {
                    setIsAuthLoading(false);
                    setAuthError(err instanceof FirebaseInitializationError ? err : new FirebaseInitializationError('init-failed', err.message, err));
                }
            }
        };

        setupAuth();

        return () => {
            isMountedRef.current = false;
            unsubscribe();
        };
    }, [ensureAnonymousUser]);

    /**
     * Sign in with Google (Popup or Redirect)
     */
    const signInWithGoogle = useCallback(async (options = {}) => {
        // TV device check
        if (isTVDevice()) {
            return {
                ok: false,
                reason: 'tv-unsupported',
                message: 'Sign-in is unavailable on this TV browser. Use a phone or computer.'
            };
        }

        const auth = authInstanceRef.current;
        if (!auth) {
            return {
                ok: false,
                reason: 'sdk-unavailable',
                message: 'Authentication service is not available.'
            };
        }

        const returnPath = options.returnPath || (typeof window !== 'undefined' ? window.location.pathname + window.location.search : '/');
        const mode = options.mode || 'popup';

        let provider;
        try {
            provider = createGoogleProvider();
        } catch (err) {
            return {
                ok: false,
                reason: 'provider-create-failed',
                error: err,
                message: err.message
            };
        }

        // Redirect Flow
        if (mode === 'redirect') {
            try {
                const pendingState = {
                    returnPath,
                    linkedAnonymous: !!auth.currentUser?.isAnonymous
                };
                sessionStorage.setItem(REDIRECT_PENDING_KEY, JSON.stringify(pendingState));

                if (auth.currentUser && auth.currentUser.isAnonymous) {
                    await auth.currentUser.linkWithRedirect(provider);
                } else {
                    await auth.signInWithRedirect(provider);
                }
                return { ok: true, mode: 'redirect-started' };
            } catch (err) {
                sessionStorage.removeItem(REDIRECT_PENDING_KEY);
                return {
                    ok: false,
                    reason: 'redirect-failed',
                    error: err,
                    message: err.message
                };
            }
        }

        // Popup Flow (Default)
        try {
            let result;
            let linkedAnonymous = false;

            if (auth.currentUser && auth.currentUser.isAnonymous) {
                result = await auth.currentUser.linkWithPopup(provider);
                linkedAnonymous = true;
            } else {
                result = await auth.signInWithPopup(provider);
                linkedAnonymous = false;
            }

            if (isMountedRef.current) {
                setAuthEvent({
                    type: 'interactive-google-sign-in-complete',
                    uid: result.user.uid,
                    returnPath,
                    linkedAnonymous
                });
            }

            return {
                ok: true,
                user: result.user,
                linkedAnonymous
            };
        } catch (err) {
            // Handle credential collision (already linked to another user)
            if (err.code === 'auth/credential-already-in-use' && err.credential) {
                try {
                    const credResult = await auth.signInWithCredential(err.credential);
                    if (isMountedRef.current) {
                        setAuthEvent({
                            type: 'interactive-google-sign-in-complete',
                            uid: credResult.user.uid,
                            returnPath,
                            linkedAnonymous: false
                        });
                    }
                    return {
                        ok: true,
                        user: credResult.user,
                        linkedAnonymous: false
                    };
                } catch (credErr) {
                    return {
                        ok: false,
                        reason: 'credential-sign-in-failed',
                        error: credErr,
                        message: credErr.message
                    };
                }
            }

            // Handle account exists with different credential
            if (err.code === 'auth/account-exists-with-different-credential') {
                let methods = [];
                if (err.email && typeof auth.fetchSignInMethodsForEmail === 'function') {
                    try {
                        methods = await auth.fetchSignInMethodsForEmail(err.email);
                    } catch {
                        methods = [];
                    }
                }

                const msg = methods.length > 0
                    ? `An account already exists with ${err.email}. Existing sign-in methods: ${methods.join(', ')}.`
                    : 'An account already exists with a different sign-in method.';

                return {
                    ok: false,
                    reason: 'existing-provider-unsupported',
                    message: msg,
                    providers: methods,
                    error: err
                };
            }

            if (err.code === 'auth/unauthorized-domain') {
                const domainMatch = err.message ? err.message.match(/This domain \(([^)]+)\)/i) : null;
                const domain = domainMatch ? domainMatch[1] : (typeof window !== 'undefined' ? window.location.hostname : 'current domain');
                return {
                    ok: false,
                    reason: 'unauthorized-domain',
                    message: `This domain (${domain}) is not authorized`,
                    error: err
                };
            }

            if (err.code === 'auth/popup-closed-by-user') {
                return {
                    ok: false,
                    reason: 'popup-closed',
                    message: 'Sign-in popup was closed before completing.'
                };
            }

            if (err.code === 'auth/popup-blocked') {
                return {
                    ok: false,
                    reason: 'popup-blocked',
                    message: 'Sign-in popup was blocked by your browser. Please allow popups or try redirect.'
                };
            }

            return {
                ok: false,
                reason: err.code || 'unknown',
                error: err,
                message: err.message || 'Google sign-in failed.'
            };
        }
    }, []);

    /**
     * Refresh ID-token claims and synchronize Google chat identity.
     */
    const refreshAuthClaims = useCallback(async () => {
        if (!accountUser || typeof accountUser.getIdTokenResult !== 'function') {
            return { ok: false, reason: 'not-signed-in' };
        }

        const currentGeneration = ++claimsReqRef.current;
        const currentUid = accountUser.uid;

        try {
            const tokenResult = await accountUser.getIdTokenResult(true);
            if (!isMountedRef.current || claimsReqRef.current !== currentGeneration || accountUser.uid !== currentUid) {
                return { ok: false, reason: 'stale-request' };
            }

            const claims = tokenResult?.claims || {};
            setAuthClaims(claims);
            const identity = getGoogleTokenIdentity(currentUid, claims);
            setChatIdentity(identity);

            return { ok: true, claims, identity };
        } catch (err) {
            if (isMountedRef.current && claimsReqRef.current === currentGeneration && accountUser.uid === currentUid) {
                console.warn('[AuthContext] Failed to refresh token claims:', err);
            }
            return { ok: false, error: err, reason: 'refresh-failed' };
        }
    }, [accountUser]);

    /**
     * Sign out Google account and replace with a clean anonymous user.
     */
    const signOutAccount = useCallback(async () => {
        // Clear identity and claims immediately before waiting for anonymous replacement
        claimsReqRef.current++;
        setAuthClaims({});
        setChatIdentity(null);

        const auth = authInstanceRef.current;
        if (!auth) {
            return { ok: true };
        }

        if (!isGoogleAccount(auth.currentUser)) {
            return { ok: true };
        }

        return new Promise((resolve) => {
            signOutResolveRef.current = resolve;

            // Safety timeout: resolve even if anonymous replacement hangs
            const timeoutId = setTimeout(() => {
                if (signOutResolveRef.current) {
                    signOutResolveRef.current = null;
                    if (isMountedRef.current) {
                        setFirebaseUser(null);
                    }
                    resolve({ ok: true });
                }
            }, 5000);

            auth.signOut().catch((err) => {
                clearTimeout(timeoutId);
                signOutResolveRef.current = null;
                console.error('[AuthContext] Sign out error:', err);
                if (isMountedRef.current) {
                    setAuthError(err);
                }
                resolve({ ok: false, error: err });
            });
        });
    }, []);

    const contextValue = useMemo(() => ({
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
    }), [
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
    ]);

    return (
        <AuthContext.Provider value={contextValue}>
            {children}
        </AuthContext.Provider>
    );
};
