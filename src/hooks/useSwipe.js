import { useRef, useCallback } from 'react';

/**
 * Custom hook for handling touch swipe gestures
 * @param {Object} options - Configuration options
 * @param {Function} options.onSwipe - Callback with direction (positive=left/next, negative=right/prev)
 * @param {Function} options.onSwipeLeft - Legacy callback for left swipe
 * @param {Function} options.onSwipeRight - Legacy callback for right swipe
 * @param {number} options.threshold - Minimum swipe distance in pixels (default: 50)
 * @param {number} options.itemsPerSwipe - Fixed number of items to move per swipe (default: 6)
 * @returns {Object} - Touch event handlers to spread on the element
 */
const useSwipe = ({
    onSwipe,
    onSwipeLeft,
    onSwipeRight,
    threshold = 50,
    itemsPerSwipe = 6
}) => {
    const touchStartX = useRef(0);
    const touchEndX = useRef(0);

    const handleTouchStart = useCallback((e) => {
        touchStartX.current = e.touches[0].clientX;
        touchEndX.current = e.touches[0].clientX;
    }, []);

    const handleTouchMove = useCallback((e) => {
        touchEndX.current = e.touches[0].clientX;
    }, []);

    const handleTouchEnd = useCallback(() => {
        const swipeDistance = touchStartX.current - touchEndX.current;
        const absDistance = Math.abs(swipeDistance);

        if (absDistance > threshold) {
            if (onSwipe) {
                // Pass the fixed number of items to move (positive for next, negative for prev)
                onSwipe(swipeDistance > 0 ? itemsPerSwipe : -itemsPerSwipe);
            } else {
                // Legacy API: call left/right callbacks
                if (swipeDistance > 0) {
                    onSwipeLeft?.();
                } else {
                    onSwipeRight?.();
                }
            }
        }

        // Reset values
        touchStartX.current = 0;
        touchEndX.current = 0;
    }, [onSwipe, onSwipeLeft, onSwipeRight, threshold, itemsPerSwipe]);

    return {
        onTouchStart: handleTouchStart,
        onTouchMove: handleTouchMove,
        onTouchEnd: handleTouchEnd,
    };
};

export default useSwipe;
