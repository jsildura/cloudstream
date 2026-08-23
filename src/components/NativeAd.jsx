import React, { useEffect, useRef } from 'react';
import { useAdFree } from '../contexts/AdFreeContext';
import { AD_STATE_ADS } from '../utils/adGating';
import './NativeAd.css';

const NativeAd = () => {
    const { adGateState } = useAdFree();
    // Fail-closed: `pending` renders nothing and injects nothing, so a paying
    // account never sees a flash of native ads before the listener resolves.
    const adsAllowed = adGateState === AD_STATE_ADS;
    const adContainerRef = useRef(null);

    useEffect(() => {
        if (!adsAllowed) return;

        const container = adContainerRef.current;
        if (!container) return;

        // Adsterra configuration nativead
        const script = document.createElement('script');
        script.async = true;
        script.setAttribute('data-cfasync', 'false');
        script.src = 'https://consumptionbackwardsentiments.com/2169057a99b05d1f0c42cb91d4e1e11e/invoke.js';

        container.appendChild(script);

        return () => {
            // Cleanup on unmount or when the gate leaves `ads`
            if (script.parentNode === container) {
                container.removeChild(script);
            }
        };
    }, [adsAllowed]);

    if (!adsAllowed) return null;

    return (
        <section className="native-ad-section">
            {/* Section Header - matches site's design pattern */}
            <div className="native-ad-header">
                <div className="native-ad-header-left">
                    <h2 className="native-ad-title">Don't Miss Out</h2>
                    <p className="native-ad-subtitle">Explore the Hype</p>
                </div>
                <span className="native-ad-badge">Ad</span>
            </div>

            {/* Ad Content */}
            <div className="native-ad-wrapper">
                <div
                    ref={adContainerRef}
                    id="container-2169057a99b05d1f0c42cb91d4e1e11e"
                    className="native-ad-container"
                />
            </div>
        </section>
    );
};

export default NativeAd;
