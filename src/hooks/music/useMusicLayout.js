import { useState, useEffect, useCallback } from 'react';

/**
 * useMusicLayout - Hook for managing music app layout dimensions
 * 
 * Ported from tidal-ui +layout.svelte (lines 35-71)
 * Provides:
 * - Viewport dimensions
 * - Header/player heights
 * - Computed layout values
 */
const useMusicLayout = () => {
    const [viewportHeight, setViewportHeight] = useState(
        typeof window !== 'undefined' ? window.innerHeight : 0
    );
    const [headerHeight, setHeaderHeight] = useState(0);
    const [playerHeight, setPlayerHeight] = useState(0);

    // Main navbar height (fixed)
    const NAVBAR_HEIGHT = 68;

    // Update viewport height on resize
    useEffect(() => {
        const updateViewportHeight = () => {
            setViewportHeight(window.innerHeight);
        };

        window.addEventListener('resize', updateViewportHeight);
        return () => window.removeEventListener('resize', updateViewportHeight);
    }, []);

    // Computed layout values
    const mainMinHeight = Math.max(0, viewportHeight - NAVBAR_HEIGHT - headerHeight - playerHeight);
    const contentPaddingBottom = Math.max(playerHeight, 24);
    const mainMarginBottom = Math.max(playerHeight, 128);
    const settingsMenuOffset = Math.max(0, NAVBAR_HEIGHT + headerHeight + 12);

    // Callbacks for components to report their heights
    const onHeaderHeightChange = useCallback((height) => {
        setHeaderHeight(height);
    }, []);

    const onPlayerHeightChange = useCallback((height) => {
        setPlayerHeight(height);
    }, []);

    return {
        // Dimensions
        viewportHeight,
        headerHeight,
        playerHeight,
        NAVBAR_HEIGHT,

        // Computed values
        mainMinHeight,
        contentPaddingBottom,
        mainMarginBottom,
        settingsMenuOffset,

        // Callbacks
        onHeaderHeightChange,
        onPlayerHeightChange
    };
};

export default useMusicLayout;
