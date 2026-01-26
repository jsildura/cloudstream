import React, { createContext, useContext, useState, useCallback } from 'react';
import {
    Music,
    Disc3,
    User,
    ListMusic
} from 'lucide-react';

const MusicSearchContext = createContext(null);

export const SEARCH_TABS = {
    TRACKS: 'tracks',
    ALBUMS: 'albums',
    ARTISTS: 'artists',
    PLAYLISTS: 'playlists'
};

export const TAB_CONFIG = [
    { id: SEARCH_TABS.TRACKS, label: 'Tracks', icon: Music },
    { id: SEARCH_TABS.ALBUMS, label: 'Albums', icon: Disc3 },
    { id: SEARCH_TABS.ARTISTS, label: 'Artists', icon: User },
    { id: SEARCH_TABS.PLAYLISTS, label: 'Playlists', icon: ListMusic }
];

export const MusicSearchProvider = ({ children }) => {
    const [query, setQuery] = useState('');
    const [activeTab, setActiveTab] = useState(SEARCH_TABS.TRACKS);
    const [isSearching, setIsSearching] = useState(false);
    const [error, setError] = useState(null);
    const [results, setResults] = useState({
        [SEARCH_TABS.TRACKS]: { items: [], totalNumberOfItems: 0 },
        [SEARCH_TABS.ALBUMS]: { items: [], totalNumberOfItems: 0 },
        [SEARCH_TABS.ARTISTS]: { items: [], totalNumberOfItems: 0 },
        [SEARCH_TABS.PLAYLISTS]: { items: [], totalNumberOfItems: 0 }
    });

    const clearSearch = useCallback(() => {
        setQuery('');
        setError(null);
        setResults({
            [SEARCH_TABS.TRACKS]: { items: [], totalNumberOfItems: 0 },
            [SEARCH_TABS.ALBUMS]: { items: [], totalNumberOfItems: 0 },
            [SEARCH_TABS.ARTISTS]: { items: [], totalNumberOfItems: 0 },
            [SEARCH_TABS.PLAYLISTS]: { items: [], totalNumberOfItems: 0 }
        });
        setIsSearching(false);
    }, []);

    const value = {
        query,
        setQuery,
        activeTab,
        setActiveTab,
        results,
        setResults,
        isSearching,
        setIsSearching,
        error,
        setError,
        clearSearch
    };

    return (
        <MusicSearchContext.Provider value={value}>
            {children}
        </MusicSearchContext.Provider>
    );
};

export const useMusicSearch = () => {
    const context = useContext(MusicSearchContext);
    if (!context) {
        throw new Error('useMusicSearch must be used within a MusicSearchProvider');
    }
    return context;
};
