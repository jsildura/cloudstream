/**
 * TV Remote / D-pad Navigation Hook (Enhanced)
 * 
 * Features:
 * 1. Focus Sections   – data-nav-section groups elements into logical rows
 * 2. Focus Trapping   – data-nav-trap confines navigation inside modals/overlays
 * 3. Focus Memory     – remembers last-focused element per section
 * 4. Row-Aware Scroll – auto-scrolls horizontal rows to keep focused element visible
 * 5. Scoped Search    – limits element queries for performance
 */

import { useEffect, useCallback, useRef } from 'react';

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------
const FOCUSABLE_SELECTORS = [
    'a[href]:not([disabled])',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
    '[role="button"]:not([disabled])',
].join(', ');

// Scroll-container patterns for row-aware scrolling
const SCROLL_CONTAINER_SELECTORS = [
    '.overflow-x-auto',
    '[class*="carousel"]',
    '[class*="-row"]',
    '[class*="__row"]',
    '[class*="scroll"]',
    '[style*="overflow"]',
].join(', ');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Check if an element is visible and interactive */
const isVisible = (el) => {
    if (!el || !el.offsetParent && el.tagName !== 'BODY') return false;
    const style = window.getComputedStyle(el);
    return style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        parseFloat(style.opacity) > 0;
};

/** Get all focusable elements within a container (or document) */
const getFocusableElements = (container = document) => {
    return Array.from(container.querySelectorAll(FOCUSABLE_SELECTORS))
        .filter(isVisible);
};

/** Get element's bounding-box center */
const getCenter = (el) => {
    const rect = el.getBoundingClientRect();
    return {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
    };
};

/** Get the section container an element belongs to */
const getSection = (el) => el?.closest('[data-nav-section]');

/** Get ALL sections in the document in DOM order */
const getAllSections = () =>
    Array.from(document.querySelectorAll('[data-nav-section]'));

/** Find the active focus-trap container, if any */
const getTrapContainer = () =>
    document.querySelector('[data-nav-trap]');

/** Find the nearest scrollable parent of an element (horizontal) */
const findScrollParent = (el) => {
    let node = el?.parentElement;
    while (node && node !== document.body) {
        // Check for matching selectors first
        if (node.matches && node.matches(SCROLL_CONTAINER_SELECTORS)) return node;
        // Fallback: check computed overflow
        const style = window.getComputedStyle(node);
        if ((style.overflowX === 'auto' || style.overflowX === 'scroll') &&
            node.scrollWidth > node.clientWidth) {
            return node;
        }
        node = node.parentElement;
    }
    return null;
};

// ---------------------------------------------------------------------------
// Directional candidate search
// ---------------------------------------------------------------------------

/**
 * Find the best candidate element in a given direction.
 * 
 * @param {HTMLElement}   currentElement – currently focused element
 * @param {'up'|'down'|'left'|'right'} direction
 * @param {HTMLElement[]} candidates     – pool of focusable elements
 * @returns {HTMLElement|null}
 */
const findBestCandidate = (currentElement, direction, candidates) => {
    const currentCenter = getCenter(currentElement);
    const scored = [];

    for (const el of candidates) {
        if (el === currentElement) continue;

        const center = getCenter(el);
        const dx = center.x - currentCenter.x;
        const dy = center.y - currentCenter.y;

        let isValid = false;
        switch (direction) {
            case 'up':    isValid = dy < -10; break;
            case 'down':  isValid = dy > 10;  break;
            case 'left':  isValid = dx < -10; break;
            case 'right': isValid = dx > 10;  break;
        }
        if (!isValid) continue;

        // Weighted distance: primary axis has full weight, cross-axis penalised
        const distance = (direction === 'up' || direction === 'down')
            ? Math.abs(dy) + Math.abs(dx) * 0.3
            : Math.abs(dx) + Math.abs(dy) * 0.3;

        scored.push({ el, distance });
    }

    scored.sort((a, b) => a.distance - b.distance);
    return scored.length > 0 ? scored[0].el : null;
};

