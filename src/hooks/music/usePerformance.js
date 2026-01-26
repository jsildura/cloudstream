import { useState, useEffect, useMemo } from 'react';

/**
 * Performance levels
 */
export const PERFORMANCE_LEVELS = {
    HIGH: 'high',
    MEDIUM: 'medium',
    LOW: 'low'
};

/**
 * usePerformance - Hook for managing performance mode and detecting device capabilities
 * 
 * Ported from tidal-ui/src/lib/stores/performance.ts
 * Provides:
 * - User-selected performance mode
 * - System capability detection
 * - Effective performance level (considering both)
 */
const usePerformance = (userPreference = PERFORMANCE_LEVELS.MEDIUM) => {
    const [systemLevel, setSystemLevel] = useState(PERFORMANCE_LEVELS.MEDIUM);

    // Detect system capabilities on mount
    useEffect(() => {
        const detectSystemCapabilities = () => {
            // Check for reduced motion preference
            const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            if (prefersReducedMotion) {
                setSystemLevel(PERFORMANCE_LEVELS.LOW);
                return;
            }

            // Check for hardware concurrency (CPU threads)
            const cores = navigator.hardwareConcurrency ?? 4;
            if (cores <= 2) {
                setSystemLevel(PERFORMANCE_LEVELS.LOW);
                return;
            }

            // Check for device memory (if available)
            const memory = navigator.deviceMemory;
            if (memory && memory < 4) {
                setSystemLevel(PERFORMANCE_LEVELS.MEDIUM);
                return;
            }

            // Check screen size (mobile devices)
            const isMobile = window.innerWidth < 768;
            if (isMobile) {
                setSystemLevel(PERFORMANCE_LEVELS.MEDIUM);
                return;
            }

            // Default to high for capable devices
            setSystemLevel(PERFORMANCE_LEVELS.HIGH);
        };

        detectSystemCapabilities();

        // Listen for motion preference changes
        const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
        const handleChange = (e) => {
            if (e.matches) {
                setSystemLevel(PERFORMANCE_LEVELS.LOW);
            } else {
                detectSystemCapabilities();
            }
        };

        mediaQuery.addEventListener('change', handleChange);
        return () => mediaQuery.removeEventListener('change', handleChange);
    }, []);

    /**
     * Effective performance level
     * Returns the lower of user preference and system capability
     */
    const effectiveLevel = useMemo(() => {
        const levels = [PERFORMANCE_LEVELS.HIGH, PERFORMANCE_LEVELS.MEDIUM, PERFORMANCE_LEVELS.LOW];
        const userIndex = levels.indexOf(userPreference);
        const systemIndex = levels.indexOf(systemLevel);

        // Use the higher index (lower performance)
        const effectiveIndex = Math.max(userIndex, systemIndex);
        return levels[effectiveIndex];
    }, [userPreference, systemLevel]);

    /**
     * Performance flags for UI decisions
     */
    const flags = useMemo(() => ({
        // Enable WebGL background effects
        enableWebGLBackground: effectiveLevel === PERFORMANCE_LEVELS.HIGH,

        // Enable smooth animations
        enableAnimations: effectiveLevel !== PERFORMANCE_LEVELS.LOW,

        // Enable blur effects
        enableBlur: effectiveLevel === PERFORMANCE_LEVELS.HIGH,

        // Enable gradient animations
        enableGradientAnimations: effectiveLevel !== PERFORMANCE_LEVELS.LOW,

        // Enable particle effects
        enableParticles: effectiveLevel === PERFORMANCE_LEVELS.HIGH,

        // Enable hover effects
        enableHoverEffects: effectiveLevel !== PERFORMANCE_LEVELS.LOW,

        // Reduce animation duration
        reducedMotion: effectiveLevel === PERFORMANCE_LEVELS.LOW
    }), [effectiveLevel]);

    /**
     * CSS class for performance level
     */
    const performanceClass = `performance-${effectiveLevel}`;

    return {
        // Levels
        systemLevel,
        userPreference,
        effectiveLevel,

        // Flags
        flags,

        // CSS
        performanceClass,

        // Constants
        PERFORMANCE_LEVELS
    };
};

export default usePerformance;
