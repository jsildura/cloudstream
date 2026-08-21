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

/**
 * Initialize Firebase singleton if not already initialized.
 * @returns {{ firebase: object, app: object, auth: object, db: object, storage: object }}
 */
export function initFirebase() {
    if (typeof window === 'undefined' || typeof window.firebase === 'undefined') {
        throw new FirebaseInitializationError('sdk-unavailable', 'Firebase SDK not loaded on window');
    }

    try {
        let app;
        if (!window.firebase.apps || !window.firebase.apps.length) {
            app = window.firebase.initializeApp(firebaseConfig);
        } else {
            app = window.firebase.app();
        }

        const auth = window.firebase.auth();
        const db = window.firebase.database();
        const storage = window.firebase.storage();

        if (import.meta.env?.VITE_USE_FIREBASE_EMULATORS === 'true' && !emulatorConnected) {
            try {
                auth.useEmulator('http://127.0.0.1:9099');
            } catch {
                // Ignore if already connected
            }
            try {
                db.useEmulator('127.0.0.1', 9000);
            } catch {
                // Ignore if already connected
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
