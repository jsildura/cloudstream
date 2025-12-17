import React, { useState, useEffect, useRef } from 'react';
import './BotProtection.css';

const BotProtection = () => {
    const [accessDenied, setAccessDenied] = useState(false);
    const [denialReason, setDenialReason] = useState('');
    const detectedRef = useRef(false);

    useEffect(() => {
        // ========================================
        // DETECT MOBILE/TV DEVICES (skip DevTools detection on these)
        // More aggressive detection to avoid false positives
        // ========================================
        const isMobileOrTV = () => {
            const ua = navigator.userAgent;

            // Mobile device patterns
            const mobilePatterns = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|mobile|CriOS|FxiOS/i;

            // TV/Console patterns  
            const tvPatterns = /TV|Smart-TV|SmartTV|GoogleTV|AppleTV|BRAVIA|NetCast|Roku|Viera|NETTV|Xbox|PlayStation|Nintendo|Tizen|WebOS/i;

            // Check if touch device
            const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

            // Check screen size (tablets and phones)
            const isSmallScreen = window.innerWidth < 1280 || window.innerHeight < 720;

            // Return true if any condition matches
            return mobilePatterns.test(ua) || tvPatterns.test(ua) || (isTouchDevice && isSmallScreen);
        };

        const skipDevToolsDetection = isMobileOrTV();

        // ========================================
        // AGGRESSIVE HEADLESS BROWSER DETECTION
        // ========================================
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

            // Removed no-plugins check - causes false positives on mobile browsers
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

        // ========================================
        // DEVTOOLS DETECTION - Window size
        // ========================================
        const checkDevToolsWindowSize = () => {
            const threshold = 160;
            const widthDiff = window.outerWidth - window.innerWidth;
            const heightDiff = window.outerHeight - window.innerHeight;

            if (widthDiff > threshold || heightDiff > threshold) {
                return 'Developer tools detected';
            }
            return null;
        };

        // ========================================
        // DEVTOOLS DETECTION - Debugger timing
        // Modal shows AFTER debugger confirms DevTools is open
        // IMMEDIATELY destroys page when user resumes from debugger
        // NOTE: JS cannot execute WHILE frozen, but we destroy immediately on resume
        // ========================================
        const checkDevToolsDebugger = () => {
            const start = performance.now();
            // eslint-disable-next-line no-debugger
            debugger;
            const duration = performance.now() - start;

            // If debugger took > 50ms, DevTools is open
            // IMMEDIATELY destroy the page before anything else can happen
            if (duration > 50) {
                // Synchronous destruction - runs BEFORE any other code
                try {
                    // Clear the entire document immediately
                    document.documentElement.innerHTML = '';
                } catch (e) { }

                try {
                    // Navigate away immediately
                    window.location.replace('about:blank');
                } catch (e) { }

                try {
                    // Stop all scripts
                    window.stop();
                } catch (e) { }

                try {
                    // Close if possible
                    window.close();
                } catch (e) { }

                // Infinite loop to prevent any further execution
                while (true) {
                    try {
                        document.body.innerHTML = '';
                        window.location.href = 'about:blank';
                    } catch (e) { }
                }
            }

            return duration > 50;
        };

        // ========================================
        // RUN DETECTION
        // ========================================
        const runDetection = () => {
            if (detectedRef.current) return;

            // Check headless (runs on all devices - important to block bots)
            let reason = checkHeadless();
            if (reason) {
                detectedRef.current = true;
                setAccessDenied(true);
                setDenialReason(reason);
                return;
            }

            // Skip ALL DevTools detection on mobile/TV
            if (skipDevToolsDetection) return;

            // Check window size (desktop only)
            reason = checkDevToolsWindowSize();
            if (reason) {
                detectedRef.current = true;
                setAccessDenied(true);
                setDenialReason(reason);
                return;
            }

            checkDevToolsDebugger();
        };

        // Run initial detection
        runDetection();

        const interval = skipDevToolsDetection ? null : setInterval(() => {
            if (detectedRef.current) return;

            // Window size check (for docked DevTools)
            let reason = checkDevToolsWindowSize();
            if (reason) {
                detectedRef.current = true;
                setAccessDenied(true);
                setDenialReason(reason);
                return;
            }

            checkDevToolsDebugger();
        }, 3000);

        const handleResize = skipDevToolsDetection ? null : () => {
            if (detectedRef.current) return;
            const reason = checkDevToolsWindowSize();
            if (reason) {
                detectedRef.current = true;
                setAccessDenied(true);
                setDenialReason(reason);
            }
        };

        if (handleResize) {
            window.addEventListener('resize', handleResize);
        }

        // ========================================
        // PREVENT RIGHT-CLICK CONTEXT MENU
        // ========================================
        const handleContextMenu = (e) => {
            e.preventDefault();
            return false;
        };
        document.addEventListener('contextmenu', handleContextMenu);

        // ========================================
        // PREVENT DEVTOOLS KEYBOARD SHORTCUTS
        // F12, Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+U
        // ========================================
        const handleKeyDown = (e) => {
            // F12
            if (e.key === 'F12' || e.keyCode === 123) {
                e.preventDefault();
                return false;
            }
            // Ctrl+Shift+I (DevTools)
            if (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'i' || e.keyCode === 73)) {
                e.preventDefault();
                return false;
            }
            // Ctrl+Shift+J (Console)
            if (e.ctrlKey && e.shiftKey && (e.key === 'J' || e.key === 'j' || e.keyCode === 74)) {
                e.preventDefault();
                return false;
            }
            // Ctrl+Shift+C (Inspect Element)
            if (e.ctrlKey && e.shiftKey && (e.key === 'C' || e.key === 'c' || e.keyCode === 67)) {
                e.preventDefault();
                return false;
            }
            // Ctrl+U (View Source)
            if (e.ctrlKey && (e.key === 'U' || e.key === 'u' || e.keyCode === 85)) {
                e.preventDefault();
                return false;
            }
        };
        document.addEventListener('keydown', handleKeyDown);

        return () => {
            if (interval) clearInterval(interval);
            if (handleResize) window.removeEventListener('resize', handleResize);
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
