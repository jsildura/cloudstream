import { useState, useEffect, useCallback } from 'react';

/**
 * Custom hook for PWA installation functionality
 * Handles the beforeinstallprompt event and provides install UI state
 * Also provides fallback instructions for browsers that don't support native install
 */
const usePWAInstall = () => {
    const [installPrompt, setInstallPrompt] = useState(null);
    const [isInstallable, setIsInstallable] = useState(false);
    const [isInstalled, setIsInstalled] = useState(false);
    const [showManualInstructions, setShowManualInstructions] = useState(false);
    const [platform, setPlatform] = useState('unknown');

    useEffect(() => {
        // Detect platform for manual install instructions
        const detectPlatform = () => {
            const ua = navigator.userAgent || navigator.vendor || window.opera;

            // iOS detection
            if (/iPad|iPhone|iPod/.test(ua) && !window.MSStream) {
                setPlatform('ios');
                return 'ios';
            }

            // Android detection
            if (/android/i.test(ua)) {
                setPlatform('android');
                return 'android';
            }

            // Desktop detection
            setPlatform('desktop');
            return 'desktop';
        };

        const detectedPlatform = detectPlatform();

        // Check if already installed (standalone mode)
        const checkInstalled = () => {
            const isStandalone = window.matchMedia('(display-mode: standalone)').matches
                || window.navigator.standalone === true
                || document.referrer.includes('android-app://');

            setIsInstalled(isStandalone);
            return isStandalone;
        };

        const isAlreadyInstalled = checkInstalled();

        // Listen for display mode changes (when user installs the app)
        const mediaQuery = window.matchMedia('(display-mode: standalone)');
        const handleDisplayModeChange = (e) => {
            if (e.matches) {
                setIsInstalled(true);
                setIsInstallable(false);
                setInstallPrompt(null);
            }
        };

        mediaQuery.addEventListener('change', handleDisplayModeChange);

        // Listen for the beforeinstallprompt event
        const handleBeforeInstallPrompt = (e) => {
            // Prevent the mini-infobar from appearing on mobile
            e.preventDefault();
            // Store the event for later use
            setInstallPrompt(e);
            setIsInstallable(true);
            // If this event fires, the app is NOT installed (could have been uninstalled)
            // Clear the localStorage flag and reset installed state
            setIsInstalled(false);
            try {
                localStorage.removeItem('streamflix_pwa_installed');
            } catch (err) {
                console.error('Error clearing install state:', err);
            }
        };

        window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

        // Listen for successful installation
        const handleAppInstalled = () => {
            setIsInstalled(true);
            setIsInstallable(false);
            setInstallPrompt(null);
            setShowManualInstructions(false);
            // Store in localStorage to persist across sessions
            try {
                localStorage.setItem('streamflix_pwa_installed', 'true');
            } catch (e) {
                console.error('Error saving install state:', e);
            }
        };

        window.addEventListener('appinstalled', handleAppInstalled);

        // Check localStorage for previous installation
        try {
            const wasInstalled = localStorage.getItem('streamflix_pwa_installed');
            if (wasInstalled === 'true') {
                setIsInstalled(true);
            }
        } catch (e) {
            console.error('Error checking install state:', e);
        }

        // For browsers that don't support beforeinstallprompt (iOS Safari, some others),
        // enable manual instructions mode after a short delay
        // (give time for beforeinstallprompt to fire if supported)
        let nativePromptReceived = false;

        // Track if we received the native prompt
        const originalHandler = handleBeforeInstallPrompt;
        const trackingHandler = (e) => {
            nativePromptReceived = true;
            originalHandler(e);
        };

        // Replace the listener with tracking version
        window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
        window.addEventListener('beforeinstallprompt', trackingHandler);

        const fallbackTimer = setTimeout(() => {
            // Show button for all platforms if not installed and native prompt wasn't received
            if (!isAlreadyInstalled && !nativePromptReceived) {
                // Enable install button (will show manual instructions when clicked)
                setIsInstallable(true);
            }
        }, 3000); // Wait 3 seconds for native prompt

        return () => {
            window.removeEventListener('beforeinstallprompt', trackingHandler);
            window.removeEventListener('appinstalled', handleAppInstalled);
            mediaQuery.removeEventListener('change', handleDisplayModeChange);
            clearTimeout(fallbackTimer);
        };
    }, []);

    // Function to trigger the install prompt or show manual instructions
    const promptInstall = useCallback(async () => {
        // If native prompt is available, use it
        if (installPrompt) {
            try {
                installPrompt.prompt();
                const { outcome } = await installPrompt.userChoice;
                if (outcome === 'accepted') {
                    setIsInstalled(true);
                    setIsInstallable(false);
                    setInstallPrompt(null);
                    return true;
                }
                return false;
            } catch (error) {
                console.error('Error showing install prompt:', error);
                return false;
            }
        }

        // No native prompt available - show manual instructions
        setShowManualInstructions(true);
        return false;
    }, [installPrompt]);

    // Function to dismiss manual instructions
    const dismissInstructions = useCallback(() => {
        setShowManualInstructions(false);
    }, []);

    // Get platform-specific instructions
    const getInstructions = useCallback(() => {
        switch (platform) {
            case 'ios':
                return {
                    title: 'Add to Home Screen',
                    steps: [
                        'Tap the Share button (□↑) at the bottom of Safari',
                        'Scroll down and tap "Add to Home Screen"',
                        'Tap "Add" in the top right corner'
                    ],
                    icon: 'share'
                };
            case 'android':
                return {
                    title: 'Add to Home Screen',
                    steps: [
                        'Tap the menu button (⋮) in your browser',
                        'Tap "Add to Home screen" or "Install app"',
                        'Tap "Add" to confirm'
                    ],
                    icon: 'menu'
                };
            default:
                return {
                    title: 'Install App',
                    steps: [
                        'Click the install icon in your browser\'s address bar',
                        'Or open browser menu and select "Install StreamFlix"',
                        'Click "Install" to add to your desktop'
                    ],
                    icon: 'install'
                };
        }
    }, [platform]);

    return {
        isInstallable,
        isInstalled,
        promptInstall,
        showManualInstructions,
        dismissInstructions,
        getInstructions,
        platform,
        hasNativePrompt: !!installPrompt
    };
};

export default usePWAInstall;
