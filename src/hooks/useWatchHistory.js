import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'cineflix_watch_history';
const MAX_ITEMS = 20;

/**
 * Custom hook for managing watch history with localStorage persistence
 * Tracks movies and TV shows that users have watched
 * @returns {Object} Watch history state and functions
 */
const useWatchHistory = () => {
    const [watchHistory, setWatchHistory] = useState([]);

    // Load watch history from localStorage on mount
    useEffect(() => {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                const parsed = JSON.parse(stored);
                // Sort by most recent first
                const sorted = parsed.sort((a, b) => b.lastWatched - a.lastWatched);
                setWatchHistory(sorted);
            }
        } catch (error) {
            console.error('Failed to load watch history:', error);
        }
    }, []);

    // Save to localStorage whenever watch history changes
    useEffect(() => {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(watchHistory));
        } catch (error) {
            console.error('Failed to save watch history:', error);
        }
    }, [watchHistory]);

    // Add or update item in watch history
    const addToHistory = useCallback((item) => {
        setWatchHistory(prev => {
            // Remove existing entry if present
            const filtered = prev.filter(i => i.id !== item.id);

            // Create new entry with timestamp
            const newEntry = {
                id: item.id,
                type: item.type,
                title: item.title,
                poster_path: item.poster_path,
                backdrop_path: item.backdrop_path,
                lastWatched: Date.now(),
                ...(item.type === 'tv' && {
                    lastSeason: item.lastSeason,
                    lastEpisode: item.lastEpisode,
                    totalSeasons: item.totalSeasons,
                }),
            };

            // Add to beginning of array
            const updated = [newEntry, ...filtered];

            // Limit to MAX_ITEMS (20)
            return updated.slice(0, MAX_ITEMS);
        });
    }, []);

    // Get all watch history (already sorted)
    const getWatchHistory = useCallback(() => {
        return watchHistory;
    }, [watchHistory]);

    // Get specific item from history
    const getLastWatched = useCallback((id) => {
        return watchHistory.find(item => item.id === id);
    }, [watchHistory]);

    // Check if item is in history
    const isInHistory = useCallback((id) => {
        return watchHistory.some(item => item.id === id);
    }, [watchHistory]);

    // Remove specific item from history
    const removeFromHistory = useCallback((id) => {
        setWatchHistory(prev => prev.filter(item => item.id !== id));
    }, []);

    // Clear all watch history
    const clearHistory = useCallback(() => {
        setWatchHistory([]);
    }, []);

    return {
        watchHistory,
        addToHistory,
        getWatchHistory,
        getLastWatched,
        isInHistory,
        removeFromHistory,
        clearHistory,
        historyCount: watchHistory.length,
    };
};

export default useWatchHistory;
