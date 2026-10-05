/**
 * Shared Firebase configuration and singleton initialization for Streamflix.
 * Used by AuthProvider, GlobalChat, and Popular tracking.
 */

// Firebase configuration for StreamFlix
export const firebaseConfig = {
    apiKey: "AIzaSyA-VQT6muzrgv12mQ9_Afdgx-OtWR8eun0",
    authDomain: "auth.streamflix.stream",
    databaseURL: "https://streamflix-chat-default-rtdb.firebaseio.com",
    projectId: "streamflix-chat",
    storageBucket: "streamflix-chat.firebasestorage.app",
    messagingSenderId: "234688078034",
    appId: "1:234688078034:web:4d3f94dc91426252410d0b"
};

export class FirebaseInitializationError extends Error {
    constructor(code, message, originalError = null) {
        super(message);
        this.name = 'FirebaseInitializationError';
        this.code = code;
        this.originalError = originalError;
    }
}

/**
 * Checks if a user is authenticated with a non-anonymous Google account.
 * @param {object|null} user Firebase user object
 * @returns {boolean}
 */
export function isGoogleAccount(user) {
    if (!user || user.isAnonymous) return false;
    if (!Array.isArray(user.providerData)) return false;
    return user.providerData.some(p => p && p.providerId === 'google.com');
}

/**
 * Copies a linked Google account's displayName/photoURL onto the top-level
 * Firebase user record when they are missing.
 *
 * linkWithPopup/linkWithRedirect attach the google.com provider WITHOUT
 * copying its profile onto the user record, so the ID token minted afterwards
 * carries no `name`/`picture` claims. database.rules.json validates GlobalChat
 * identity against those claims, so without this backfill chat identity is
 * pinned to 'Google User' with no avatar. Call this before force-refreshing
 * the ID token.
 *
 * Only fills blanks — never overwrites a name/photo the record already has.
 *
 * @param {object|null} user Firebase user object
 * @returns {Promise<boolean>} true when the record was updated
 */
export async function syncGoogleProfileToUserRecord(user) {
    if (!isGoogleAccount(user) || typeof user.updateProfile !== 'function') return false;

    const google = user.providerData.find(p => p && p.providerId === 'google.com');
    if (!google) return false;

    const updates = {};

    const currentName = typeof user.displayName === 'string' ? user.displayName.trim() : '';
    const googleName = typeof google.displayName === 'string' ? google.displayName.trim() : '';
    if (currentName.length === 0 && googleName.length > 0) {
        updates.displayName = googleName;
    }

    const currentPhoto = typeof user.photoURL === 'string' ? user.photoURL : '';
    const googlePhoto = typeof google.photoURL === 'string' ? google.photoURL : '';
    if (!/^https:\/\//i.test(currentPhoto) && /^https:\/\//i.test(googlePhoto)) {
        updates.photoURL = googlePhoto;
    }

    if (Object.keys(updates).length === 0) return false;

    await user.updateProfile(updates);
    return true;
}

/**
 * Creates and configures a GoogleAuthProvider instance.
 * @returns {object} GoogleAuthProvider instance
 */
export function createGoogleProvider() {
    if (typeof window === 'undefined' || !window.firebase?.auth?.GoogleAuthProvider) {
        throw new FirebaseInitializationError('sdk-unavailable', 'Firebase Auth SDK is not available on window');
    }
    const provider = new window.firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    return provider;
}

let emulatorConnected = false;
let firebaseLoadPromise = null;
let storageLoadPromise = null;

const FIREBASE_SCRIPTS = {
    app: 'https://www.gstatic.com/firebasejs/8.10.1/firebase-app.js',
    auth: 'https://www.gstatic.com/firebasejs/8.10.1/firebase-auth.js',
    database: 'https://www.gstatic.com/firebasejs/8.10.1/firebase-database.js',
    storage: 'https://www.gstatic.com/firebasejs/8.10.1/firebase-storage.js'
};

