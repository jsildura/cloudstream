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
 */
const VisitorTracker = () => {
    const heartbeatRef = useRef(null);

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
                console.log('[VisitorTracker] Heartbeat sent, online count:', data.online);
            }
        } catch (err) {
            console.error('[VisitorTracker] Heartbeat error:', err);
        }
    };

    // Setup heartbeat lifecycle
    useEffect(() => {
        console.log('[VisitorTracker] Mounted - Starting heartbeat service');
        
        // Send initial heartbeat immediately
        sendHeartbeat();

        // Set up heartbeat interval (every 30 seconds)
        heartbeatRef.current = setInterval(() => {
            sendHeartbeat();
        }, 30000);

        // Cleanup on unmount
        return () => {
            console.log('[VisitorTracker] Unmounting - Stopping heartbeat service');
            if (heartbeatRef.current) {
                clearInterval(heartbeatRef.current);
            }
        };
    }, []);

    // This component renders nothing (invisible service)
    return null;
};

export default VisitorTracker;
