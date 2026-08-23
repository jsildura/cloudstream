/**
 * Ad Gating Utility
 *
 * Owns the tri-state ad gate that every ad surface reads:
 *
 * - `pending`: auth and/or the RTDB entitlement listener has not resolved yet.
 * - `ads`:     resolved anonymous or resolved non-entitled account.
 * - `adfree`:  resolved Google account with a valid entitlement.
 *
 * The gate fails closed: no ad action fires while the state is `pending`, so a
 * paying account never receives an ad during the initial entitlement window.
 * Ads resume for non-entitled users as soon as the state resolves to `ads`.
 *
 * The state is mirrored onto `window.__STREAMFLIX_AD_STATE` so non-React ad
 * handlers can read it synchronously at click time.
 */

export const AD_STATE_PENDING = 'pending';
export const AD_STATE_ADS = 'ads';
export const AD_STATE_ADFREE = 'adfree';

export const GATE_GLOBAL_KEY = '__STREAMFLIX_AD_STATE';

/** Adsterra smartlink shared by every play / watch-now surface. */
export const AD_URL =
  'https://consumptionbackwardsentiments.com/kjy2d6bi?key=b2d063ec2be89ba5e928fdd367071bbd';
export const AD_COOLDOWN_MS = 2 * 60 * 1000; // 2 minutes

const FIRST_CLICK_STORAGE_KEY = 'hasClickedWatch';
const LAST_TRIGGER_STORAGE_KEY = 'lastAdTrigger';

const readStorage = (key) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const writeStorage = (key, value) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private-mode / quota errors must never block navigation
  }
};

/**
 * Reads the current gate state. Anything unrecognized reads as `pending` so a
 * missing or tampered global fails closed.
 *
 * @returns {'pending'|'ads'|'adfree'}
 */
export function getAdGateState() {
  if (typeof window === 'undefined') return AD_STATE_PENDING;
  const state = window[GATE_GLOBAL_KEY];
  return state === AD_STATE_ADS || state === AD_STATE_ADFREE ? state : AD_STATE_PENDING;
}

/**
 * Publishes the gate state for non-React ad handlers.
 *
 * @param {'pending'|'ads'|'adfree'} state
 */
export function setAdGateState(state) {
  if (typeof window === 'undefined') return;
  window[GATE_GLOBAL_KEY] =
    state === AD_STATE_ADS || state === AD_STATE_ADFREE ? state : AD_STATE_PENDING;
}

/** True only for a resolved, entitled account. */
export function shouldSuppressAds() {
  return getAdGateState() === AD_STATE_ADFREE;
}

/** True once auth and the entitlement listener have resolved. */
export function isAdGateReady() {
  return getAdGateState() !== AD_STATE_PENDING;
}

/**
 * Derives the gate state from auth/entitlement inputs.
 *
 * @param {Object} params
 * @param {boolean} [params.isAdFree=false] Whether a valid entitlement is loaded
 * @param {boolean} [params.isAnonymous=true] Whether the user is anonymous
 * @param {boolean} [params.loading=false] Whether the entitlement listener is unresolved
 * @param {boolean} [params.isAuthLoading=false] Whether auth state is initializing
 * @returns {'pending'|'ads'|'adfree'}
 */
export function resolveAdGateState({
  isAdFree = false,
  isAnonymous = true,
  loading = false,
  isAuthLoading = false
} = {}) {
  if (loading || isAuthLoading) return AD_STATE_PENDING;
  if (!isAnonymous && isAdFree === true) return AD_STATE_ADFREE;
  return AD_STATE_ADS;
}

/**
 * Whether ads may be shown for the given auth/entitlement inputs.
 * Fail-closed: `false` while unresolved, `false` when entitled.
 *
 * @param {Object} params See {@link resolveAdGateState}
 * @returns {boolean}
 */
export function shouldShowAds(params) {
  return resolveAdGateState(params) === AD_STATE_ADS;
}

/**
 * Shared smartlink behavior for every play / watch-now handler.
 *
 * Suppressed (`adfree`) and unresolved (`pending`) states touch no cooldown
 * storage and open no window. For a resolved `ads` user the first click ever is
 * a grace period, then the smartlink opens at most once per cooldown window.
 *
 * Callers must perform their normal navigation regardless of the return value.
 *
 * @returns {boolean} true when the smartlink was opened
 */
export function maybeOpenSmartlinkAd() {
  if (shouldSuppressAds() || !isAdGateReady()) return false;

  if (readStorage(FIRST_CLICK_STORAGE_KEY) !== 'true') {
    writeStorage(FIRST_CLICK_STORAGE_KEY, 'true');
    return false;
  }

  const lastAdTime = parseInt(readStorage(LAST_TRIGGER_STORAGE_KEY) || '0', 10);
  const now = Date.now();
  if (now - lastAdTime < AD_COOLDOWN_MS) return false;

  window.open(AD_URL, '_blank');
  writeStorage(LAST_TRIGGER_STORAGE_KEY, now.toString());
  return true;
}

/**
 * Validates the structure and integrity of an adFree entitlement record.
 * Mirrors the `.validate` rule on `/accounts/$uid/adFree`: both activation
 * methods carry an HMAC key hash.
 *
 * @param {Object|null} adFree
 * @returns {boolean}
 */
export function isAdFreeEntitlementValid(adFree) {
  if (!adFree || typeof adFree !== 'object') return false;

  if (typeof adFree.activatedAt !== 'number' || adFree.activatedAt <= 0) {
    return false;
  }

  const hasKeyHash =
    typeof adFree.keyHash === 'string' && /^[0-9a-f]{64}$/i.test(adFree.keyHash);
  if (!hasKeyHash) return false;

  if (adFree.method === 'key') return true;

  if (adFree.method === 'purchase') {
    return (
      typeof adFree.orderId === 'string' &&
      adFree.orderId.length > 0 &&
      adFree.orderId.length <= 128
    );
  }

  return false;
}
