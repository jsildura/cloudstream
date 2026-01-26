import React, { useState, useEffect } from 'react';
import './AdblockModal.css';

const AdblockModal = () => {
    // TODO: Re-enable adblock detection when project is complete
    // Remove or comment out the "return null;" below to re-enable

    const [adblockDetected, setAdblockDetected] = useState(false);
    const [checkComplete, setCheckComplete] = useState(false);

    useEffect(() => {
        const detectAdblock = async () => {
            let blocked = false;

            try {
                // Create bait elements that ad blockers typically hide
                const baitContainer = document.createElement('div');
                baitContainer.style.cssText = 'position: absolute; top: -9999px; left: -9999px;';

                const baits = [
                    { tag: 'div', attrs: { class: 'ad-unit', 'data-ad-slot': '1234567890' } },
                    { tag: 'div', attrs: { class: 'ad-container ad-wrapper' } },
                    { tag: 'div', attrs: { id: 'ad-banner', class: 'ad' } },
                    { tag: 'div', attrs: { class: 'sponsor-ad sponsored-content' } },
                    { tag: 'iframe', attrs: { src: 'about:blank', class: 'ad-frame' } },
                ];

                baits.forEach(({ tag, attrs }) => {
                    const el = document.createElement(tag);
                    Object.entries(attrs).forEach(([key, value]) => {
                        el.setAttribute(key, value);
                    });
                    el.style.cssText = 'width: 1px; height: 1px; display: block;';
                    el.innerHTML = '&nbsp;';
                    baitContainer.appendChild(el);
                });

                document.body.appendChild(baitContainer);

                // Wait for ad blockers to process
                await new Promise(resolve => setTimeout(resolve, 500));

                // Check if bait elements were hidden or removed
                const baitElements = baitContainer.querySelectorAll('*');
                for (const bait of baitElements) {
                    if (!document.body.contains(bait)) {
                        blocked = true;
                        break;
                    }
                    const style = window.getComputedStyle(bait);
                    if (
                        style.display === 'none' ||
                        style.visibility === 'hidden' ||
                        style.opacity === '0' ||
                        bait.offsetHeight === 0 ||
                        bait.offsetWidth === 0
                    ) {
                        blocked = true;
                        break;
                    }
                }

                // Cleanup
                if (baitContainer.parentNode) {
                    baitContainer.parentNode.removeChild(baitContainer);
                }

                // Note: We intentionally do NOT check fetch to ad domains here
                // because network failures, CORS issues, and connectivity problems
                // can cause false positives. The bait element check above is more reliable.

            } catch (error) {
                console.error('Adblock detection error:', error);
                // On error, don't assume adblock (avoid false positives)
                blocked = false;
            }

            setAdblockDetected(blocked);
            setCheckComplete(true);
        };

        setTimeout(detectAdblock, 500);
    }, []);

    const handleRefresh = () => {
        window.location.reload();
    };

    if (!checkComplete) return null;
    if (!adblockDetected) return null;

    return (
        <div className="adblock-overlay">
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
                <button className="adblock-refresh-btn" onClick={handleRefresh}>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 2v6h-6" />
                        <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
                        <path d="M3 22v-6h6" />
                        <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
                    </svg>
                    I've Disabled It - Refresh
                </button>
            </div>
        </div>
    );
};

export default AdblockModal;
