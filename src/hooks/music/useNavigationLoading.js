import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Friendly messages for different routes
 */
const ROUTE_MESSAGES = {
    album: 'Opening album',
    artist: 'Visiting artist',
    playlist: 'Loading playlist',
    track: 'Loading track'
};

/**
 * useNavigationLoading - Hook for tracking navigation loading state
 * 
 * Ported from tidal-ui +layout.svelte (lines 155-166)
 * Provides:
 * - Loading state during navigation
 * - Friendly navigation messages
 */
const useNavigationLoading = () => {
    const location = useLocation();
    const [isNavigating, setIsNavigating] = useState(false);
    const [navigationMessage, setNavigationMessage] = useState('');
    const [previousPath, setPreviousPath] = useState(location.pathname);

    useEffect(() => {
        // Detect navigation start
        if (location.pathname !== previousPath) {
            setIsNavigating(true);

            // Generate friendly message
            const [primarySegment] = location.pathname.split('/').filter(Boolean).slice(1);
            if (primarySegment) {
                const key = primarySegment.toLowerCase();
                if (key in ROUTE_MESSAGES) {
                    setNavigationMessage(ROUTE_MESSAGES[key]);
                } else {
                    const normalized = key.replace(/[-_]+/g, ' ');
                    setNavigationMessage(`Loading ${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}`);
                }
            } else {
                setNavigationMessage('Loading');
            }

            // Short delay to show loading, then mark complete
            const timer = setTimeout(() => {
                setIsNavigating(false);
                setNavigationMessage('');
            }, 300);

            setPreviousPath(location.pathname);

            return () => clearTimeout(timer);
        }
    }, [location.pathname, previousPath]);

    return {
        isNavigating,
        navigationMessage
    };
};

export default useNavigationLoading;
