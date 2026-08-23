import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { AdFreeProvider, useAdFree } from './AdFreeContext';
import * as AuthContextModule from './AuthContext';
import * as firebaseModule from '../lib/firebase';
import { AD_STATE_PENDING, AD_STATE_ADS, AD_STATE_ADFREE, GATE_GLOBAL_KEY } from '../utils/adGating';

const KEY_HASH = 'a'.repeat(64);

const validPurchaseEntitlement = {
  method: 'purchase',
  keyHash: KEY_HASH,
  orderId: 'ORDER-12345',
  activatedAt: 1720000000000
};

describe('src/contexts/AdFreeContext', () => {
  let mockDbRef;
  let mockListeners;

  beforeEach(() => {
    vi.restoreAllMocks();
    delete window[GATE_GLOBAL_KEY];
    mockListeners = {};
    mockDbRef = {
      on: vi.fn((event, callback, errorCallback) => {
        mockListeners[event] = callback;
        mockListeners[`${event}:error`] = errorCallback;
      }),
      off: vi.fn((event) => {
        delete mockListeners[event];
      }),
      once: vi.fn().mockResolvedValue({
        val: () => null
      })
    };

    vi.spyOn(firebaseModule, 'initFirebase').mockReturnValue({
      db: {
        ref: vi.fn(() => mockDbRef)
      }
    });
  });

  const wrapper = ({ children }) => <AdFreeProvider>{children}</AdFreeProvider>;

  const signIn = (overrides = {}) => {
    const mockUser = {
      uid: 'google-user-123',
      getIdToken: vi.fn().mockResolvedValue('token-123'),
      ...overrides
    };
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      accountUser: mockUser,
      isAuthLoading: false
    });
    return mockUser;
  };

  it('provides default false state for unauthenticated or anonymous user', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      accountUser: null,
      isAuthLoading: false
    });

    const { result } = renderHook(() => useAdFree(), { wrapper });

    expect(result.current.isAdFree).toBe(false);
    expect(result.current.adFreeData).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.adGateState).toBe(AD_STATE_ADS);
  });

  it('holds the gate pending while auth is still initializing', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      accountUser: null,
      isAuthLoading: true
    });

    const { result } = renderHook(() => useAdFree(), { wrapper });

    expect(result.current.adGateState).toBe(AD_STATE_PENDING);
    expect(window[GATE_GLOBAL_KEY]).toBe(AD_STATE_PENDING);
  });

  it('subscribes to RTDB and updates state when Google account has ad-free entitlement', () => {
    signIn();
    const { result } = renderHook(() => useAdFree(), { wrapper });

    expect(mockDbRef.on).toHaveBeenCalledWith('value', expect.any(Function), expect.any(Function));

    // The entitlement is unknown until the listener fires.
    expect(result.current.adGateState).toBe(AD_STATE_PENDING);

    act(() => {
      mockListeners['value']({ val: () => validPurchaseEntitlement });
    });

    expect(result.current.isAdFree).toBe(true);
    expect(result.current.adFreeData).toEqual(validPurchaseEntitlement);
    expect(result.current.loading).toBe(false);
    expect(result.current.adGateState).toBe(AD_STATE_ADFREE);
    expect(window[GATE_GLOBAL_KEY]).toBe(AD_STATE_ADFREE);
  });

  it('ignores an entitlement record that fails validation', () => {
    signIn();
    const { result } = renderHook(() => useAdFree(), { wrapper });

    act(() => {
      // No keyHash: the RTDB validate rule would never accept this record.
      mockListeners['value']({
        val: () => ({ method: 'purchase', orderId: 'ORDER-1', activatedAt: 1720000000000 })
      });
    });

    expect(result.current.isAdFree).toBe(false);
    expect(result.current.adFreeData).toBeNull();
    expect(result.current.adGateState).toBe(AD_STATE_ADS);
  });

  it('keeps the gate pending when the entitlement read fails', () => {
    signIn();
    const { result } = renderHook(() => useAdFree(), { wrapper });

    vi.spyOn(console, 'warn').mockImplementation(() => {});

    act(() => {
      mockListeners['value:error'](new Error('PERMISSION_DENIED'));
    });

    expect(result.current.error).toBe('PERMISSION_DENIED');
    // Unknown entitlement must not resolve to `ads` — that would show ads to a
    // paying account whose read merely failed.
    expect(result.current.adGateState).toBe(AD_STATE_PENDING);
    expect(window[GATE_GLOBAL_KEY]).toBe(AD_STATE_PENDING);
  });

  it('handles redeemKey flow', async () => {
    signIn();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true, activatedAt: 1720000000000 })
      })
    );

    const { result } = renderHook(() => useAdFree(), { wrapper });

    let redeemResult;
    await act(async () => {
      redeemResult = await result.current.redeemKey('SFXAD-A2B3C-D4E5F-G6H7J');
    });

    expect(redeemResult.ok).toBe(true);
    expect(fetch).toHaveBeenCalledWith(
      '/api/redeem-key',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer token-123'
        }),
        body: JSON.stringify({ key: 'SFXAD-A2B3C-D4E5F-G6H7J' })
      })
    );
  });

  it('sends the request id so a purchase retry resumes the same activation', async () => {
    signIn();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true, activatedAt: 1720000000000 })
      })
    );

    const { result } = renderHook(() => useAdFree(), { wrapper });

    await act(async () => {
      await result.current.completePayPalPurchase('ORDER-12345', 'req-abcdef123456');
    });

    expect(fetch).toHaveBeenCalledWith(
      '/api/purchase-adfree',
      expect.objectContaining({
        body: JSON.stringify({ orderId: 'ORDER-12345', requestId: 'req-abcdef123456' })
      })
    );
  });

  it('generateKeys rejects a count outside 1-25 without calling the API', async () => {
    signIn();
    vi.stubGlobal('fetch', vi.fn());

    const { result } = renderHook(() => useAdFree(), { wrapper });

    let outcome;
    await act(async () => {
      outcome = await result.current.generateKeys(26);
    });

    expect(outcome).toMatchObject({ ok: false, reason: 'invalid-count' });

    await act(async () => {
      outcome = await result.current.generateKeys(2.5);
    });

    expect(outcome).toMatchObject({ ok: false, reason: 'invalid-count' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('generateKeys posts the count with a bearer token and returns the keys', async () => {
    signIn();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true, keys: ['SFXAD-AAAAA-BBBBB-CCCCC'] })
      })
    );

    const { result } = renderHook(() => useAdFree(), { wrapper });

    let outcome;
    await act(async () => {
      outcome = await result.current.generateKeys(1);
    });

    expect(outcome).toEqual({ ok: true, keys: ['SFXAD-AAAAA-BBBBB-CCCCC'] });
    expect(fetch).toHaveBeenCalledWith(
      '/api/generate-adfree-keys',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer token-123' }),
        body: JSON.stringify({ count: 1 })
      })
    );
  });

  it('generateKeys surfaces a server rejection reason', async () => {
    signIn();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ ok: false, reason: 'admin-required', message: 'Admin only' })
      })
    );

    const { result } = renderHook(() => useAdFree(), { wrapper });

    let outcome;
    await act(async () => {
      outcome = await result.current.generateKeys(3);
    });

    expect(outcome).toMatchObject({ ok: false, reason: 'admin-required', error: 'Admin only' });
  });
});
