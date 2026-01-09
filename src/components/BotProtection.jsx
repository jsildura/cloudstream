import React, { useState, useEffect, useRef } from 'react';
import './BotProtection.css';

// Device detection - skip devtools detection on mobile/TV
// This function runs once at module load to detect mobile browsers via User Agent
const isMobileOrTV = () => {
    const ua = navigator.userAgent;
    // Comprehensive mobile pattern - if UA matches, definitely mobile
    // This check uses User Agent which is available immediately and reliably
    const mobilePatterns = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|mobile|CriOS|FxiOS/i;
    const tvPatterns = /TV|Smart-TV|SmartTV|GoogleTV|AppleTV|BRAVIA|NetCast|Roku|Viera|NETTV|Xbox|PlayStation|Nintendo|Tizen|WebOS/i;

    // If user agent matches mobile/TV patterns, skip detection regardless of anything else
    if (mobilePatterns.test(ua) || tvPatterns.test(ua)) {
        return true;
    }

    // Additional check: touch-capable devices with mobile-like characteristics
    // This runs only if UA check didn't match (e.g., for tablets or unusual devices)
    if (typeof window !== 'undefined') {
        const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
        // On touch devices, be more conservative - skip devtools detection
        if (isTouchDevice) {
            return true;
        }
    }

    return false;
};

// Determine mobile status ONCE at module load - this happens before any React rendering
const IS_MOBILE_OR_TV = typeof navigator !== 'undefined' ? isMobileOrTV() : false;

const BotProtection = () => {
    const [accessDenied, setAccessDenied] = useState(false);
    const [denialReason, setDenialReason] = useState('');
    const detectedRef = useRef(false);
    const disableDevtoolInitialized = useRef(false);

    useEffect(() => {
        // Skip all detection in development mode
        if (import.meta.env.DEV) {
            return () => { };
        }

        // On mobile/TV devices, skip devtools detection entirely
        // This prevents false positives from the disable-devtool library
        const skipDevToolsDetection = IS_MOBILE_OR_TV;

        // Comprehensive headless/automation browser detection
        const checkHeadless = () => {
            // Whitelist in-app browsers (Facebook, Instagram, etc.) - skip ALL detection
            // These browsers have quirks that trigger false positives (no chrome object, webdriver flag, etc.)
            const inAppBrowserPattern = /FBAN|FBAV|FB_IAB|FB4A|FBIOS|Instagram|LinkedIn|Snapchat|Pinterest|Twitter|TikTok|Line|WeChat|MicroMessenger|GSA|Telegram/i;
            if (inAppBrowserPattern.test(navigator.userAgent)) {
                return null; // Not a bot, allow access
            }

            const tests = [];

            // WebDriver detection
            if (navigator.webdriver === true) tests.push('webdriver');
            if (document.documentElement.getAttribute('webdriver') !== null) tests.push('webdriver-attr');
            if (/HeadlessChrome/i.test(navigator.userAgent)) tests.push('headless-ua');

            // Chrome object detection
            const isChrome = /Chrome/i.test(navigator.userAgent);
            const isBrave = navigator.brave || /Brave/i.test(navigator.userAgent);
            // Detect in-app browsers that don't expose window.chrome (Facebook, Instagram, etc.)
            const isInAppBrowser = /FBAN|FBAV|Instagram|LinkedIn|Snapchat|Pinterest|Twitter|TikTok|Line|WeChat|MicroMessenger/i.test(navigator.userAgent);
            if (isChrome && !isBrave && !isInAppBrowser && typeof window.chrome === 'undefined') tests.push('no-chrome-obj');

            // Automation framework detection
            if (window.callPhantom || window._phantom || window.phantom) tests.push('phantomjs');
            if (window.__nightmare) tests.push('nightmarejs');
            if (window.domAutomation || window.domAutomationController) tests.push('dom-automation');
            if (navigator.userAgent.includes('pptr') || navigator.userAgent.includes('Puppeteer')) tests.push('puppeteer');
            if (navigator.userAgent.includes('Playwright')) tests.push('playwright');

            // CDP detection
            if (window.cdc_adoQpoasnfa76pfcZLmcfl_Array ||
                window.cdc_adoQpoasnfa76pfcZLmcfl_Promise ||
                window.cdc_adoQpoasnfa76pfcZLmcfl_Symbol) tests.push('cdp-detected');

            // Selenium detection
            if (document.$cdc_asdjflasutopfhvcZLmcfl_ ||
                document.$chrome_asyncScriptInfo ||
                document.$wdc_) tests.push('selenium');

            // Environment anomalies
            if (!navigator.languages || navigator.languages.length === 0) tests.push('no-languages');
            if (window.outerWidth === 0 && window.outerHeight === 0) tests.push('zero-dimensions');
            if (window.screen.width === 0 || window.screen.height === 0) tests.push('zero-screen');
            if ('_Selenium_IDE_Recorder' in window) tests.push('selenium-ide');
            if (navigator.connection && navigator.connection.rtt === 0) tests.push('zero-rtt');

            // WebGL software renderer detection
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

            // Bot user agent patterns
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

        // Run headless detection immediately
        const runHeadlessDetection = () => {
            if (detectedRef.current) return;

            // Skip on mobile devices - re-check in case module-level detection failed
            if (isMobileOrTV()) return;

            const reason = checkHeadless();
            if (reason) {
                detectedRef.current = true;
                setAccessDenied(true);
                setDenialReason(reason);
            }
        };

        runHeadlessDetection();

        // Initialize disable-devtool library dynamically (only once)
        const initDisableDevtool = async () => {
            if (disableDevtoolInitialized.current) return;
            disableDevtoolInitialized.current = true;

            try {
                const { default: DisableDevtool } = await import('disable-devtool');

                DisableDevtool({
                    // Callback when devtools is detected
                    ondevtoolopen: (type, next) => {
                        // FAILSAFE: Re-check if we're on mobile - this catches cases where
                        // the module-level detection failed (navigator not ready at module load)
                        if (isMobileOrTV()) {
                            return; // Ignore detection on mobile - it's a false positive
                        }

                        if (!detectedRef.current) {
                            detectedRef.current = true;
                            setAccessDenied(true);
                            setDenialReason('Developer tools detected');
                        }
                        // Don't call next() to avoid default redirect behavior
                    },
                    // Callback when devtools is closed (optional, for future use)
                    ondevtoolclose: () => {
                        // Could potentially reset state here if desired
                    },
                    // Configuration options
                    disableMenu: true,           // Disable right-click context menu
                    clearLog: true,              // Clear console logs periodically
                    disableSelect: false,        // Allow text selection
                    disableCopy: false,          // Allow copying
                    disableCut: false,           // Allow cutting
                    disablePaste: false,         // Allow pasting
                    interval: 200,               // Check interval in ms
                    // Use all detection methods for maximum coverage
                    detectors: [
                        0,  // RegToString
                        1,  // DefineId
                        // 2,  // Size - disabled as per library recommendation (can cause false positives)
                        3,  // DateToString
                        4,  // FuncToString
                        5,  // Debugger
                        6,  // Performance
                        7,  // DebugLib (eruda, vconsole)
                    ],
                });
            } catch (error) {
                // Library blocked by adblocker or failed to load - silently ignore
                console.warn('DisableDevtool could not be loaded:', error.message);
            }
        };

        // Skip devtools detection entirely on mobile/TV devices
        // The IS_MOBILE_OR_TV check happened at module load, so it's reliable
        if (!skipDevToolsDetection) {
            initDisableDevtool();
        }

        // No cleanup needed - disable-devtool manages its own lifecycle
        return () => { };
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
