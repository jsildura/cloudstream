import React, { useState, useEffect } from 'react';
import { isTVUserAgent } from '../utils/platform';
import { runAdblockBaitTest } from '../lib/adblockDetection';
import { useAdFree } from '../contexts/AdFreeContext';
import { AD_STATE_ADS } from '../utils/adGating';
import './AdblockModal.css';

const SESSION_DISMISSED_KEY = 'streamflix_adblock_dismissed';

const isSessionDismissed = () => {
    try {
        return sessionStorage.getItem(SESSION_DISMISSED_KEY) === 'true';
    } catch {
        return false;
    }
};

const AdblockModal = () => {
    const { adGateState } = useAdFree();
    // Fail-closed: detection only runs for a resolved ad-supported session, so a
    // paying account is never asked to disable its ad blocker.
    const adsAllowed = adGateState === AD_STATE_ADS;
    const [adblockDetected, setAdblockDetected] = useState(false);
    const [checkComplete, setCheckComplete] = useState(false);
    const [dismissed, setDismissed] = useState(isSessionDismissed);
    const isTV = isTVUserAgent();

    useEffect(() => {
        if (!adsAllowed || dismissed) {
            setCheckComplete(true);
            return;
        }

        const detectAdblock = async () => {
            let blocked = false;

            try {
                blocked = await runAdblockBaitTest();
            } catch (error) {
                console.error('Adblock detection error:', error);
                // On error, don't assume adblock (avoid false positives)
                blocked = false;
            }

            setAdblockDetected(blocked);
            setCheckComplete(true);
        };

        const timer = setTimeout(detectAdblock, 500);
        return () => clearTimeout(timer);
    }, [dismissed, adsAllowed]);

    const handleRefresh = () => {
        window.location.reload();
    };

    const handleDismiss = () => {
        try {
            sessionStorage.setItem(SESSION_DISMISSED_KEY, 'true');
        } catch {
            // Ignore storage quota/permission errors
        }
        setDismissed(true);
    };

    if (!adsAllowed || dismissed || !checkComplete || !adblockDetected) return null;

    // TV browsers often have built-in ad blocking the user can't disable —
    // show a dismissable banner instead of blocking the entire app
    if (isTV) {
        return (
            <div className="adblock-banner" role="alert">
                <p>Ads are blocked — some features may be limited.</p>
                <button className="adblock-banner-dismiss" onClick={handleDismiss} aria-label="Dismiss">✕</button>
            </div>
        );
    }

    return (
        <div className="adblock-overlay" data-nav-trap>
            <div className="adblock-modal">
                <div className="adblock-icon">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                        <line x1="4" y1="4" x2="20" y2="20" />
                    </svg>
                </div>
                <h2 className="adblock-title">Oops! Something's blocking the ads</h2>
                <p className="adblock-description">
                    Please disable your ad blocker to continue. Ads help keep Streamflix free for everyone.
                </p>
                <div className="adblock-actions">
                    <button className="adblock-refresh-btn" onClick={handleRefresh}>
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 2v6h-6" />
                            <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
                            <path d="M3 22v-6h6" />
                            <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
                        </svg>
                        I've Disabled It - Refresh
                    </button>
                    <button className="adblock-dismiss-btn" onClick={handleDismiss}>
                        Continue Anyway
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AdblockModal;
