/**
 * usePopularTracking - Track and fetch popular content across all users
 * Uses Firebase Realtime Database to store aggregate watch counts
 * Automatically cleans up data older than 8 weeks (runs once per 3 days globally)
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { initFirebase } from '../lib/firebase';

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000; // 3 days in milliseconds

/**
 * Get the current week key for data partitioning
 * Format: YYYY-WW (year-week number, ISO 8601 style)
 */
const getWeekKey = (date = new Date()) => {
    const d = new Date(date);
    // Set to nearest Thursday (ISO week date)
    d.setDate(d.getDate() + 4 - (d.getDay() || 7));
    const yearStart = new Date(d.getFullYear(), 0, 1);
    const weekNumber = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
    return `${d.getFullYear()}-W${weekNumber.toString().padStart(2, '0')}`;
};

/**
 * Parse a week key (YYYY-WNN) back to a Date object (first day of that week)
 * @param {string} weekKey - Format: YYYY-WNN (e.g., "2026-W04")
 * @returns {Date} - First day (Monday) of that ISO week
 */
const parseWeekKey = (weekKey) => {
    const match = weekKey.match(/^(\d{4})-W(\d{2})$/);
    if (!match) return null;

    const year = parseInt(match[1], 10);
    const week = parseInt(match[2], 10);

    // Find the first Thursday of the year (ISO week 1 contains first Thursday)
    const jan4 = new Date(year, 0, 4);
    const dayOfWeek = jan4.getDay() || 7; // Sunday = 7
    const firstMonday = new Date(jan4);
    firstMonday.setDate(jan4.getDate() - dayOfWeek + 1);

    // Add weeks
    const targetDate = new Date(firstMonday);
    targetDate.setDate(firstMonday.getDate() + (week - 1) * 7);

    return targetDate;
};

/**
 * Check if a week key is older than N weeks from now
 * @param {string} weekKey - Format: YYYY-WNN
 * @param {number} weeksAgo - Number of weeks threshold
 * @returns {boolean} - True if older than weeksAgo
 */
const isOlderThanWeeks = (weekKey, weeksAgo) => {
    const weekDate = parseWeekKey(weekKey);
    if (!weekDate) return false;

    const now = new Date();
    const thresholdDate = new Date(now);
    thresholdDate.setDate(now.getDate() - (weeksAgo * 7));

    return weekDate < thresholdDate;
};

const usePopularTracking = () => {
    const [popularContent, setPopularContent] = useState([]);
    const [loading, setLoading] = useState(true);
    const [dbRef, setDbRef] = useState(null);
    const cleanupAttemptedRef = useRef(false);

    // Initialize Firebase connection
    useEffect(() => {
        const firebase = initFirebase();
        if (firebase?.db) {
            setDbRef(firebase.db);
        }
    }, []);

    /**
     * Cleanup old week data (older than 8 weeks)
     * Runs once per 3 days globally (not per user)
     * Uses Firebase timestamp to coordinate across all users
     */
    const cleanupOldData = useCallback(async () => {
        if (!dbRef || cleanupAttemptedRef.current) return;
        cleanupAttemptedRef.current = true;

        const WEEKS_TO_KEEP = 8;

        try {
            // Check last cleanup timestamp
            const lastCleanupSnapshot = await dbRef.ref('popular_this_week/_last_cleanup').once('value');
            const lastCleanupTime = lastCleanupSnapshot.val() || 0;
            const now = Date.now();

            // Skip if cleanup ran within last 3 days
            if (now - lastCleanupTime < THREE_DAYS_MS) {
                console.log('🧹 Cleanup skipped (last ran ' + Math.round((now - lastCleanupTime) / (1000 * 60 * 60)) + ' hours ago)');
                return;
            }

            // Get all week keys
            const snapshot = await dbRef.ref('popular_this_week').once('value');
            if (!snapshot.exists()) return;

            const data = snapshot.val();
            const weekKeys = Object.keys(data).filter(key => key !== '_last_cleanup');
            const keysToDelete = weekKeys.filter(key => isOlderThanWeeks(key, WEEKS_TO_KEEP));

            // Update last cleanup timestamp (even if nothing to delete)
            const updates = {
                'popular_this_week/_last_cleanup': now
            };

            // Add deletions
            keysToDelete.forEach(key => {
                updates[`popular_this_week/${key}`] = null;
            });

            await dbRef.ref().update(updates);

            if (keysToDelete.length > 0) {
                console.log(`🧹 Cleaned up ${keysToDelete.length} old week(s): ${keysToDelete.join(', ')}`);
            } else {
                console.log('🧹 Cleanup complete (no old data to remove)');
            }
        } catch (error) {
            console.error('Failed to cleanup old data:', error);
        }
    }, [dbRef]);

    /**
     * Track a watch event - increments global counter for this content
     * @param {number} contentId - TMDB content ID
     * @param {string} type - 'movie' or 'tv'
     * @param {object} metadata - { title, poster_path }
     */
    const trackWatch = useCallback(async (contentId, type, metadata) => {
        if (!dbRef || !contentId) return;

        const weekKey = getWeekKey();
        const contentKey = `${type}_${contentId}`;
        const path = `popular_this_week/${weekKey}/${contentKey}`;

        try {
            const ref = dbRef.ref(path);

            // Use transaction to safely increment counter
            await ref.transaction((current) => {
                if (current === null) {
                    // First watch for this content this week
                    return {
                        id: contentId,
                        type,
                        title: metadata?.title || '',
                        poster_path: metadata?.poster_path || '',
                        count: 1,
                        lastUpdated: Date.now()
                    };
                } else {
                    // Increment existing counter
                    return {
                        ...current,
                        count: (current.count || 0) + 1,
                        lastUpdated: Date.now()
                    };
                }
            });

            console.log(`📊 Tracked watch: ${metadata?.title || contentId}`);
        } catch (error) {
            console.error('Failed to track watch:', error);
        }
    }, [dbRef]);

    /**
     * Fetch top 10 popular content for this week
     */
    const fetchPopularThisWeek = useCallback(async () => {
        if (!dbRef) return [];

        const weekKey = getWeekKey();
        const path = `popular_this_week/${weekKey}`;

        try {
            setLoading(true);
            const snapshot = await dbRef.ref(path)
                .orderByChild('count')
                .limitToLast(10)
                .once('value');

            if (!snapshot.exists()) {
                setPopularContent([]);
                return [];
            }

            // Convert to array and sort by count (descending)
            const items = [];
            snapshot.forEach((child) => {
                items.push({ key: child.key, ...child.val() });
            });

            // Sort descending by count
            items.sort((a, b) => (b.count || 0) - (a.count || 0));

            setPopularContent(items);
            return items;
        } catch (error) {
            console.error('Failed to fetch popular content:', error);
            return [];
        } finally {
            setLoading(false);
        }
    }, [dbRef]);

    // Run cleanup and fetch popular content when db is ready
    useEffect(() => {
        if (dbRef) {
            cleanupOldData();
            fetchPopularThisWeek();
        }
    }, [dbRef, cleanupOldData, fetchPopularThisWeek]);

    return {
        popularContent,
        loading,
        trackWatch,
        refreshPopular: fetchPopularThisWeek
    };
};

export default usePopularTracking;
