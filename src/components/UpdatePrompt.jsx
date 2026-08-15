import { useEffect, useRef } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import './UpdatePrompt.css';

/**
 * Shows a small toast when a new service-worker version is available (registerType: 'prompt').
 * Clicking "Update" activates the new SW and refreshes the page.
 */
export default function UpdatePrompt() {
  const intervalRef = useRef(null);
  const timeoutRef = useRef(null);
  const controllerHandlerRef = useRef(null);

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(swUrl, registration) {
      // Check for updates every hour while the app stays open.
      if (registration) {
        intervalRef.current = setInterval(() => registration.update(), 60 * 60 * 1000);
      }
    },
    onRegisterError(error) {
      console.error('SW registration error:', error);
    },
  });

  // Clean up interval, timeout, and event listener on unmount.
  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (controllerHandlerRef.current) {
        navigator.serviceWorker?.removeEventListener(
          'controllerchange', controllerHandlerRef.current
        );
      }
    };
  }, []);

  // The bundled useRegisterSW reloads the page only when the new service
  // worker takes control (workbox-window `controlling` + isUpdate), which can
  // silently fail and leave this toast stuck with a dead Update button.
  // Instead of a blind timeout, listen for `controllerchange` directly — it
  // fires the instant the new SW takes control, regardless of `isUpdate`.
  // A longer timeout (4 s) acts as a true last-resort fallback if the
  // controllerchange event never arrives.
  const reloadedRef = useRef(false);

  if (!needRefresh) return null;

  const close = () => {
    setNeedRefresh(false);
  };

  const handleUpdate = () => {
    if (reloadedRef.current) return;

    // Reload the moment the new SW actually takes control (bypasses isUpdate).
    controllerHandlerRef.current = () => {
      if (!reloadedRef.current) {
        reloadedRef.current = true;
        window.location.reload();
      }
    };
    navigator.serviceWorker?.addEventListener('controllerchange', controllerHandlerRef.current);

    updateServiceWorker(true);

    // True last-resort fallback: only fires if controllerchange never comes.
    timeoutRef.current = setTimeout(() => {
      if (!reloadedRef.current) {
        reloadedRef.current = true;
        window.location.reload();
      }
    }, 4000);
  };

  return (
    <div className="update-prompt" role="status" aria-live="polite">
      <span className="update-prompt-badge" aria-hidden="true">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
      </span>

      <span className="update-prompt-text">
        <span className="update-prompt-title">Update available</span>
        <span className="update-prompt-message">A new version of STREAMFLIX is out.</span>
      </span>

      <button
        className="update-prompt-reload"
        onClick={handleUpdate}
      >
        Update
      </button>

      <button
        className="update-prompt-close"
        onClick={close}
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  );
}

