import React, { useEffect, useRef } from 'react';
import { useAdFree } from '../../contexts/AdFreeContext';
import { AD_STATE_ADS } from '../../utils/adGating';

// Preload flag to track if script is already loaded
let adScriptPreloaded = false;

/**
 * Prefetch the Adsterra script globally (call once on app init)
 * Uses prefetch instead of preload to avoid "not used within a few seconds" warning
 */
// Module-level preload helper, not a component — exempt from react-refresh.
// eslint-disable-next-line react-refresh/only-export-components
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
    const { adGateState } = useAdFree();
    // Fail-closed: nothing renders or loads while the gate is `pending`.
    const adsAllowed = adGateState === AD_STATE_ADS;
    const containerRef = useRef(null);
    const scriptLoadedRef = useRef(false);

    useEffect(() => {
        if (!adsAllowed) return;
        const container = containerRef.current;
        if (scriptLoadedRef.current || !container) return;

        // Clear any existing content
        container.innerHTML = '';

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
        container.appendChild(optionsScript);

        // Create the invoke script
        const invokeScript = document.createElement('script');
        invokeScript.src = 'https://www.highperformanceformat.com/d6204c743c98bdef4eccde765f27ae36/invoke.js';
        invokeScript.async = true;
        container.appendChild(invokeScript);

        scriptLoadedRef.current = true;

        return () => {
            // Cleanup on unmount
            if (container) {
                container.innerHTML = '';
            }
            scriptLoadedRef.current = false;
        };
    }, [adsAllowed]);

    if (!adsAllowed) return null;

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
