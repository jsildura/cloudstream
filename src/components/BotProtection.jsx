import React, { useState, useEffect, useRef } from 'react';
import './BotProtection.css';

const BotProtection = () => {
    const [accessDenied, setAccessDenied] = useState(false);
    const [denialReason, setDenialReason] = useState('');
    const detectedRef = useRef(false);

    useEffect(() => {

        const isMobileOrTV = () => {
            const ua = navigator.userAgent;

            const mobilePatterns = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|mobile|CriOS|FxiOS/i;
            const tvPatterns = /TV|Smart-TV|SmartTV|GoogleTV|AppleTV|BRAVIA|NetCast|Roku|Viera|NETTV|Xbox|PlayStation|Nintendo|Tizen|WebOS/i;
            const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
            const isSmallScreen = window.innerWidth < 1280 || window.innerHeight < 720;
            return mobilePatterns.test(ua) || tvPatterns.test(ua) || (isTouchDevice && isSmallScreen);
        };

        const skipDevToolsDetection = isMobileOrTV();
        const checkHeadless = () => {
            const tests = [];

            if (navigator.webdriver === true) tests.push('webdriver');
            if (document.documentElement.getAttribute('webdriver') !== null) tests.push('webdriver-attr');
            if (/HeadlessChrome/i.test(navigator.userAgent)) tests.push('headless-ua');

            const isChrome = /Chrome/i.test(navigator.userAgent);
            const isBrave = navigator.brave || /Brave/i.test(navigator.userAgent);
            if (isChrome && !isBrave && typeof window.chrome === 'undefined') tests.push('no-chrome-obj');

            if (window.callPhantom || window._phantom || window.phantom) tests.push('phantomjs');
            if (window.__nightmare) tests.push('nightmarejs');
            if (window.domAutomation || window.domAutomationController) tests.push('dom-automation');
            if (navigator.userAgent.includes('pptr') || navigator.userAgent.includes('Puppeteer')) tests.push('puppeteer');
            if (navigator.userAgent.includes('Playwright')) tests.push('playwright');

            if (window.cdc_adoQpoasnfa76pfcZLmcfl_Array ||
                window.cdc_adoQpoasnfa76pfcZLmcfl_Promise ||
                window.cdc_adoQpoasnfa76pfcZLmcfl_Symbol) tests.push('cdp-detected');

            if (document.$cdc_asdjflasutopfhvcZLmcfl_ ||
                document.$chrome_asyncScriptInfo ||
                document.$wdc_) tests.push('selenium');

            if (!navigator.languages || navigator.languages.length === 0) tests.push('no-languages');
            if (window.outerWidth === 0 && window.outerHeight === 0) tests.push('zero-dimensions');
            if (window.screen.width === 0 || window.screen.height === 0) tests.push('zero-screen');
            if ('_Selenium_IDE_Recorder' in window) tests.push('selenium-ide');
            if (navigator.connection && navigator.connection.rtt === 0) tests.push('zero-rtt');

            try {
                const canvas = document.createElement('canvas');
                const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
                if (gl) {
                    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
                    if (debugInfo) {
                        const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
                        if (renderer.includes('SwiftShader') || renderer.includes('llvmpipe')) {
                            tests.push('software-renderer');
                        }
                    }
                }
            } catch (e) { }

            const botPatterns = [/bot/i, /crawl/i, /spider/i, /scrape/i, /headless/i, /phantom/i, /selenium/i, /webdriver/i];
            for (const pattern of botPatterns) {
                if (pattern.test(navigator.userAgent)) {
                    tests.push('bot-ua-pattern');
                    break;
                }
            }

            if (tests.length > 0) {
                return 'Automated browser detected';
            }
            return null;
        };

        let devToolsDetected = false;

        const checkDevToolsImage = () => {
            devToolsDetected = false;
            const element = new Image();
            Object.defineProperty(element, 'id', {
                get: function () {
                    devToolsDetected = true;
                }
            });
            console.log(element);
            console.clear();
            return devToolsDetected;
        };

        const checkDevToolsDebugger = () => {
            const start = performance.now();
            debugger;
            const duration = performance.now() - start;

            if (duration > 100) {
                try {
                    document.documentElement.innerHTML = '';
                } catch (e) { }

                try {
                    window.location.replace('about:blank');
                } catch (e) { }

                try {
                    window.stop();
                } catch (e) { }

                try {
                    window.close();
                } catch (e) { }

                while (true) {
                    try {
                        document.body.innerHTML = '';
                        window.location.href = 'about:blank';
                    } catch (e) { }
                }
            }

            return duration > 100;
        };

        const runDetection = () => {
            if (detectedRef.current) return;

            let reason = checkHeadless();
            if (reason) {
                detectedRef.current = true;
                setAccessDenied(true);
                setDenialReason(reason);
                return;
            }

            if (skipDevToolsDetection) return;

            if (checkDevToolsImage()) {
                detectedRef.current = true;
                setAccessDenied(true);
                setDenialReason('Developer tools detected');
                return;
            }

            checkDevToolsDebugger();
        };

        runDetection();

        const interval = skipDevToolsDetection ? null : setInterval(() => {
            if (detectedRef.current) return;

            if (checkDevToolsImage()) {
                detectedRef.current = true;
                setAccessDenied(true);
                setDenialReason('Developer tools detected');
                return;
            }

            checkDevToolsDebugger();
        }, 3000);

        const handleContextMenu = (e) => {
            e.preventDefault();
            return false;
        };
        document.addEventListener('contextmenu', handleContextMenu);

        const handleKeyDown = (e) => {
            if (e.key === 'F12' || e.keyCode === 123) {
                e.preventDefault();
                return false;
            }
            if (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'i' || e.keyCode === 73)) {
                e.preventDefault();
                return false;
            }
            if (e.ctrlKey && e.shiftKey && (e.key === 'J' || e.key === 'j' || e.keyCode === 74)) {
                e.preventDefault();
                return false;
            }
            if (e.ctrlKey && e.shiftKey && (e.key === 'C' || e.key === 'c' || e.keyCode === 67)) {
                e.preventDefault();
                return false;
            }

            if (e.ctrlKey && (e.key === 'U' || e.key === 'u' || e.keyCode === 85)) {
                e.preventDefault();
                return false;
            }
        };
        document.addEventListener('keydown', handleKeyDown);

        return () => {
            if (interval) clearInterval(interval);
            document.removeEventListener('contextmenu', handleContextMenu);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, []);

    if (!accessDenied) return null;

    return (
        <div className="bot-protection-overlay">
            <div className="bot-protection-modal">
                <div className="bot-protection-icon">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
                    </svg>
                </div>
                <h2 className="bot-protection-title">Access Denied</h2>
                <p className="bot-protection-description">
                    {denialReason}. Please close any developer tools or automation software to continue.
                </p>
                <button
                    className="bot-protection-btn"
                    onClick={() => window.location.reload()}
                >
                    Try Again
                </button>
            </div>
        </div>
    );
};

export default BotProtection;
