import { useRegisterSW } from 'virtual:pwa-register/react';

/**
 * Shows a small toast when a new service-worker version is available (registerType: 'prompt').
 * Clicking "Reload" activates the new SW and refreshes the page.
 * Also surfaces a brief "ready to work offline" confirmation on first install.
 */
export default function UpdatePrompt() {
  const {
    offlineReady: [offlineReady, setOfflineReady],
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

  if (!offlineReady && !needRefresh) return null;

  const close = () => {
    setOfflineReady(false);
    setNeedRefresh(false);
  };

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        left: '50%',
        bottom: '24px',
        transform: 'translateX(-50%)',
        zIndex: 100000,
        maxWidth: '92vw',
        display: 'flex',
        alignItems: 'center',
        gap: '14px',
        padding: '12px 16px',
        background: '#181818',
        color: '#fff',
        border: '1px solid #2a2a2a',
        borderRadius: '10px',
        boxShadow: '0 8px 30px rgba(0,0,0,0.55)',
        fontSize: '14px',
      }}
    >
      <span>
        {needRefresh
          ? 'A new version of STREAMFLIX is available.'
          : 'STREAMFLIX is ready to work offline.'}
      </span>

      {needRefresh && (
        <button
          onClick={() => updateServiceWorker(true)}
          style={{
            background: '#e50914',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            padding: '7px 14px',
            fontWeight: 600,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          Reload
        </button>
      )}

      <button
        onClick={close}
        aria-label="Dismiss"
        style={{
          background: 'transparent',
          color: '#aaa',
          border: 'none',
          fontSize: '18px',
          lineHeight: 1,
          cursor: 'pointer',
          padding: '2px 4px',
        }}
      >
        ×
      </button>
    </div>
  );
}
