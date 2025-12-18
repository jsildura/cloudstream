import { useEffect, useRef } from 'react';

// Generate a unique visitor ID (persisted in localStorage)
const getVisitorId = () => {
    const key = 'cineflix_visitor_id';
    let id = localStorage.getItem(key);
    if (!id) {
        id = 'v_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
        localStorage.setItem(key, id);
    }
    return id;
};

// API base URL - use relative path for production
const API_BASE = '/api/visitors';

/**
 * VisitorTracker - Invisible component that maintains visitor online status
 * This component should be mounted at the app root level to persist across all routes
 * It sends heartbeat signals every 30 seconds to keep the visitor marked as online
 * 
 * IMPORTANT: Handles mobile browser background throttling by:
 * - Listening for visibility changes (when user switches back to tab)
 * - Sending immediate heartbeat when page becomes visible again
 */
const VisitorTracker = () => {
    const heartbeatRef = useRef(null);
    const lastHeartbeatRef = useRef(Date.now());

    // Send heartbeat to register this visitor as online
    const sendHeartbeat = async () => {
        try {
            const visitorId = getVisitorId();

            // Try to get user's location info (will be populated by Cloudflare)
            let region = 'Unknown';
            let country = 'Unknown';

            const response = await fetch(API_BASE, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    visitorId,
                    region,
                    country
                })
            });

            if (response.ok) {
                const data = await response.json();
                lastHeartbeatRef.current = Date.now();
                console.log('[VisitorTracker] Heartbeat sent, online count:', data.online);
            }
        } catch (err) {
            console.error('[VisitorTracker] Heartbeat error:', err);
        }
    };

    // Handle visibility change (for mobile browsers that pause JS in background)
    const handleVisibilityChange = () => {
        if (document.visibilityState === 'visible') {
            const timeSinceLastHeartbeat = Date.now() - lastHeartbeatRef.current;

            // If more than 15 seconds since last heartbeat, send one immediately
            // This handles cases where the browser was in background
            if (timeSinceLastHeartbeat > 15000) {
                console.log('[VisitorTracker] Page visible again, sending catch-up heartbeat');
                sendHeartbeat();
            }
        }
    };

    // Handle window focus (additional trigger for mobile)
    const handleFocus = () => {
        const timeSinceLastHeartbeat = Date.now() - lastHeartbeatRef.current;

        // If more than 15 seconds since last heartbeat, send one immediately
        if (timeSinceLastHeartbeat > 15000) {
            console.log('[VisitorTracker] Window focused, sending catch-up heartbeat');
            sendHeartbeat();
        }
    };

    // Setup heartbeat lifecycle
    useEffect(() => {
        console.log('[VisitorTracker] Mounted - Starting heartbeat service');

        // Send initial heartbeat immediately
        sendHeartbeat();

        // Set up heartbeat interval (every 20 seconds to stay within 45s TTL)
        heartbeatRef.current = setInterval(() => {
            sendHeartbeat();
        }, 20000);

        // Listen for visibility changes (critical for mobile browsers!)
        document.addEventListener('visibilitychange', handleVisibilityChange);

        // Listen for window focus (backup for mobile)
        window.addEventListener('focus', handleFocus);

        // Cleanup on unmount
        return () => {
            console.log('[VisitorTracker] Unmounting - Stopping heartbeat service');
            if (heartbeatRef.current) {
                clearInterval(heartbeatRef.current);
            }
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('focus', handleFocus);
        };
    }, []);

    // This component renders nothing (invisible service)
    return null;
};

export default VisitorTracker;

