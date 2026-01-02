import React, { useEffect, useRef } from 'react';

const NativeAd = () => {
    const adContainerRef = useRef(null);
    const scriptLoaded = useRef(false);

    useEffect(() => {
        // Only load the script once
        if (scriptLoaded.current) return;

        const container = adContainerRef.current;
        if (!container) return;

        // Create and append the ad script
        const script = document.createElement('script');
        script.async = true;
        script.setAttribute('data-cfasync', 'false');
        script.src = 'https://pl28314998.effectivegatecpm.com/2169057a99b05d1f0c42cb91d4e1e11e/invoke.js';

        container.appendChild(script);
        scriptLoaded.current = true;

        return () => {
            // Cleanup on unmount
            if (container && script.parentNode === container) {
                container.removeChild(script);
            }
        };
    }, []);

    return (
        <div className="native-ad-wrapper">
            <div
                ref={adContainerRef}
                id="container-2169057a99b05d1f0c42cb91d4e1e11e"
                className="native-ad-container"
            />
        </div>
    );
};

export default NativeAd;
