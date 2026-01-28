import React, { useEffect, useRef } from 'react';

// Preload flag to track if script is already loaded
let adScriptPreloaded = false;

/**
 * Prefetch the Adsterra script globally (call once on app init)
 * Uses prefetch instead of preload to avoid "not used within a few seconds" warning
 */
export const preloadAdScript = () => {
    if (adScriptPreloaded || typeof window === 'undefined') return;

    // Prefetch the invoke script (lower priority, no warning if not used immediately)
    const link = document.createElement('link');
    link.rel = 'prefetch';
    link.href = 'https://www.highperformanceformat.com/d6204c743c98bdef4eccde765f27ae36/invoke.js';
    document.head.appendChild(link);

    adScriptPreloaded = true;
};

/**
 * AdInterstitial - Wrapper for Adsterra 300x250 Banner
 * 
 * Uses script injection to load the ad.
 * Preloading happens on app mount for faster display.
 */
const AdInterstitial = ({ className = '' }) => {
    const containerRef = useRef(null);
    const scriptLoadedRef = useRef(false);

    useEffect(() => {
        if (scriptLoadedRef.current || !containerRef.current) return;

        // Clear any existing content
        containerRef.current.innerHTML = '';

        // Create the options script
        const optionsScript = document.createElement('script');
        optionsScript.innerHTML = `
            atOptions = {
                'key' : 'd6204c743c98bdef4eccde765f27ae36',
                'format' : 'iframe',
                'height' : 250,
                'width' : 300,
                'params' : {}
            };
        `;
        containerRef.current.appendChild(optionsScript);

        // Create the invoke script
        const invokeScript = document.createElement('script');
        invokeScript.src = 'https://www.highperformanceformat.com/d6204c743c98bdef4eccde765f27ae36/invoke.js';
        invokeScript.async = true;
        containerRef.current.appendChild(invokeScript);

        scriptLoadedRef.current = true;

        return () => {
            // Cleanup on unmount
            if (containerRef.current) {
                containerRef.current.innerHTML = '';
            }
            scriptLoadedRef.current = false;
        };
    }, []);

    return (
        <div
            ref={containerRef}
            className={`ad-interstitial ${className}`}
            style={{
                width: '300px',
                height: '250px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(0, 0, 0, 0.3)',
                borderRadius: '8px',
                overflow: 'hidden'
            }}
        />
    );
};

export default AdInterstitial;
