import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'cineflix_watchlist';

/**
 * Custom hook for managing watchlist with localStorage persistence
 * @returns {Object} Watchlist state and functions
 */
const useWatchlist = () => {
    const [watchlist, setWatchlist] = useState([]);

    // Load watchlist from localStorage on mount
    useEffect(() => {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                setWatchlist(JSON.parse(stored));
            }
        } catch (error) {
            console.error('Failed to load watchlist:', error);
        }
    }, []);

    // Save to localStorage whenever watchlist changes
    useEffect(() => {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(watchlist));
        } catch (error) {
            console.error('Failed to save watchlist:', error);
        }
    }, [watchlist]);

    // Check if item is in watchlist
    const isInWatchlist = useCallback((id) => {
        return watchlist.some(item => item.id === id);
    }, [watchlist]);

    // Add item to watchlist
    const addToWatchlist = useCallback((item) => {
        setWatchlist(prev => {
            // Don't add duplicates
            if (prev.some(i => i.id === item.id)) {
                return prev;
            }
            return [...prev, {
                id: item.id,
                title: item.title || item.name,
                poster_path: item.poster_path,
                backdrop_path: item.backdrop_path,
                type: item.type || item.media_type || 'movie',
                vote_average: item.vote_average,
                release_date: item.release_date || item.first_air_date,
                overview: item.overview,
                genre_ids: item.genre_ids,
                addedAt: Date.now()
            }];
        });
    }, []);

    // Remove item from watchlist
    const removeFromWatchlist = useCallback((id) => {
        setWatchlist(prev => prev.filter(item => item.id !== id));
    }, []);

    // Toggle item in watchlist
    const toggleWatchlist = useCallback((item) => {
        if (isInWatchlist(item.id)) {
            removeFromWatchlist(item.id);
            return false; // Removed
        } else {
            addToWatchlist(item);
            return true; // Added
        }
    }, [isInWatchlist, addToWatchlist, removeFromWatchlist]);

    // Clear entire watchlist
    const clearWatchlist = useCallback(() => {
        setWatchlist([]);
    }, []);

    return {
        watchlist,
        isInWatchlist,
        addToWatchlist,
        removeFromWatchlist,
        toggleWatchlist,
        clearWatchlist,
        watchlistCount: watchlist.length
    };
};

export default useWatchlist;
