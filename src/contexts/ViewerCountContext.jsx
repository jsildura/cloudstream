import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import useTVDetect from '../hooks/useTVDetect';

const ViewerCountContext = createContext();

// Master switch for the live viewer counter. Disabled because every heartbeat
// costs one Cloudflare KV read + one write against a 1,000-writes/day free
// tier, so the quota burns faster the more daily users the site gets — the
// cost scales with traffic while the feature is only decorative. Flipping this
// back to true restores both the heartbeat and the footer readout; nothing else
// needs changing on the client. See also functions/api/visit.js, which is
// short-circuited so direct hits to the endpoint cannot spend the quota either.
export const VIEWER_COUNT_ENABLED = false;

const HEARTBEAT_INTERVAL = 180000; // 180 seconds — reduced from 60s to stay within KV free tier: 1,000 writes/day
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
    } catch {
        // Fallback for SSR or localStorage unavailable
        return 'anon-' + Math.random().toString(36).substring(2, 10);
    }
}

export function ViewerCountProvider({ children }) {
    const [count, setCount] = useState(0);
    // Never "loading" while disabled, so no consumer can render a spinner or
    // placeholder waiting on a heartbeat that will never be sent.
    const [isLoading, setIsLoading] = useState(VIEWER_COUNT_ENABLED);
    const [error, setError] = useState(null);
    const isTVMode = useTVDetect();

    // Use ref to store UID so it's stable across renders
    const uidRef = useRef(null);
    // Use ref to track if component is mounted
    const isMountedRef = useRef(true);

    // Initialize UID once
    useEffect(() => {
        if (!VIEWER_COUNT_ENABLED) return;
        uidRef.current = getOrCreateUid();
    }, []);

    useEffect(() => {
        // Disabled: send nothing. This is the single place the KV quota was
        // spent from, so returning here is what actually stops the cost.
        if (!VIEWER_COUNT_ENABLED) return;

        isMountedRef.current = true;

        const sendHeartbeat = async () => {
            // Wait for UID to be initialized
            if (!uidRef.current) {
                uidRef.current = getOrCreateUid();
            }

            const uid = uidRef.current;

            try {
                const response = await fetch(`/api/visit?uid=${uid}&t=${Date.now()}`);

                if (!isMountedRef.current) return; // Don't update state if unmounted

                if (response.ok) {
                    const data = await response.json();
                    setCount(data.count ?? 0);
                    setError(null);
                } else {
                    setError('API error');
                }
            } catch (err) {
                if (!isMountedRef.current) return;
                setError(err.message);
            } finally {
                if (isMountedRef.current) {
                    setIsLoading(false);
                }
            }
        };

    // Send initial heartbeat
        sendHeartbeat();

        // Set up interval - this should continue running as long as the provider is mounted
        const currentInterval = isTVMode ? HEARTBEAT_INTERVAL * 3 : HEARTBEAT_INTERVAL;
        let intervalId = setInterval(sendHeartbeat, currentInterval);

        // Pause the interval when the tab is hidden to avoid wasting requests
        // on backgrounded tabs, and resume with an immediate heartbeat on return.
        const handleVisibility = () => {
            if (document.hidden) {
                clearInterval(intervalId);
                intervalId = null;
            } else {
                sendHeartbeat();
                intervalId = setInterval(sendHeartbeat, currentInterval);
            }
        };
        document.addEventListener('visibilitychange', handleVisibility);

        return () => {
            isMountedRef.current = false;
            if (intervalId) clearInterval(intervalId);
            document.removeEventListener('visibilitychange', handleVisibility);
        };
    }, [isTVMode]); // Re-run if TV mode detects changes

    return (
        <ViewerCountContext.Provider value={{ count, isLoading, error, enabled: VIEWER_COUNT_ENABLED }}>
            {children}
        </ViewerCountContext.Provider>
    );
}

export function useViewerCount() {
    const context = useContext(ViewerCountContext);
    if (!context) {
        throw new Error('useViewerCount must be used within a ViewerCountProvider');
    }
    return context;
}