// ---------------------------------------------------------------------------
// Section-aware navigation
// ---------------------------------------------------------------------------

/**
 * For LEFT / RIGHT: search within the current section only.
 * For UP / DOWN: search across all sections (adjacent first).
 * Fall back to global search if nothing is found.
 */
const findNextElement = (currentElement, direction, trap) => {
    // 1. If there's a focus trap, confine search entirely
    if (trap) {
        const pool = getFocusableElements(trap);
        return findBestCandidate(currentElement, direction, pool);
    }

    const currentSection = getSection(currentElement);

    // 2. Horizontal movement → stay in current section
    if (direction === 'left' || direction === 'right') {
        if (currentSection) {
            const sectionPool = getFocusableElements(currentSection);
            const result = findBestCandidate(currentElement, direction, sectionPool);
            if (result) return result;
        }
        // Fallback: global search
        return findBestCandidate(currentElement, direction, getFocusableElements());
    }

    // 3. Vertical movement → jump between sections
    if (currentSection) {
        const allSections = getAllSections();
        const currentIdx = allSections.indexOf(currentSection);

        // Build ordered list of sections to check (nearest first)
        const sectionsToCheck = [];
        if (direction === 'down') {
            for (let i = currentIdx + 1; i < allSections.length; i++) sectionsToCheck.push(allSections[i]);
        } else {
            for (let i = currentIdx - 1; i >= 0; i--) sectionsToCheck.push(allSections[i]);
        }

        for (const section of sectionsToCheck) {
            const pool = getFocusableElements(section);
            if (pool.length > 0) {
                const result = findBestCandidate(currentElement, direction, pool);
                if (result) return result;
                // If directional search fails in this section, pick the nearest element anyway
                return pool[0];
            }
        }
    }

    // 4. No section info or no section candidate → global fallback
    return findBestCandidate(currentElement, direction, getFocusableElements());
};

// ---------------------------------------------------------------------------
// Row-aware smooth scrolling
// ---------------------------------------------------------------------------

