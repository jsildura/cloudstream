import React, { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
    initFirebase,
    isGoogleAccount,
    createGoogleProvider,
    syncGoogleProfileToUserRecord,
    FirebaseInitializationError
} from '../lib/firebase';
import { getGoogleTokenIdentity } from '../lib/globalChatIdentity';
import { flushPendingHistoryBeforeSignOut } from '../lib/pendingHistoryFlush';
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
    // Bumped whenever a sign-in flow upgrades the CURRENT principal in place.
    // linkWithPopup/linkWithRedirect mutate the existing Firebase user object
    // (isAnonymous → false, google.com pushed onto providerData) while keeping
    // the same uid AND the same object reference, and onAuthStateChanged does
    // not fire for a link. Without an explicit signal the accountUser memo
    // below would keep its stale null and the Settings panel would sit on the
    // sign-in view until a reload.
    const [principalVersion, setPrincipalVersion] = useState(0);

    const authInstanceRef = useRef(null);
    const anonPromiseRef = useRef(null);
    const signOutResolveRef = useRef(null);
    const isMountedRef = useRef(true);
    const claimsReqRef = useRef(0);

    const accountUser = useMemo(() => {
        return isGoogleAccount(firebaseUser) ? firebaseUser : null;
        // principalVersion is a deliberate dependency: isGoogleAccount reads
        // fields Firebase mutates in place, so re-deriving the account needs an
        // explicit signal when the object reference itself has not changed.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [firebaseUser, principalVersion]);

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

        // Backfill the user record from the google.com provider before minting
        // the token: a Google account linked onto an anonymous user has an
        // empty displayName/photoURL, which yields a token with no
        // name/picture claims — and database.rules.json then forces GlobalChat
        // identity to 'Google User' with no avatar. A failure here must not
        // block sign-in, so the error is swallowed after logging.
        syncGoogleProfileToUserRecord(accountUser)
            .catch((err) => {
                console.warn('[AuthContext] Failed to sync Google profile to user record:', err);
            })
            .then(() => accountUser.getIdTokenResult(true))
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
     * Publish the principal an interactive sign-in flow just produced.
     *
     * onAuthStateChanged is the only other writer of firebaseUser, and it does
     * NOT fire when a credential is linked onto the already-signed-in anonymous
     * user — the uid never changes. The version bump is what actually re-derives
     * accountUser: linkWithPopup/linkWithRedirect hand back the very object
     * reference React already holds, so setFirebaseUser alone bails on Object.is
     * and the UI would keep reading the pre-link (anonymous) snapshot.
     */
    const publishPrincipal = useCallback((user) => {
        if (!user || !isMountedRef.current) return;
        setFirebaseUser(user);
        setPrincipalVersion(v => v + 1);
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
                        // linkWithRedirect upgrades the anonymous user in place
                        // too, and onAuthStateChanged may already have fired
                        // with the pre-link snapshot on this fresh page load.
                        publishPrincipal(redirectUser);
                    }
                }).catch(async (redirectErr) => {
                    console.warn('[AuthContext] getRedirectResult error:', redirectErr);
                    if (redirectErr.code === 'auth/credential-already-in-use' && redirectErr.credential) {
                        try {
                            const credResult = await auth.signInWithCredential(redirectErr.credential);
                            sessionStorage.removeItem(REDIRECT_PENDING_KEY);
                            if (isMountedRef.current) {
                                publishPrincipal(credResult.user);
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
    }, [ensureAnonymousUser, publishPrincipal]);

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
                    // NOTE: a link leaves sign_in_provider === 'anonymous', which
                    // database.rules.json rejects — see the popup flow below for
                    // the full explanation and the credential re-auth that fixes
                    // it. No caller uses mode: 'redirect' today; enabling it means
                    // applying the same upgrade to the getRedirectResult handler.
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
            let providerUpgraded = false;

            if (auth.currentUser && auth.currentUser.isAnonymous) {
                result = await auth.currentUser.linkWithPopup(provider);
                linkedAnonymous = true;

                // Linking attaches the google.com identity but leaves the
                // session's firebase.sign_in_provider claim at 'anonymous': that
                // claim records the original authentication event, and linking
                // is not a new one (a forced token refresh does not change it
                // either). Every rule in database.rules.json requires
                // sign_in_provider === 'google.com', so a first-time user would
                // spend the whole session denied on accounts/$uid — no profile
                // seeded, none creatable — and denied in GlobalChat too.
                //
                // Re-authenticating with the credential we just received turns
                // this into a genuine google.com sign-in while keeping the same
                // uid, since Google is now linked to this very account. Doing it
                // before publishPrincipal also means the profile listener only
                // ever attaches once the token can pass the rules — a denied
                // .on('value') is cancelled for good and never retries.
                const linkCredential = result.credential;
                if (linkCredential) {
                    try {
                        const reauth = await auth.signInWithCredential(linkCredential);
                        if (reauth && reauth.user) {
                            result = reauth;
                            providerUpgraded = true;
                        }
                    } catch (reauthErr) {
                        // The link itself succeeded, so the user is signed in.
                        // Failing the whole call would report an error for a
                        // sign-in that really happened, so keep them signed in
                        // and report the degraded provider to the caller.
                        console.warn('[AuthContext] Could not upgrade linked session to a google.com sign-in:', reauthErr);
                    }
                }
            } else {
                result = await auth.signInWithPopup(provider);
                linkedAnonymous = false;
                providerUpgraded = true;
            }

            if (isMountedRef.current) {
                publishPrincipal(result.user);
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
                linkedAnonymous,
                providerUpgraded
            };
        } catch (err) {
            // Handle credential collision (already linked to another user)
            if (err.code === 'auth/credential-already-in-use' && err.credential) {
                try {
                    const credResult = await auth.signInWithCredential(err.credential);
                    if (isMountedRef.current) {
                        publishPrincipal(credResult.user);
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
    }, [publishPrincipal]);

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
            // Same provider backfill as the sync effect, so an explicit refresh
            // also repairs identity for an account linked before this existed.
            try {
                await syncGoogleProfileToUserRecord(accountUser);
            } catch (syncErr) {
                console.warn('[AuthContext] Failed to sync Google profile to user record:', syncErr);
            }

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
        // Persist queued watch progress while this account's token is still valid
        await flushPendingHistoryBeforeSignOut();

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
