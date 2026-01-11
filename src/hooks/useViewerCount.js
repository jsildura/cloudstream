import { useState, useEffect, useCallback } from 'react';

/**
 * useViewerCount - Custom hook for live viewer counting
 * 
 * Sends a heartbeat to /api/visit every 30 seconds with a unique user ID.
 * Returns the current viewer count from the server.
 */

const HEARTBEAT_INTERVAL = 30000; // 30 seconds
const STORAGE_KEY = 'streamflix_visitor_uid';

function getOrCreateUid() {
    try {
        let uid = localStorage.getItem(STORAGE_KEY);
        if (!uid) {
            // Generate a random UID
            uid = Math.random().toString(36).substring(2, 15) +
                Math.random().toString(36).substring(2, 15);
            localStorage.setItem(STORAGE_KEY, uid);
        }
        return uid;
    } catch (e) {
        // Fallback for SSR or localStorage unavailable
        return 'anon-' + Math.random().toString(36).substring(2, 10);
    }
}

export function useViewerCount() {
    const [count, setCount] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    const sendHeartbeat = useCallback(async () => {
        try {
            const uid = getOrCreateUid();
            const response = await fetch(`/api/visit?uid=${uid}&t=${Date.now()}`);

            if (response.ok) {
                const data = await response.json();
                setCount(data.count ?? 0);
                setError(null);
            } else {
                // API returned error but we still want to show something
                console.warn('Viewer count API error:', response.status);
                setCount(0);
                setError('API error');
            }
        } catch (err) {
            console.error('Viewer count fetch error:', err);
            // Network error - still show 0 rather than hiding
            setCount(0);
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        // Send initial heartbeat
        sendHeartbeat();

        // Set up interval for subsequent heartbeats
        const intervalId = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);

        // Cleanup on unmount
        return () => clearInterval(intervalId);
    }, [sendHeartbeat]);

    return { count, isLoading, error };
}

export default useViewerCount;
