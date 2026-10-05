import { lazy } from 'react';

/**
 * Wraps dynamic component imports with retry and reload recovery mechanisms.
 * 
 * 1. Retries once after 500ms for transient network errors.
 * 2. On second failure, reloads the window if a reload hasn't been attempted yet.
 * 3. Prevents infinite reload loops using a sessionStorage flag keyed by path.
 *
 * @param {() => Promise<{ default: any }>} fn
 * @returns {React.LazyExoticComponent<any>}
 */
export const lazyRetry = (fn) => lazy(() =>
  fn()
    .catch(() => new Promise((resolve) => setTimeout(resolve, 500)).then(fn))
    .catch((err) => {
      if (typeof window !== 'undefined' && window.sessionStorage && window.location) {
        const key = `chunk_reload_${window.location.pathname || '/'}`;
        if (!sessionStorage.getItem(key)) {
          sessionStorage.setItem(key, '1');
          window.location.reload();
          return new Promise(() => {}); // Hold until reload takes effect
        }
      }
      throw err;
    })
);

export default lazyRetry;