/**
 * Dynamically injects a script tag and returns a Promise that settles when loaded.
 * Idempotent: reuses an existing matching script tag if present.
 *
 * @param {string} src Script source URL
 * @param {number} [timeoutMs=15000] Timeout before rejecting
 * @returns {Promise<void>}
 */
function loadScript(src, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
        if (typeof document === 'undefined') {
            return reject(new FirebaseInitializationError('sdk-unavailable', 'Document not available for script loading'));
        }

        const existing = document.querySelector(`script[src="${src}"]`);
        if (existing) {
            if (existing.dataset.loaded === 'true') {
                return resolve();
            }
            existing.addEventListener('load', () => resolve(), { once: true });
            existing.addEventListener('error', (e) => reject(new FirebaseInitializationError('sdk-network-error', `Failed to load script: ${src}`, e)), { once: true });
            return;
        }

        const script = document.createElement('script');
        script.src = src;
        script.async = true;
        script.crossOrigin = 'anonymous';

        let timer = null;
        if (timeoutMs > 0) {
            timer = setTimeout(() => {
                script.onerror = null;
                script.onload = null;
                reject(new FirebaseInitializationError('sdk-timeout', `Timeout loading script: ${src}`));
            }, timeoutMs);
        }

        script.onload = () => {
            if (timer) clearTimeout(timer);
            script.dataset.loaded = 'true';
            resolve();
        };

        script.onerror = (e) => {
            if (timer) clearTimeout(timer);
            try { script.remove(); } catch { /* ignore */ }
            reject(new FirebaseInitializationError('sdk-network-error', `Failed to load script: ${src}`, e));
        };

        try {
            document.head.appendChild(script);
        } catch (err) {
            if (timer) clearTimeout(timer);
            reject(new FirebaseInitializationError('sdk-unavailable', `Failed to inject script: ${src}`, err));
        }
    });
}

let lastWindowFirebase = null;
let cachedResolvedPromise = null;

/**
 * Asynchronously loads Firebase SDK scripts on demand and returns the initialized singleton.
 * Idempotent: multiple callers receive the exact same singleton promise.
 *
 * @returns {Promise<{ firebase: object, app: object, auth: object, db: object, storage: object|null }>}
 */
export function loadFirebase() {
    if (typeof window === 'undefined') {
        return Promise.reject(new FirebaseInitializationError('sdk-unavailable', 'Firebase SDK requires a window environment'));
    }

    if (window.firebase && (
        window.firebase.apps ||
        typeof window.firebase.initializeApp === 'function' ||
        typeof window.firebase.auth === 'function' ||
        typeof window.firebase.database === 'function'
    )) {
        if (window.firebase === lastWindowFirebase && cachedResolvedPromise) {
            return cachedResolvedPromise;
        }
        try {
            const initialized = initFirebase();
            lastWindowFirebase = window.firebase;
            cachedResolvedPromise = Promise.resolve(initialized);
            return cachedResolvedPromise;
        } catch (e) {
            return Promise.reject(e);
        }
    }

    // In unit test environments without window.firebase mocked, fail fast rather than attempting real network fetches
    if (import.meta.env?.MODE === 'test') {
        lastWindowFirebase = null;
        cachedResolvedPromise = null;
        return Promise.reject(new FirebaseInitializationError('sdk-unavailable', 'Firebase SDK not loaded on window'));
    }

    if (firebaseLoadPromise) {
        return firebaseLoadPromise;
    }

    firebaseLoadPromise = (async () => {
        try {
            // 1. firebase-app.js must load and execute first to create window.firebase
            await loadScript(FIREBASE_SCRIPTS.app);

            if (!window.firebase) {
                throw new FirebaseInitializationError('sdk-unavailable', 'Firebase App SDK loaded but window.firebase is missing');
            }

            // 2. Load auth and database in parallel
            await Promise.all([
                loadScript(FIREBASE_SCRIPTS.auth),
                loadScript(FIREBASE_SCRIPTS.database)
            ]);

            const initialized = initFirebase();
            lastWindowFirebase = window.firebase;
            cachedResolvedPromise = Promise.resolve(initialized);
            return initialized;
        } catch (err) {
            lastWindowFirebase = null;
            cachedResolvedPromise = null;
            if (err instanceof FirebaseInitializationError) {
                throw err;
            }
            throw new FirebaseInitializationError('init-failed', err?.message || 'Failed to load Firebase scripts', err);
        } finally {
            firebaseLoadPromise = null;
        }
    })();

    return firebaseLoadPromise;
}

