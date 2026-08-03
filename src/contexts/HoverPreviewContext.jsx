/**
 * HoverPreviewContext - drives the shared "Interactive Preview Card"
 *
 * Any card row (Popular on Streamflix, Trending, Top 10, Studios, Providers)
 * registers hover intent here; the preview itself is rendered once, in a
 * portal, so it can grow outside the carousels' `overflow-x: auto` clipping.
 */
import React, { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react';
import HoverPreviewCard from '../components/HoverPreviewCard';

const HoverPreviewContext = createContext(null);

// Netflix-ish timings: long enough that scrubbing across a row stays quiet.
const OPEN_DELAY = 100;
const CLOSE_DELAY = 180;
// Duration must match the CSS @keyframes hoverPreviewOut duration.
const EXIT_ANIMATION_MS = 100;

export const resolvePreviewType = (item) =>
    item?.type || item?.media_type || (item?.first_air_date || item?.name ? 'tv' : 'movie');

export const HoverPreviewProvider = ({ children }) => {
    const [preview, setPreview] = useState(null);
    const [isClosing, setIsClosing] = useState(false);

    const openTimer = useRef(null);
    const closeTimer = useRef(null);
    const canHover = useRef(false);
    const exitTimer = useRef(null);

    const clearTimers = useCallback(() => {
        if (openTimer.current) { clearTimeout(openTimer.current); openTimer.current = null; }
        if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; }
        if (exitTimer.current) { clearTimeout(exitTimer.current); exitTimer.current = null; }
    }, []);

    useEffect(() => clearTimers, [clearTimers]);

    // Trigger exit animation then fully remove the card.
    const dismissWithAnimation = useCallback(() => {
        if (exitTimer.current) return; // already exiting
        setIsClosing(true);
        exitTimer.current = setTimeout(() => {
            exitTimer.current = null;
            setIsClosing(false);
            setPreview(null);
        }, EXIT_ANIMATION_MS);
    }, []);

    const closeNow = useCallback(() => {
        clearTimers();
        setIsClosing(false);
        setPreview(null);
    }, [clearTimers]);

    // Pointer-capability gate: never run this on touch or TV, where there is
    // no hover state to leave and the preview would trap the user.
    useEffect(() => {
        if (typeof window.matchMedia !== 'function') return;
        const mq = window.matchMedia('(hover: hover) and (pointer: fine)');
        canHover.current = mq.matches;
        const onChange = (e) => {
            canHover.current = e.matches;
            if (!e.matches) { closeNow(); }
        };
        mq.addEventListener?.('change', onChange);
        return () => mq.removeEventListener?.('change', onChange);
    }, [closeNow]);
    // Any scroll invalidates the measured anchor rect, so dismiss instead of
    // letting the preview drift away from its card.
    useEffect(() => {
        if (!preview) return;
        window.addEventListener('scroll', closeNow, { passive: true, capture: true });
        window.addEventListener('resize', closeNow);
        return () => {
            window.removeEventListener('scroll', closeNow, { capture: true });
            window.removeEventListener('resize', closeNow);
        };
    }, [preview, closeNow]);

    const openPreview = useCallback((element, item, type, onMoreInfo) => {
        if (!canHover.current || !element || !item?.id) return;
        clearTimers();
        setIsClosing(false); // cancel any outgoing exit animation
        openTimer.current = setTimeout(() => {
            openTimer.current = null;
            const r = element.getBoundingClientRect();
            setPreview({
                item,
                type: type || resolvePreviewType(item),
                onMoreInfo,
                rect: { top: r.top, left: r.left, width: r.width, height: r.height },
            });
        }, OPEN_DELAY);
    }, [clearTimers]);

    const closePreview = useCallback(() => {
        if (openTimer.current) { clearTimeout(openTimer.current); openTimer.current = null; }
        if (closeTimer.current) clearTimeout(closeTimer.current);
        closeTimer.current = setTimeout(() => {
            closeTimer.current = null;
            dismissWithAnimation();
        }, CLOSE_DELAY);
    }, [dismissWithAnimation]);

    // Pointer moved from the card onto the preview itself - cancel the close.
    const keepPreview = useCallback(() => {
        if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; }
    }, []);

    /**
     * Spread onto a card element.
     *
     * `isBlocked` lets a row suppress the preview while its carousel is
     * mid-drag. `onMoreInfo` is the row's *own* card-click handler - the
     * preview's "More info" button calls it verbatim, so the modal it opens is
     * literally the same `div.modal-content-new` (same enrichment, same owner)
     * a plain card click produces. No second modal, no second code path.
     */
    const getPreviewProps = useCallback((item, type, isBlocked = false, onMoreInfo) => ({
        onMouseEnter: (e) => { if (!isBlocked) openPreview(e.currentTarget, item, type, onMoreInfo); },
        onMouseLeave: closePreview,
    }), [openPreview, closePreview]);

    const value = {
        openPreview,
        closePreview,
        keepPreview,
        closeNow,
        getPreviewProps,
    };

    return (
        <HoverPreviewContext.Provider value={value}>
            {children}
            {preview && (
                <HoverPreviewCard
                    key={`${preview.type}-${preview.item.id}`}
                    item={preview.item}
                    type={preview.type}
                    rect={preview.rect}
                    onMoreInfo={preview.onMoreInfo}
                    isClosing={isClosing}
                />
            )}
        </HoverPreviewContext.Provider>
    );
};

/**
 * Safe to call outside the provider - returns inert no-ops so a row can be
 * rendered standalone (tests, isolated pages) without crashing.
 */
export const useHoverPreview = () => {
    const ctx = useContext(HoverPreviewContext);
    if (ctx) return ctx;
    const noop = () => { };
    return {
        openPreview: noop,
        closePreview: noop,
        keepPreview: noop,
        closeNow: noop,
        getPreviewProps: () => ({}),
    };
};

export default HoverPreviewContext;
