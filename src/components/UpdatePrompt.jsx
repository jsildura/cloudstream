import { useRegisterSW } from 'virtual:pwa-register/react';
import './UpdatePrompt.css';

/**
 * Shows a small toast when a new service-worker version is available (registerType: 'prompt').
 * Clicking "Update" activates the new SW and refreshes the page.
 */
export default function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(swUrl, registration) {
      // Check for updates every hour while the app stays open.
      if (registration) {
        setInterval(() => registration.update(), 60 * 60 * 1000);
      }
    },
    onRegisterError(error) {
      console.error('SW registration error:', error);
    },
  });

  if (!needRefresh) return null;

  const close = () => {
    setNeedRefresh(false);
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
        onClick={() => updateServiceWorker(true)}
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
