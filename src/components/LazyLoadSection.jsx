/**
 * LazyLoadSection - Defers rendering of children until they are near the viewport.
 * Uses IntersectionObserver to trigger loading when the placeholder is within rootMargin.
 * Includes a fail-safe for browsers without IntersectionObserver support.
 */
import { useState, useEffect, useRef } from 'react';

const LazyLoadSection = ({ children, rootMargin = '200px', minHeight = '300px' }) => {
    // Fail-safe: If IntersectionObserver is not supported, render immediately
    const [isVisible, setIsVisible] = useState(
        typeof IntersectionObserver === 'undefined'
    );
    const placeholderRef = useRef(null);

    useEffect(() => {
        // If already visible (fail-safe triggered), skip observer setup
        if (isVisible) return;

        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setIsVisible(true);
                    observer.disconnect(); // Stop observing once visible
                }
            },
            {
                rootMargin, // Trigger when within 200px of viewport
                threshold: 0
            }
        );

        const currentRef = placeholderRef.current;
        if (currentRef) {
            observer.observe(currentRef);
        }

        return () => {
            if (currentRef) {
                observer.unobserve(currentRef);
            }
            observer.disconnect();
        };
    }, [isVisible, rootMargin]);

    // If not visible yet, render a placeholder with minimum height to reserve space
    if (!isVisible) {
        return (
            <div
                ref={placeholderRef}
                style={{
                    minHeight,
                    width: '100%'
                }}
                aria-hidden="true"
            />
        );
    }

    // Once visible, render the actual children
    return <>{children}</>;
};

export default LazyLoadSection;
