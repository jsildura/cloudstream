import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  AD_STATE_PENDING,
  AD_STATE_ADS,
  AD_STATE_ADFREE,
  AD_COOLDOWN_MS,
  AD_URL,
  GATE_GLOBAL_KEY,
  getAdGateState,
  setAdGateState,
  shouldSuppressAds,
  isAdGateReady,
  resolveAdGateState,
  shouldShowAds,
  maybeOpenSmartlinkAd,
  isAdFreeEntitlementValid
} from './adGating';

describe('src/utils/adGating', () => {
  beforeEach(() => {
    delete window[GATE_GLOBAL_KEY];
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('resolveAdGateState', () => {
    it('stays pending until both auth and the entitlement listener resolve', () => {
      expect(resolveAdGateState({ isAdFree: true, isAnonymous: false, loading: true })).toBe(
        AD_STATE_PENDING
      );
      expect(resolveAdGateState({ isAdFree: false, isAnonymous: false, isAuthLoading: true })).toBe(
        AD_STATE_PENDING
      );
    });

    it('resolves to adfree only for a confirmed non-anonymous entitled account', () => {
      expect(
        resolveAdGateState({
          isAdFree: true,
          isAnonymous: false,
          loading: false,
          isAuthLoading: false
        })
      ).toBe(AD_STATE_ADFREE);
    });

    it('resolves to ads for anonymous or non-entitled accounts', () => {
      expect(resolveAdGateState({ isAdFree: true, isAnonymous: true, loading: false })).toBe(
        AD_STATE_ADS
      );
      expect(resolveAdGateState({ isAdFree: false, isAnonymous: false, loading: false })).toBe(
        AD_STATE_ADS
      );
      expect(resolveAdGateState({})).toBe(AD_STATE_ADS);
    });
  });

  describe('shouldShowAds', () => {
    it('fails closed while the entitlement is unresolved', () => {
      expect(shouldShowAds({ isAdFree: true, isAnonymous: false, loading: true })).toBe(false);
      expect(shouldShowAds({ isAdFree: false, isAnonymous: false, isAuthLoading: true })).toBe(
        false
      );
    });

    it('suppresses ads for a confirmed entitled account', () => {
      expect(
        shouldShowAds({ isAdFree: true, isAnonymous: false, loading: false, isAuthLoading: false })
      ).toBe(false);
    });

    it('shows ads for resolved anonymous or non-entitled users', () => {
      expect(shouldShowAds({ isAdFree: true, isAnonymous: true, loading: false })).toBe(true);
      expect(shouldShowAds({ isAdFree: false, isAnonymous: false, loading: false })).toBe(true);
      expect(shouldShowAds({})).toBe(true);
    });
  });

  describe('gate global', () => {
    it('reads pending when the global is missing', () => {
      expect(getAdGateState()).toBe(AD_STATE_PENDING);
      expect(isAdGateReady()).toBe(false);
      expect(shouldSuppressAds()).toBe(false);
    });

    it('round-trips the resolved states', () => {
      setAdGateState(AD_STATE_ADS);
      expect(getAdGateState()).toBe(AD_STATE_ADS);
      expect(isAdGateReady()).toBe(true);
      expect(shouldSuppressAds()).toBe(false);

      setAdGateState(AD_STATE_ADFREE);
      expect(getAdGateState()).toBe(AD_STATE_ADFREE);
      expect(isAdGateReady()).toBe(true);
      expect(shouldSuppressAds()).toBe(true);
    });

    it('treats a tampered or unknown global as pending', () => {
      window[GATE_GLOBAL_KEY] = 'definitely-not-a-state';
      expect(getAdGateState()).toBe(AD_STATE_PENDING);

      setAdGateState('nonsense');
      expect(getAdGateState()).toBe(AD_STATE_PENDING);
    });
  });

  describe('maybeOpenSmartlinkAd', () => {
    let openSpy;

    beforeEach(() => {
      openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    });

    it('opens nothing and touches no storage while the gate is pending', () => {
      localStorage.setItem('hasClickedWatch', 'true');

      expect(maybeOpenSmartlinkAd()).toBe(false);
      expect(openSpy).not.toHaveBeenCalled();
      expect(localStorage.getItem('lastAdTrigger')).toBeNull();
    });

    it('opens nothing for an ad-free account', () => {
      setAdGateState(AD_STATE_ADFREE);
      localStorage.setItem('hasClickedWatch', 'true');

      expect(maybeOpenSmartlinkAd()).toBe(false);
      expect(openSpy).not.toHaveBeenCalled();
      expect(localStorage.getItem('lastAdTrigger')).toBeNull();
    });

    it('grants the very first click a grace period', () => {
      setAdGateState(AD_STATE_ADS);

      expect(maybeOpenSmartlinkAd()).toBe(false);
      expect(openSpy).not.toHaveBeenCalled();
      expect(localStorage.getItem('hasClickedWatch')).toBe('true');
    });

    it('opens the smartlink on a later click and records the cooldown', () => {
      setAdGateState(AD_STATE_ADS);
      localStorage.setItem('hasClickedWatch', 'true');

      expect(maybeOpenSmartlinkAd()).toBe(true);
      expect(openSpy).toHaveBeenCalledWith(AD_URL, '_blank');
      expect(Number(localStorage.getItem('lastAdTrigger'))).toBeGreaterThan(0);
    });

    it('respects the cooldown window', () => {
      setAdGateState(AD_STATE_ADS);
      localStorage.setItem('hasClickedWatch', 'true');
      localStorage.setItem('lastAdTrigger', String(Date.now() - 1000));

      expect(maybeOpenSmartlinkAd()).toBe(false);
      expect(openSpy).not.toHaveBeenCalled();
    });

    it('opens again once the cooldown has elapsed', () => {
      setAdGateState(AD_STATE_ADS);
      localStorage.setItem('hasClickedWatch', 'true');
      localStorage.setItem('lastAdTrigger', String(Date.now() - AD_COOLDOWN_MS - 1000));

      expect(maybeOpenSmartlinkAd()).toBe(true);
      expect(openSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('isAdFreeEntitlementValid', () => {
    it('validates key-based entitlement', () => {
      expect(
        isAdFreeEntitlementValid({
          method: 'key',
          keyHash: 'a'.repeat(64),
          activatedAt: 1720000000000
        })
      ).toBe(true);
    });

    it('validates purchase-based entitlement', () => {
      expect(
        isAdFreeEntitlementValid({
          method: 'purchase',
          keyHash: 'b'.repeat(64),
          orderId: 'ORDER-12345',
          activatedAt: 1720000000000
        })
      ).toBe(true);
    });

    it('requires a key hash for both methods, matching the RTDB validate rule', () => {
      expect(
        isAdFreeEntitlementValid({
          method: 'purchase',
          orderId: 'ORDER-12345',
          activatedAt: 1720000000000
        })
      ).toBe(false);
      expect(isAdFreeEntitlementValid({ method: 'key', activatedAt: 1720000000000 })).toBe(false);
    });

    it('rejects missing or invalid fields', () => {
      expect(isAdFreeEntitlementValid(null)).toBe(false);
      expect(isAdFreeEntitlementValid({})).toBe(false);
      expect(
        isAdFreeEntitlementValid({ method: 'invalid', keyHash: 'c'.repeat(64), activatedAt: 123 })
      ).toBe(false);
      expect(
        isAdFreeEntitlementValid({ method: 'key', keyHash: 'too-short', activatedAt: 123 })
      ).toBe(false);
      expect(
        isAdFreeEntitlementValid({
          method: 'purchase',
          keyHash: 'd'.repeat(64),
          orderId: '',
          activatedAt: 123
        })
      ).toBe(false);
      expect(
        isAdFreeEntitlementValid({
          method: 'purchase',
          keyHash: 'e'.repeat(64),
          orderId: 'ORD-1',
          activatedAt: -1
        })
      ).toBe(false);
    });
  });
});
