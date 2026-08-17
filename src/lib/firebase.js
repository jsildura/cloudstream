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
