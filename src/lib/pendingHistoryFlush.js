/**
 * Module-level registry for the active ProfileDataProvider's pending-write flush.
 *
 * AuthProvider sits above ProfileDataProvider (src/main.jsx), so it cannot reach the
 * flush through context. Sign-out still has to persist queued watch progress while
 * the account token is valid — afterwards the security rules reject the write and the
 * entry is dropped. The provider registers its flush here and AuthContext awaits it.
 *
 * A neutral module (rather than an import from ProfileDataContext) keeps AuthContext
 * and ProfileDataContext free of a circular import.
 */

const FLUSH_TIMEOUT_MS = 1500;

let flushHandler = null;

/**
 * Registers the active flush implementation.
 * @param {(() => Promise<void>) | null} handler
 * @returns {() => void} Unregister function, safe to use as an effect cleanup
 */
export function registerPendingHistoryFlush(handler) {
  flushHandler = typeof handler === 'function' ? handler : null;
  return () => {
    if (flushHandler === handler) {
      flushHandler = null;
    }
  };
}

/**
 * Runs the registered flush, bounded by a timeout so an unreachable database cannot
 * stall sign-out (Realtime Database write promises stay pending while offline).
 * Never rejects.
 * @returns {Promise<void>}
 */
export async function flushPendingHistoryBeforeSignOut() {
  if (typeof flushHandler !== 'function') return;

  try {
    await Promise.race([
      flushHandler(),
      new Promise((resolve) => { setTimeout(resolve, FLUSH_TIMEOUT_MS); })
    ]);
  } catch (err) {
    console.error('[PendingHistoryFlush] Flush before sign-out failed:', err);
  }
}
