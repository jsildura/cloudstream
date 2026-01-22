/**
 * Shared Firebase configuration for Streamflix
 * Used by GlobalChat and Popular tracking
 */

// Firebase configuration for StreamFlix
export const firebaseConfig = {
    apiKey: "AIzaSyA-VQT6muzrgv12mQ9_Afdgx-OtWR8eun0",
    authDomain: "streamflix-chat.firebaseapp.com",
    databaseURL: "https://streamflix-chat-default-rtdb.firebaseio.com",
    projectId: "streamflix-chat",
    storageBucket: "streamflix-chat.firebasestorage.app",
    messagingSenderId: "234688078034",
    appId: "1:234688078034:web:4d3f94dc91426252410d0b"
};

/**
 * Initialize Firebase if not already initialized
 * @returns {{ db: object, auth: object } | null}
 */
export const initFirebase = () => {
    if (typeof window === 'undefined' || typeof window.firebase === 'undefined') {
        console.warn('Firebase SDK not loaded');
        return null;
    }

    try {
        if (!window.firebase.apps.length) {
            window.firebase.initializeApp(firebaseConfig);
        }
        return {
            db: window.firebase.database(),
            auth: window.firebase.auth()
        };
    } catch (e) {
        console.error('Firebase init error:', e);
        return null;
    }
};