/**
 * On-demand loader for Firebase Storage SDK (firebase-storage.js).
 * Only loaded when storage operations are explicitly triggered.
 *
 * @returns {Promise<object>} Firebase storage instance
 */
export async function loadFirebaseStorage() {
    await loadFirebase();

    if (typeof window.firebase?.storage === 'function') {
        return window.firebase.storage();
    }

    if (storageLoadPromise) {
        return storageLoadPromise;
    }

    storageLoadPromise = (async () => {
        try {
            await loadScript(FIREBASE_SCRIPTS.storage);
            if (typeof window.firebase?.storage !== 'function') {
                throw new FirebaseInitializationError('storage-unavailable', 'Firebase storage failed to initialize');
            }
            return window.firebase.storage();
        } catch (err) {
            storageLoadPromise = null;
            if (err instanceof FirebaseInitializationError) throw err;
            throw new FirebaseInitializationError('storage-failed', err?.message || 'Failed to load Firebase storage', err);
        }
    })();

    return storageLoadPromise;
}

/**
 * Creates and configures a GoogleAuthProvider instance after ensuring Firebase Auth is loaded.
 * @returns {Promise<object>} GoogleAuthProvider instance
 */
export async function getGoogleAuthProvider() {
    await loadFirebase();
    return createGoogleProvider();
}

/**
 * Reset loader promises (for test isolation only).
 */
export function _resetFirebaseLoaderForTests() {
    firebaseLoadPromise = null;
    storageLoadPromise = null;
    lastWindowFirebase = null;
    cachedResolvedPromise = null;
}

/**
 * Initialize Firebase singleton if not already initialized.
 * @returns {{ firebase: object, app: object, auth: object, db: object, storage: object|null }}
 */
export function initFirebase() {
    if (typeof window === 'undefined' || typeof window.firebase === 'undefined') {
        throw new FirebaseInitializationError('sdk-unavailable', 'Firebase SDK not loaded on window');
    }

    try {
        let app = null;
        if (typeof window.firebase.initializeApp === 'function') {
            if (!window.firebase.apps || !window.firebase.apps.length) {
                app = window.firebase.initializeApp(firebaseConfig);
            } else if (typeof window.firebase.app === 'function') {
                app = window.firebase.app();
            }
        } else if (typeof window.firebase.app === 'function') {
            app = window.firebase.app();
        } else if (Array.isArray(window.firebase.apps) && window.firebase.apps.length > 0) {
            app = window.firebase.apps[0];
        }

        const auth = typeof window.firebase.auth === 'function' ? window.firebase.auth() : null;
        const db = typeof window.firebase.database === 'function' ? window.firebase.database() : null;
        // Storage is deferred and optional; only invoke if available
        const storage = typeof window.firebase.storage === 'function' ? window.firebase.storage() : null;

        if (import.meta.env?.VITE_USE_FIREBASE_EMULATORS === 'true' && !emulatorConnected) {
            if (auth?.useEmulator) {
                try {
                    auth.useEmulator('http://127.0.0.1:9099');
                } catch {
                    // Ignore if already connected
                }
            }
            if (db?.useEmulator) {
                try {
                    db.useEmulator('127.0.0.1', 9000);
                } catch {
                    // Ignore if already connected
                }
            }
            emulatorConnected = true;
        }

        return {
            firebase: window.firebase,
            app,
            auth,
            db,
            storage
        };
    } catch (e) {
        if (e instanceof FirebaseInitializationError) throw e;
        throw new FirebaseInitializationError('init-failed', e.message || 'Firebase initialization failed', e);
    }
}

