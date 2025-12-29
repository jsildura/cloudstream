/**
 * TV Remote / D-pad Navigation Hook
 * Enables arrow key navigation for TV remotes and keyboard users
 * Works with existing tabindex elements without affecting mouse/touch UI
 */

import { useEffect, useCallback } from 'react';

// Selectors for focusable elements
const FOCUSABLE_SELECTORS = [
    'a[href]:not([disabled])',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
    '[role="button"]:not([disabled])',
].join(', ');

/**
 * Get all focusable elements in document order
 */
const getFocusableElements = () => {
    return Array.from(document.querySelectorAll(FOCUSABLE_SELECTORS))
        .filter(el => {
            // Check if element is visible
            const style = window.getComputedStyle(el);
            return style.display !== 'none' &&
                style.visibility !== 'hidden' &&
                style.opacity !== '0' &&
                el.offsetParent !== null;
        });
};

/**
 * Get element's center position
 */
const getElementCenter = (el) => {
    const rect = el.getBoundingClientRect();
    return {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
    };
};

/**
 * Find the best candidate element in a direction
 */
const findNextElement = (currentElement, direction) => {
    const focusable = getFocusableElements();
    const currentIndex = focusable.indexOf(currentElement);
    const currentCenter = getElementCenter(currentElement);

    let candidates = [];

    focusable.forEach((el, index) => {
        if (el === currentElement) return;

        const center = getElementCenter(el);
        const dx = center.x - currentCenter.x;
        const dy = center.y - currentCenter.y;

        let isValidDirection = false;

        switch (direction) {
            case 'up':
                isValidDirection = dy < -10; // Element is above
                break;
            case 'down':
                isValidDirection = dy > 10; // Element is below
                break;
            case 'left':
                isValidDirection = dx < -10; // Element is to the left
                break;
            case 'right':
                isValidDirection = dx > 10; // Element is to the right
                break;
        }

        if (isValidDirection) {
            // Calculate distance with preference for elements in the main direction
            let distance;
            if (direction === 'up' || direction === 'down') {
                // For vertical movement, prioritize elements directly above/below
                distance = Math.abs(dy) + Math.abs(dx) * 0.3;
            } else {
                // For horizontal movement, prioritize elements directly left/right
                distance = Math.abs(dx) + Math.abs(dy) * 0.3;
            }

            candidates.push({ el, distance, index });
        }
    });

    // Sort by distance and return the closest element
    candidates.sort((a, b) => a.distance - b.distance);

    return candidates.length > 0 ? candidates[0].el : null;
};

/**
 * Custom hook for TV/D-pad navigation
 * @param {boolean} enabled - Whether to enable the navigation (default: true)
 */
const useTVNavigation = (enabled = true) => {
    const handleKeyDown = useCallback((event) => {
        const activeElement = document.activeElement;
        const isTextInput = activeElement.tagName === 'INPUT' ||
            activeElement.tagName === 'TEXTAREA';

        // Handle Escape key - blur current element / close modals
        if (event.key === 'Escape') {
            event.preventDefault();
            activeElement.blur();
            return;
        }

        // Handle Spacebar - activate focused element (like Enter)
        if (event.key === ' ' && !isTextInput) {
            event.preventDefault();
            activeElement.click();
            return;
        }

        // Handle Home/End keys for first/last element nav
        if (event.key === 'Home' && !isTextInput) {
            event.preventDefault();
            const focusable = getFocusableElements();
            if (focusable.length > 0) {
                focusable[0].focus({ preventScroll: false });
                focusable[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
            return;
        }
        if (event.key === 'End' && !isTextInput) {
            event.preventDefault();
            const focusable = getFocusableElements();
            if (focusable.length > 0) {
                focusable[focusable.length - 1].focus({ preventScroll: false });
                focusable[focusable.length - 1].scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
            return;
        }

        // Map arrow keys and vim-style keys to directions
        const keyMap = {
            'ArrowUp': 'up',
            'ArrowDown': 'down',
            'ArrowLeft': 'left',
            'ArrowRight': 'right',
            'k': 'up',      // vim up
            'j': 'down',    // vim down
            'h': 'left',    // vim left
            'l': 'right'    // vim right
        };

        const direction = keyMap[event.key];
        if (!direction) return;

        // Skip vim keys if in text input (allow normal typing)
        if (isTextInput) {
            // Only allow arrow key navigation for up/down in text inputs
            if (!['ArrowUp', 'ArrowDown'].includes(event.key)) {
                return;
            }
        }

        // Skip if inside a carousel that handles its own navigation
        const inCarousel = activeElement.closest('[role="region"][aria-roledescription="carousel"]');
        if (inCarousel && (direction === 'left' || direction === 'right')) {
            const inCarouselTrack = activeElement.closest('[class*="carousel-track"]');
            if (inCarouselTrack) {
                return;
            }
        }

        // Find next element in direction
        const nextElement = findNextElement(activeElement, direction);

        if (nextElement) {
            event.preventDefault();
            nextElement.focus({ preventScroll: false });

            // Ensure element is visible in viewport
            nextElement.scrollIntoView({
                behavior: 'smooth',
                block: 'center',
                inline: 'center',
            });
        }
    }, []);

    useEffect(() => {
        if (!enabled) return;

        // Add keyboard listener
        document.addEventListener('keydown', handleKeyDown);

        // Cleanup
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [enabled, handleKeyDown]);

    // Return a function to manually focus the first focusable element
    const focusFirst = useCallback(() => {
        const focusable = getFocusableElements();
        if (focusable.length > 0) {
            focusable[0].focus();
        }
    }, []);

    return { focusFirst };
};

export default useTVNavigation;
