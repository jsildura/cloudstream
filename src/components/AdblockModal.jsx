import React, { useState, useEffect } from 'react';
import './AdblockModal.css';

const AdblockModal = () => {
    const [adblockDetected, setAdblockDetected] = useState(false);
    const [checkComplete, setCheckComplete] = useState(false);

    useEffect(() => {
        const detectAdblock = async () => {
            let blocked = false;

            const isBrave = navigator.brave && await navigator.brave.isBrave();

            const baitContainer = document.createElement('div');
            baitContainer.style.cssText = 'position: absolute; top: -9999px; left: -9999px;';

            const baits = [
                { tag: 'div', attrs: { class: 'ad-unit', 'data-ad-slot': '1234567890' } },
                { tag: 'div', attrs: { class: 'ad-container ad-wrapper' } },
                { tag: 'ins', attrs: { class: 'adsbygoogle', 'data-ad-client': 'ca-pub-1234567890' } },
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

            const testScript = document.createElement('script');
            testScript.type = 'text/javascript';
            testScript.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js';
            testScript.async = true;

            let scriptBlocked = false;
            testScript.onerror = () => {
                scriptBlocked = true;
            };

            document.head.appendChild(testScript);

            await new Promise(resolve => setTimeout(resolve, 800));

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

            if (scriptBlocked) {
                blocked = true;
            }
            if (baitContainer.parentNode) {
                baitContainer.parentNode.removeChild(baitContainer);
            }
            if (testScript.parentNode) {
                testScript.parentNode.removeChild(testScript);
            }

            if (isBrave) {
                try {
                    const testFetch = await fetch('https://www.googletagservices.com/tag/js/gpt.js', {
                        method: 'HEAD',
                        mode: 'no-cors',
                        cache: 'no-store'
                    });
                } catch (e) {
                    blocked = true;
                }
            }

            setAdblockDetected(blocked);
            setCheckComplete(true);
        };

        setTimeout(detectAdblock, 200);
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
