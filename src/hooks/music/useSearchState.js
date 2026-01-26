import { useState, useCallback, useMemo } from 'react';

/**
 * Search state options
 */
export const SEARCH_TABS = {
    TRACKS: 'tracks',
    ALBUMS: 'albums',
    ARTISTS: 'artists',
    PLAYLISTS: 'playlists'
};

/**
 * useSearchState - Hook for managing music search state
 * 
 * Ported from tidal-ui SearchInterface.svelte state logic
 * Provides:
 * - Search query and debounced query
 * - Active tab (tracks, albums, artists, playlists)
 * - Search results per tab
 * - Loading states
 * - Error handling
 */
const useSearchState = () => {
    // Query state
    const [query, setQuery] = useState('');
    const [debouncedQuery, setDebouncedQuery] = useState('');
    const [debounceTimeout, setDebounceTimeout] = useState(null);

    // Tab state
    const [activeTab, setActiveTab] = useState(SEARCH_TABS.TRACKS);

    // Results state
    const [results, setResults] = useState({
        [SEARCH_TABS.TRACKS]: { items: [], totalNumberOfItems: 0, loaded: false },
        [SEARCH_TABS.ALBUMS]: { items: [], totalNumberOfItems: 0, loaded: false },
        [SEARCH_TABS.ARTISTS]: { items: [], totalNumberOfItems: 0, loaded: false },
        [SEARCH_TABS.PLAYLISTS]: { items: [], totalNumberOfItems: 0, loaded: false }
    });

    // Loading state
    const [isSearching, setIsSearching] = useState(false);
    const [error, setError] = useState(null);

    /**
     * Update query with debounce
     */
    const updateQuery = useCallback((newQuery) => {
        setQuery(newQuery);
        setError(null);

        // Clear existing timeout
        if (debounceTimeout) {
            clearTimeout(debounceTimeout);
        }

        // Set new timeout
        const timeout = setTimeout(() => {
            setDebouncedQuery(newQuery.trim());
        }, 300);

        setDebounceTimeout(timeout);
    }, [debounceTimeout]);

    /**
     * Set results for a specific tab
     */
    const setTabResults = useCallback((tab, data) => {
        setResults(prev => ({
            ...prev,
            [tab]: {
                items: data.items ?? [],
                totalNumberOfItems: data.totalNumberOfItems ?? 0,
                loaded: true
            }
        }));
    }, []);

    /**
     * Clear all results
     */
    const clearResults = useCallback(() => {
        setResults({
            [SEARCH_TABS.TRACKS]: { items: [], totalNumberOfItems: 0, loaded: false },
            [SEARCH_TABS.ALBUMS]: { items: [], totalNumberOfItems: 0, loaded: false },
            [SEARCH_TABS.ARTISTS]: { items: [], totalNumberOfItems: 0, loaded: false },
            [SEARCH_TABS.PLAYLISTS]: { items: [], totalNumberOfItems: 0, loaded: false }
        });
    }, []);

    /**
     * Clear search
     */
    const clearSearch = useCallback(() => {
        setQuery('');
        setDebouncedQuery('');
        setError(null);
        clearResults();
    }, [clearResults]);

    /**
     * Get results for current tab
     */
    const currentResults = useMemo(() => {
        return results[activeTab] ?? { items: [], totalNumberOfItems: 0, loaded: false };
    }, [results, activeTab]);

    /**
     * Check if any results exist
     */
    const hasResults = useMemo(() => {
        return Object.values(results).some(r => r.items.length > 0);
    }, [results]);

    return {
        // Query
        query,
        debouncedQuery,
        updateQuery,

        // Tab
        activeTab,
        setActiveTab,

        // Results
        results,
        currentResults,
        setTabResults,
        clearResults,
        hasResults,

        // Loading/Error
        isSearching,
        setIsSearching,
        error,
        setError,

        // Clear
        clearSearch
    };
};

export default useSearchState;
