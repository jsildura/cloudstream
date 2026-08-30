import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from './AuthContext';
import { initFirebase } from '../lib/firebase';
import {
  AD_STATE_PENDING,
  isAdFreeEntitlementValid,
  resolveAdGateState,
  setAdGateState
} from '../utils/adGating';

const AdFreeContext = createContext({
  isAdFree: false,
  adFreeData: null,
  loading: true,
  error: null,
  adGateState: AD_STATE_PENDING,
  redeemKey: async () => ({ ok: false, reason: 'uninitialized' }),
  createPayPalOrder: async () => ({ ok: false, reason: 'uninitialized' }),
  completePayPalPurchase: async () => ({ ok: false, reason: 'uninitialized' }),
  generateKeys: async () => ({ ok: false, reason: 'uninitialized' }),
  refreshAdFreeStatus: async () => {}
});

export const useAdFree = () => useContext(AdFreeContext);

export const AdFreeProvider = ({ children }) => {
  const { accountUser, isAuthLoading } = useAuth();
  const [adFreeData, setAdFreeData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadedUid, setLoadedUid] = useState(null);
  const [error, setError] = useState(null);

  // Subscribe to RTDB account entitlement
  useEffect(() => {
    if (isAuthLoading) {
      setLoading(true);
      return;
    }

    if (!accountUser || !accountUser.uid) {
      setAdFreeData(null);
      setLoadedUid(null);
      setLoading(false);
      setError(null);
      return;
    }

    let isMounted = true;
    let unsubscribe = null;

    try {
      const { db } = initFirebase();
      const adFreeRef = db.ref(`accounts/${accountUser.uid}/adFree`);

      setLoading(true);

      const onValueChange = (snapshot) => {
        if (!isMounted) return;
        const val = snapshot.val();
        if (val && isAdFreeEntitlementValid(val)) {
          setAdFreeData(val);
        } else {
          setAdFreeData(null);
        }
        setLoadedUid(accountUser.uid);
        setLoading(false);
        setError(null);
      };

      const onError = (err) => {
        if (!isMounted) return;
        console.warn('AdFree subscription error:', err);
        setError(err.message || 'Failed to read ad-free status');
        setLoadedUid(accountUser.uid);
        setLoading(false);
      };

      adFreeRef.on('value', onValueChange, onError);

      unsubscribe = () => {
        adFreeRef.off('value', onValueChange);
      };
    } catch (err) {
      if (isMounted) {
        setError(err.message || 'Firebase initialization failed');
        setLoading(false);
      }
    }

    return () => {
      isMounted = false;
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [accountUser, isAuthLoading]);

  const redeemKey = useCallback(
    async (rawKey) => {
      if (!accountUser) {
        return {
          ok: false,
          reason: 'auth-required',
          error: 'Please sign in with Google to redeem an ad-free key'
        };
      }

      try {
        const idToken = await accountUser.getIdToken();
        const res = await fetch('/api/redeem-key', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${idToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ key: rawKey })
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.ok) {
          return {
            ok: false,
            reason: data.reason || 'redemption-failed',
            error: data.message || data.error || 'Failed to redeem key'
          };
        }

        return { ok: true, activatedAt: data.activatedAt };
      } catch (err) {
        return {
          ok: false,
          reason: 'network-error',
          error: err.message || 'Network error while redeeming key'
        };
      }
    },
    [accountUser]
  );

  const createPayPalOrder = useCallback(async () => {
    if (!accountUser) {
      return {
        ok: false,
        reason: 'auth-required',
        error: 'Please sign in with Google to purchase ad-free access'
      };
    }

    try {
      const idToken = await accountUser.getIdToken();
      const res = await fetch('/api/create-adfree-order', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${idToken}`,
          'Content-Type': 'application/json'
        }
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok || !data.orderId) {
        return {
          ok: false,
          reason: data.reason || 'order-creation-failed',
          error: data.message || data.error || 'Failed to create PayPal order'
        };
      }

      return { ok: true, orderId: data.orderId, checkoutUrl: data.checkoutUrl };
    } catch (err) {
      return {
        ok: false,
        reason: 'network-error',
        error: err.message || 'Network error while creating PayPal order'
      };
    }
  }, [accountUser]);

  const completePayPalPurchase = useCallback(
    async (orderId, requestId) => {
      if (!accountUser) {
        return {
          ok: false,
          reason: 'auth-required',
          error: 'Please sign in with Google to complete purchase'
        };
      }

      try {
        const idToken = await accountUser.getIdToken();
        const res = await fetch('/api/purchase-adfree', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${idToken}`,
            'Content-Type': 'application/json'
          },
          // The request id lets the server resume this exact activation on a
          // retry instead of treating it as a replay of a different request.
          body: JSON.stringify(requestId ? { orderId, requestId } : { orderId })
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.ok) {
          return {
            ok: false,
            reason: data.reason || 'purchase-failed',
            error: data.message || data.error || 'Failed to complete ad-free purchase'
          };
        }

        return { ok: true, activatedAt: data.activatedAt };
      } catch (err) {
        return {
          ok: false,
          reason: 'network-error',
          error: err.message || 'Network error while completing purchase'
        };
      }
    },
    [accountUser]
  );

  const generateKeys = useCallback(
    async (count) => {
      if (!accountUser) {
        return {
          ok: false,
          reason: 'auth-required',
          error: 'Please sign in with Google to generate keys'
        };
      }

      if (!Number.isInteger(count) || count < 1 || count > 25) {
        return {
          ok: false,
          reason: 'invalid-count',
          error: 'Count must be a whole number between 1 and 25'
        };
      }

      try {
        const idToken = await accountUser.getIdToken();
        const res = await fetch('/api/generate-adfree-keys', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${idToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ count })
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.ok || !Array.isArray(data.keys)) {
          return {
            ok: false,
            reason: data.reason || 'generation-failed',
            error: data.message || data.error || 'Failed to generate keys'
          };
        }

        return { ok: true, keys: data.keys };
      } catch (err) {
        return {
          ok: false,
          reason: 'network-error',
          error: err.message || 'Network error while generating keys'
        };
      }
    },
    [accountUser]
  );

  const refreshAdFreeStatus = useCallback(async () => {
    if (!accountUser) return;
    try {
      const { db } = initFirebase();
      const snap = await db.ref(`accounts/${accountUser.uid}/adFree`).once('value');
      const val = snap.val();
      if (val && isAdFreeEntitlementValid(val)) {
        setAdFreeData(val);
      } else {
        setAdFreeData(null);
      }
    } catch {
      // Ignored: real-time listener will maintain state
    }
  }, [accountUser]);

  const isAdFree = useMemo(() => {
    return Boolean(accountUser && adFreeData && isAdFreeEntitlementValid(adFreeData));
  }, [accountUser, adFreeData]);

  // A read failure leaves the entitlement genuinely unknown, so it counts as
  // unresolved: the gate stays `pending` and no ad action fires.
  const isEntitlementPending = Boolean(accountUser && accountUser.uid && loadedUid !== accountUser.uid);
  const adGateState = resolveAdGateState({
    isAdFree,
    isAnonymous: !accountUser,
    loading: loading || isEntitlementPending || Boolean(error),
    isAuthLoading
  });

  // Published during render, not from an effect: child effects run before
  // parent effects, so an effect here would let an ad surface read a stale gate
  // on first paint.
  setAdGateState(adGateState);

  const value = useMemo(
    () => ({
      isAdFree,
      adFreeData,
      loading: isAuthLoading || loading,
      error,
      adGateState,
      redeemKey,
      createPayPalOrder,
      completePayPalPurchase,
      generateKeys,
      refreshAdFreeStatus
    }),
    [
      isAdFree,
      adFreeData,
      isAuthLoading,
      loading,
      error,
      adGateState,
      redeemKey,
      createPayPalOrder,
      completePayPalPurchase,
      generateKeys,
      refreshAdFreeStatus
    ]
  );

  return <AdFreeContext.Provider value={value}>{children}</AdFreeContext.Provider>;
};
