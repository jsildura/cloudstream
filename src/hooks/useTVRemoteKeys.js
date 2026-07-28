/**
 * TV Remote Keys Hook
 *
 * Maps hardware remote-control buttons (Back, Play/Pause, media transport)
 * to application-level actions. Mounted once in App.jsx alongside
 * useTVNavigation.
 *
 * Key handling:
 *   - Back (Backspace / XF86Back / Tizen 10009 / webOS 461)
 *       → If a data-nav-trap is open, fires Escape to close it.
 *       → Else, calls navigate(-1).
 *   - MediaPlayPause / MediaStop / MediaTrackNext / MediaTrackPrevious /
 *     MediaFastForward / MediaRewind
 *       → Dispatches custom DOM events on document so any active player
 *         can subscribe without coupling to this hook.
 */

import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const BACK_KEYS = new Set(['Backspace', 'XF86Back']);
const BACK_KEYCODES = new Set([10009, 461]);

const MEDIA_KEY_MAP = {
    'MediaPlayPause': 'tv:playpause',
    'MediaPlay': 'tv:playpause',
    'MediaPause': 'tv:playpause',
    'MediaStop': 'tv:stop',
    'MediaTrackNext': 'tv:next',
    'MediaTrackPrevious': 'tv:prev',
    'MediaFastForward': 'tv:seekfwd',
    'MediaRewind': 'tv:seekback',
};

const useTVRemoteKeys = ({ enabled = true } = {}) => {
    const navigate = useNavigate();

    useEffect(() => {
        if (!enabled) return;

        const handleKeyDown = (e) => {
            const isTextInput = e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA';

            // --- Back button ---
            if (BACK_KEYS.has(e.key) || BACK_KEYCODES.has(e.keyCode)) {
                if (isTextInput) return;

                e.preventDefault();

                const trap = document.querySelector('[data-nav-trap]');
                if (trap) {
                    document.activeElement?.blur();
                    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
                    return;
                }

                navigate(-1);
                return;
            }

            // --- Media transport keys ---
            const customEvent = MEDIA_KEY_MAP[e.key];
            if (customEvent) {
                e.preventDefault();
                document.dispatchEvent(new CustomEvent(customEvent));
                return;
            }

            // --- Numeric keypad channel entry (keyCode 179 for play/pause on some remotes) ---
            if (e.keyCode === 179) {
                e.preventDefault();
                document.dispatchEvent(new CustomEvent('tv:playpause'));
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [enabled, navigate]);
};

export default useTVRemoteKeys;
