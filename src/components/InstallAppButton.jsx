import React, { useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import usePWAInstall from '../hooks/usePWAInstall';
import './InstallAppButton.css';

/**
 * Install App Button Component
 * Shows a button to install the PWA when available
 * Displays manual installation instructions in a drawer modal for browsers without native support
 * The modal is rendered via Portal to ensure it appears on top of everything
 */
const InstallAppButton = () => {
    const {
        isInstallable,
        isInstalled,
        promptInstall,
        showManualInstructions,
        dismissInstructions,
        platform
    } = usePWAInstall();

    // All hooks MUST be called before any early returns (React Rules of Hooks)
    // Tab state for platform selection - default to Android
    const [activeTab, setActiveTab] = useState(() => {
        if (platform === 'ios') return 'iphone';
        return 'android'; // Default to Android for all other platforms
    });

    // Drag state for drawer
    const [isDragging, setIsDragging] = useState(false);
    const [isClosing, setIsClosing] = useState(false);
    const drawerRef = useRef(null);
    const dragStartYRef = useRef(0);
    const dragOffsetRef = useRef(0);

    // Drag handlers for drawer - defined before early return
    const handleDragStart = useCallback((e) => {
        e.preventDefault();
        setIsDragging(true);
        const clientY = e.type === 'touchstart' ? e.touches[0].clientY : e.clientY;
        dragStartYRef.current = clientY;
        dragOffsetRef.current = 0;

        if (drawerRef.current) {
            drawerRef.current.style.transition = 'none';
        }
    }, []);

    const handleDragMove = useCallback((e) => {
        if (!isDragging) return;

        const clientY = e.type === 'touchmove' ? e.touches[0].clientY : e.clientY;
        const offset = Math.max(0, clientY - dragStartYRef.current); // Only allow dragging down
        dragOffsetRef.current = offset;

        if (drawerRef.current) {
            drawerRef.current.style.transform = `translateY(${offset}px)`;
        }
    }, [isDragging]);

    const handleDragEnd = useCallback(() => {
        if (!isDragging) return;
        setIsDragging(false);

        const offset = dragOffsetRef.current;
        const threshold = 100; // Close if dragged more than 100px

        if (drawerRef.current) {
            drawerRef.current.style.transition = 'transform 0.3s ease';

            if (offset > threshold) {
                // Close the drawer
                setIsClosing(true);
                drawerRef.current.style.transform = 'translateY(100%)';
                setTimeout(() => {
                    dismissInstructions();
                    setIsClosing(false);
                }, 300);
            } else {
                // Snap back
                drawerRef.current.style.transform = 'translateY(0)';
            }
        }

        dragOffsetRef.current = 0;
    }, [isDragging, dismissInstructions]);

    // Add/remove global event listeners for drag
    useEffect(() => {
        if (isDragging) {
            const handleMove = (e) => handleDragMove(e);
            const handleEnd = () => handleDragEnd();

            document.addEventListener('mousemove', handleMove);
            document.addEventListener('mouseup', handleEnd);
            document.addEventListener('touchmove', handleMove, { passive: false });
            document.addEventListener('touchend', handleEnd);

            return () => {
                document.removeEventListener('mousemove', handleMove);
                document.removeEventListener('mouseup', handleEnd);
                document.removeEventListener('touchmove', handleMove);
                document.removeEventListener('touchend', handleEnd);
            };
        }
    }, [isDragging, handleDragMove, handleDragEnd]);

    // Button always shows - removed early return check

    const handleClick = async () => {
        await promptInstall();
    };

    // Platform-specific instructions
    const instructions = {
        android: {
            browser: 'Chrome Browser',
            steps: [
                'Open this website in Chrome browser',
                'Tap the menu button (three dots) in the top right',
                'Select "Add to Home screen" or "Install app"',
                'Tap "Add" or "Install" to confirm',
                'The app will be added to your home screen'
            ],
            note: null
        },
        iphone: {
            browser: 'Safari Browser',
            steps: [
                'Open this website in Safari browser',
                'Tap the Share button (square with arrow up) at the bottom',
                'Scroll down and tap "Add to Home Screen"',
                'Edit the name if desired, then tap "Add"',
                'The app will appear on your home screen'
            ],
            note: 'Note: This feature only works in Safari browser, not in Chrome or other browsers on iOS.'
        },
        windows: {
            browser: 'Microsoft Edge',
            steps: [
                'Open this website in Microsoft Edge',
                'Click the menu button (three dots) in the top right',
                'Select "Apps" > "Install this site as an app"',
                'Click "Install" to confirm',
                'The app will be added to your Start menu and desktop'
            ],
            chromeSteps: [
                'Open this website in Google Chrome',
                'Click the install icon in the address bar (if available)',
                'Or click the menu button (three dots) > "More tools" → "Create shortcut"',
                'Check "Open as window" and click "Create"',
                'The app will be added to your desktop and Start menu'
            ],
            note: null
        }
    };

    const currentInstructions = instructions[activeTab];

    // Modal rendered via Portal to document body
    const modal = showManualInstructions ? createPortal(
        <div className="install-drawer-overlay" onClick={dismissInstructions}>
            <div
                ref={drawerRef}
                className={`install-drawer ${isClosing ? 'closing' : ''}`}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Drawer Handle - Draggable */}
                <div
                    className="install-drawer-handle"
                    onMouseDown={handleDragStart}
                    onTouchStart={handleDragStart}
                >
                    <div className="install-drawer-handle-bar"></div>
                </div>

                {/* Header */}
                <div className="install-drawer-header">
                    <h2 className="install-drawer-title">Install StreamFlix App</h2>
                    <p className="install-drawer-subtitle">Follow the instructions below to install this app on your device</p>
                </div>

                {/* Platform Tabs */}
                <div className="install-drawer-tabs">
                    <button
                        className={`install-drawer-tab ${activeTab === 'android' ? 'active' : ''}`}
                        onClick={() => setActiveTab('android')}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
                            <path d="M12 18h.01" />
                        </svg>
                        Android
                    </button>
                    <button
                        className={`install-drawer-tab ${activeTab === 'iphone' ? 'active' : ''}`}
                        onClick={() => setActiveTab('iphone')}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
                            <path d="M12 18h.01" />
                        </svg>
                        iPhone
                    </button>
                    <button
                        className={`install-drawer-tab ${activeTab === 'windows' ? 'active' : ''}`}
                        onClick={() => setActiveTab('windows')}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                            <path d="M8 21h8" />
                            <path d="M12 17v4" />
                        </svg>
                        Windows
                    </button>
                </div>

                {/* Content */}
                <div className="install-drawer-content">
                    <h3 className="install-drawer-browser-title">
                        {currentInstructions.browser} ({currentInstructions.steps.length} steps)
                    </h3>

                    {/* Steps Grid */}
                    <div className="install-drawer-steps-grid">
                        {currentInstructions.steps.map((step, index) => (
                            <div key={index} className="install-drawer-step-card">
                                <span className="install-step-number">{index + 1}.</span>
                                <span className="install-step-text">{step}</span>
                            </div>
                        ))}
                    </div>

                    {/* Chrome steps for Windows */}
                    {activeTab === 'windows' && currentInstructions.chromeSteps && (
                        <>
                            <h3 className="install-drawer-browser-title" style={{ marginTop: '24px' }}>
                                Google Chrome ({currentInstructions.chromeSteps.length} steps)
                            </h3>
                            <div className="install-drawer-steps-grid">
                                {currentInstructions.chromeSteps.map((step, index) => (
                                    <div key={`chrome-${index}`} className="install-drawer-step-card">
                                        <span className="install-step-number">{index + 1}.</span>
                                        <span className="install-step-text">{step}</span>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}

                    {/* Note */}
                    {currentInstructions.note && (
                        <p className="install-drawer-note">
                            <span className="note-label">Note:</span> {currentInstructions.note.replace('Note: ', '')}
                        </p>
                    )}
                </div>
            </div>
        </div>,
        document.body
    ) : null;

    return (
        <>
            <button
                className="install-app-btn"
                onClick={handleClick}
                aria-label="Install StreamFlix App"
            >
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="install-icon"
                >
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                <span className="install-text">Install App</span>
            </button>
            {modal}
        </>
    );
};

export default InstallAppButton;
