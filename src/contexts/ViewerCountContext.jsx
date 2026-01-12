import React, { createContext, useContext, useState, useEffect, useRef } from 'react';

const ViewerCountContext = createContext();

const HEARTBEAT_INTERVAL = 20000; // 20 seconds
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

export function ViewerCountProvider({ children }) {
    const [count, setCount] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    // Use ref to store UID so it's stable across renders
    const uidRef = useRef(null);
    // Use ref to track if component is mounted
    const isMountedRef = useRef(true);

    // Initialize UID once
    useEffect(() => {
        uidRef.current = getOrCreateUid();
    }, []);

    useEffect(() => {
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
        const intervalId = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);

        return () => {
            isMountedRef.current = false;
            clearInterval(intervalId);
        };
    }, []); // Empty dependency array - only run once on mount

    return (
        <ViewerCountContext.Provider value={{ count, isLoading, error }}>
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
