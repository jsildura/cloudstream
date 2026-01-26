import { useState, useCallback } from 'react';

/**
 * useLyrics - Hook for managing lyrics display state
 * 
 * Ported from tidal-ui lyrics popup logic
 * Provides:
 * - Lyrics data and loading state
 * - Popup visibility toggle
 * - Current line tracking for synced lyrics
 */
const useLyrics = () => {
    const [lyrics, setLyrics] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const [isPopupOpen, setIsPopupOpen] = useState(false);
    const [currentLineIndex, setCurrentLineIndex] = useState(-1);
    const [trackId, setTrackId] = useState(null);

    /**
     * Load lyrics for a track
     */
    const loadLyrics = useCallback(async (id, fetchFn) => {
        if (id === trackId && lyrics) {
            // Already loaded
            return;
        }

        setTrackId(id);
        setIsLoading(true);
        setError(null);
        setCurrentLineIndex(-1);

        try {
            const data = await fetchFn(id);
            setLyrics(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load lyrics');
            setLyrics(null);
        } finally {
            setIsLoading(false);
        }
    }, [trackId, lyrics]);

    /**
     * Clear lyrics data
     */
    const clearLyrics = useCallback(() => {
        setLyrics(null);
        setTrackId(null);
        setCurrentLineIndex(-1);
        setError(null);
    }, []);

    /**
     * Toggle popup visibility
     */
    const togglePopup = useCallback(() => {
        setIsPopupOpen(prev => !prev);
    }, []);

    /**
     * Open popup
     */
    const openPopup = useCallback(() => {
        setIsPopupOpen(true);
    }, []);

    /**
     * Close popup
     */
    const closePopup = useCallback(() => {
        setIsPopupOpen(false);
    }, []);

    /**
     * Update current line based on playback time
     */
    const updateCurrentLine = useCallback((currentTime) => {
        if (!lyrics?.subtitles || lyrics.subtitles.length === 0) {
            setCurrentLineIndex(-1);
            return;
        }

        const currentMs = currentTime * 1000;
        let newIndex = -1;

        for (let i = 0; i < lyrics.subtitles.length; i++) {
            const line = lyrics.subtitles[i];
            const startTime = line.startTimeMs ?? line.time ?? 0;
            if (currentMs >= startTime) {
                newIndex = i;
            } else {
                break;
            }
        }

        setCurrentLineIndex(newIndex);
    }, [lyrics]);

    /**
     * Check if lyrics are synced (have timing info)
     */
    const isSynced = lyrics?.subtitles?.some(
        line => line.startTimeMs !== undefined || line.time !== undefined
    ) ?? false;

    /**
     * Get lyrics text lines
     */
    const lines = lyrics?.subtitles ?? [];

    /**
     * Check if lyrics available
     */
    const hasLyrics = lyrics && lines.length > 0;

    return {
        // State
        lyrics,
        lines,
        isLoading,
        error,
        hasLyrics,
        isSynced,
        currentLineIndex,
        trackId,

        // Popup
        isPopupOpen,
        togglePopup,
        openPopup,
        closePopup,

        // Actions
        loadLyrics,
        clearLyrics,
        updateCurrentLine
    };
};

export default useLyrics;