const scrollRowIntoView = (element) => {
    const scrollParent = findScrollParent(element);
    if (!scrollParent) return;

    const parentRect = scrollParent.getBoundingClientRect();
    const elRect = element.getBoundingClientRect();

    // If element is near the right edge, scroll right
    if (elRect.right > parentRect.right - 40) {
        scrollParent.scrollBy({ left: elRect.right - parentRect.right + 80, behavior: 'smooth' });
    }
    // If element is near the left edge, scroll left
    else if (elRect.left < parentRect.left + 40) {
        scrollParent.scrollBy({ left: elRect.left - parentRect.left - 80, behavior: 'smooth' });
    }
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * @param {Object}  options
 * @param {boolean} options.enabled          – toggle navigation on/off (default: true)
 * @param {string}  options.resetOnPathChange – pass location.pathname to clear memory on route change
 */
const useTVNavigation = ({ enabled = true, resetOnPathChange } = {}) => {
    // Focus memory: Map<sectionId, Element>
    const focusMemory = useRef(new Map());

    // Clear memory when route changes
    useEffect(() => {
        focusMemory.current.clear();
    }, [resetOnPathChange]);

    // -----------------------------------------------------------------------
    // Remember which element was last focused in each section
    // -----------------------------------------------------------------------
    const rememberFocus = useCallback((element) => {
        const section = getSection(element);
        if (section) {
            const sectionId = section.getAttribute('data-nav-section');
            focusMemory.current.set(sectionId, element);
        }
    }, []);

    /** Try to recall the last focused element for a section */
    const recallFocus = useCallback((section) => {
        const sectionId = section.getAttribute('data-nav-section');
        const remembered = focusMemory.current.get(sectionId);
        // Check if the remembered element is still in the DOM and visible
        if (remembered && document.body.contains(remembered) && isVisible(remembered)) {
            return remembered;
        }
        focusMemory.current.delete(sectionId);
        return null;
    }, []);

    // -----------------------------------------------------------------------
    // Main keydown handler
    // -----------------------------------------------------------------------
    const handleKeyDown = useCallback((event) => {
        const activeElement = document.activeElement;
        const isTextInput = activeElement.tagName === 'INPUT' ||
            activeElement.tagName === 'TEXTAREA';

        const trap = getTrapContainer();

        // -- Escape: blur / exit trap
        if (event.key === 'Escape') {
            event.preventDefault();
            activeElement.blur();
            return;
        }

        // -- Space: activate (like Enter) if not in text input
        if (event.key === ' ' && !isTextInput) {
            event.preventDefault();
            activeElement.click();
            return;
        }

        // -- Home / End: jump to first / last focusable
        if (event.key === 'Home' && !isTextInput) {
            event.preventDefault();
            const pool = getFocusableElements(trap || document);
            if (pool.length > 0) {
                pool[0].focus({ preventScroll: false });
                pool[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
            return;
        }
        if (event.key === 'End' && !isTextInput) {
            event.preventDefault();
            const pool = getFocusableElements(trap || document);
            if (pool.length > 0) {
                const last = pool[pool.length - 1];
                last.focus({ preventScroll: false });
                last.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
            return;
        }

        // -- Direction keys
        const keyMap = {
            'ArrowUp': 'up',
            'ArrowDown': 'down',
            'ArrowLeft': 'left',
            'ArrowRight': 'right',
            'k': 'up',
            'j': 'down',
            'h': 'left',
            'l': 'right',
        };

        const direction = keyMap[event.key];
        if (!direction) return;

        // Skip vim keys in text inputs (allow normal typing)
        if (isTextInput) {
            if (!['ArrowUp', 'ArrowDown'].includes(event.key)) return;
        }

        // Skip if inside a carousel that handles its own left/right
        const inCarousel = activeElement.closest('[role="region"][aria-roledescription="carousel"]');
        if (inCarousel && (direction === 'left' || direction === 'right')) {
            const inTrack = activeElement.closest('[class*="carousel-track"]');
            if (inTrack) return;
        }

        // --- Section-aware navigation with focus memory ---
        const currentSection = getSection(activeElement);
        let nextElement = null;

        // For UP / DOWN with sections: try focus memory in target section first
        if (!trap && currentSection && (direction === 'up' || direction === 'down')) {
            const allSections = getAllSections();
            const currentIdx = allSections.indexOf(currentSection);
            const targetIdx = direction === 'down' ? currentIdx + 1 : currentIdx - 1;

            if (targetIdx >= 0 && targetIdx < allSections.length) {
                const targetSection = allSections[targetIdx];
                const remembered = recallFocus(targetSection);
                if (remembered) {
                    nextElement = remembered;
                }
            }
        }

        // If no remembered element, do standard directional search
        if (!nextElement) {
            nextElement = findNextElement(activeElement, direction, trap);
        }

        if (nextElement) {
            event.preventDefault();

            // Remember current focus before leaving
            rememberFocus(activeElement);

            nextElement.focus({ preventScroll: false });

            // Row-aware horizontal scrolling
            scrollRowIntoView(nextElement);

            // Vertical scroll: keep focused element in viewport
            nextElement.scrollIntoView({
                behavior: 'smooth',
                block: 'center',
                inline: 'nearest',
            });

            // Remember new focus
            rememberFocus(nextElement);
        }
    }, [rememberFocus, recallFocus]);

    // -----------------------------------------------------------------------
    // Attach / detach
    // -----------------------------------------------------------------------
    useEffect(() => {
        if (!enabled) return;
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [enabled, handleKeyDown]);

    // -----------------------------------------------------------------------
    // Public API
    // -----------------------------------------------------------------------
    const focusFirst = useCallback(() => {
        const trap = getTrapContainer();
        const pool = getFocusableElements(trap || document);
        if (pool.length > 0) pool[0].focus();
    }, []);

    return { focusFirst };
};

export default useTVNavigation;
