import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

/**
 * Audio quality options
 */
export const AUDIO_QUALITIES = {
    HI_RES_LOSSLESS: 'HI_RES_LOSSLESS',
    LOSSLESS: 'LOSSLESS',
    HIGH: 'HIGH',
    LOW: 'LOW'
};

/**
 * Download mode options
 */
export const DOWNLOAD_MODES = {
    INDIVIDUAL: 'individual',
    ZIP: 'zip',
    CSV: 'csv'
};

/**
 * Performance mode options
 */
export const PERFORMANCE_MODES = {
    HIGH: 'high',
    MEDIUM: 'medium',
    LOW: 'low'
};

/**
 * Region options
 */
export const REGIONS = {
    AUTO: 'auto',
    US: 'us',
    EU: 'eu'
};

const STORAGE_KEY = 'music_preferences';

/**
 * Default preferences
 */
const defaultPreferences = {
    playbackQuality: AUDIO_QUALITIES.HIGH,
    convertAacToMp3: false,
    downloadCoversSeperately: false,
    performanceMode: PERFORMANCE_MODES.MEDIUM,
    region: REGIONS.AUTO,
    downloadMode: DOWNLOAD_MODES.INDIVIDUAL
};

/**
 * Load preferences from localStorage
 */
const loadPreferences = () => {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            const parsed = JSON.parse(stored);
            return { ...defaultPreferences, ...parsed };
        }
    } catch (error) {
        console.error('Failed to load music preferences:', error);
    }
    return defaultPreferences;
};

/**
 * Save preferences to localStorage
 */
const savePreferences = (preferences) => {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
    } catch (error) {
        console.error('Failed to save music preferences:', error);
    }
};

/**
 * MusicPreferencesContext
 */
const MusicPreferencesContext = createContext(null);

/**
 * MusicPreferencesProvider - Provides user preferences state with localStorage persistence
 * 
 * Ported from tidal-ui stores:
 * - userPreferences.ts (playback quality, AAC conversion, cover download, performance mode)
 * - downloadPreferences.ts (download mode)
 * - region.ts (region selection)
 */
export const MusicPreferencesProvider = ({ children }) => {
    const [preferences, setPreferences] = useState(() => loadPreferences());

    // Save to localStorage whenever preferences change
    useEffect(() => {
        savePreferences(preferences);
    }, [preferences]);

    // Quality actions
    const setPlaybackQuality = useCallback((quality) => {
        setPreferences(prev => ({ ...prev, playbackQuality: quality }));
    }, []);

    // Conversion toggles
    const toggleConvertAacToMp3 = useCallback(() => {
        setPreferences(prev => ({ ...prev, convertAacToMp3: !prev.convertAacToMp3 }));
    }, []);

    const toggleDownloadCoversSeperately = useCallback(() => {
        setPreferences(prev => ({ ...prev, downloadCoversSeperately: !prev.downloadCoversSeperately }));
    }, []);

    // Performance mode
    const setPerformanceMode = useCallback((mode) => {
        setPreferences(prev => ({ ...prev, performanceMode: mode }));
    }, []);

    // Region
    const setRegion = useCallback((region) => {
        setPreferences(prev => ({ ...prev, region }));
    }, []);

    // Download mode
    const setDownloadMode = useCallback((mode) => {
        setPreferences(prev => ({ ...prev, downloadMode: mode }));
    }, []);

    // Reset to defaults
    const resetPreferences = useCallback(() => {
        setPreferences(defaultPreferences);
    }, []);

    const value = React.useMemo(() => ({
        // State
        ...preferences,

        // Quality actions
        setPlaybackQuality,

        // Conversion toggles
        toggleConvertAacToMp3,
        toggleDownloadCoversSeperately,

        // Performance
        setPerformanceMode,

        // Region
        setRegion,

        // Download mode
        setDownloadMode,

        // Reset
        resetPreferences
    }), [
        preferences,
        setPlaybackQuality,
        toggleConvertAacToMp3,
        toggleDownloadCoversSeperately,
        setPerformanceMode,
        setRegion,
        setDownloadMode,
        resetPreferences
    ]);

    return (
        <MusicPreferencesContext.Provider value={value}>
            {children}
        </MusicPreferencesContext.Provider>
    );
};

/**
 * Hook to access music preferences
 */
export const useMusicPreferences = () => {
    const context = useContext(MusicPreferencesContext);
    if (!context) {
        throw new Error('useMusicPreferences must be used within a MusicPreferencesProvider');
    }
    return context;
};

export default MusicPreferencesContext;
