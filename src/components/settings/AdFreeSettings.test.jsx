import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AdFreeSettings from './AdFreeSettings';
import * as AuthContextModule from '../../contexts/AuthContext';
import * as AdFreeContextModule from '../../contexts/AdFreeContext';
import * as ToastContextModule from '../../contexts/ToastContext';

describe('AdFreeSettings Component', () => {
  const mockShowSuccess = vi.fn();
  const mockShowError = vi.fn();
  const mockSignInWithGoogle = vi.fn();
  const mockRedeemKey = vi.fn();
  const mockCreatePayPalOrder = vi.fn();
  const mockCompletePayPalPurchase = vi.fn();

  beforeEach(() => {
    vi.restoreAllMocks();
    mockShowSuccess.mockReset();
    mockShowError.mockReset();
    mockSignInWithGoogle.mockReset();
    mockRedeemKey.mockReset();
    mockCreatePayPalOrder.mockReset();
    mockCompletePayPalPurchase.mockReset();

    vi.spyOn(ToastContextModule, 'useToast').mockReturnValue({
      showSuccess: mockShowSuccess,
      showError: mockShowError
    });
  });

  it('renders unauthenticated sign-in prompt when no Google account is connected', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      accountUser: null,
      isSignedIn: false,
      signInWithGoogle: mockSignInWithGoogle
    });

    vi.spyOn(AdFreeContextModule, 'useAdFree').mockReturnValue({
      isAdFree: false,
      adFreeData: null,
      loading: false
    });

    render(<AdFreeSettings onClose={() => {}} />);

    expect(screen.getByText('Disable Ads')).toBeInTheDocument();
    expect(screen.getByText(/No Popunders or Redirects/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sign in with Google/i })).toBeInTheDocument();

    // The entitlement cannot touch ads inside the embedded third-party players,
    // so the offer must never be presented as "no ads anywhere".
    expect(screen.queryByText(/Disable All Ads/i)).not.toBeInTheDocument();
  });

  it('renders upgrade and redeem options when Google account is connected but not ad-free', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      accountUser: { email: 'user@example.com', displayName: 'Test User' },
      isSignedIn: true,
      signInWithGoogle: mockSignInWithGoogle
    });

    vi.spyOn(AdFreeContextModule, 'useAdFree').mockReturnValue({
      isAdFree: false,
      adFreeData: null,
      loading: false,
      redeemKey: mockRedeemKey,
      createPayPalOrder: mockCreatePayPalOrder,
      completePayPalPurchase: mockCompletePayPalPurchase
    });

    render(<AdFreeSettings onClose={() => {}} />);

    expect(screen.getByText('$2.99')).toBeInTheDocument();
    expect(screen.getByText('USD')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Purchase Ad-Free/i })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('SFXAD-XXXXX-XXXXX-XXXXX')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Redeem Key/i })).toBeInTheDocument();

    // The anti-adblock gate is part of what the entitlement actually turns off.
    expect(screen.getByText(/no anti-adblock gate/i)).toBeInTheDocument();
    expect(screen.queryByText(/video overlay ads/i)).not.toBeInTheDocument();
  });

  it('auto-formats key input and handles redemption submission', async () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      accountUser: { email: 'user@example.com', displayName: 'Test User' },
      isSignedIn: true,
      signInWithGoogle: mockSignInWithGoogle
    });

    mockRedeemKey.mockResolvedValue({ ok: true, activatedAt: 1720000000000 });

    vi.spyOn(AdFreeContextModule, 'useAdFree').mockReturnValue({
      isAdFree: false,
      adFreeData: null,
      loading: false,
      redeemKey: mockRedeemKey,
      createPayPalOrder: mockCreatePayPalOrder,
      completePayPalPurchase: mockCompletePayPalPurchase
    });

    render(<AdFreeSettings onClose={() => {}} />);

    const input = screen.getByPlaceholderText('SFXAD-XXXXX-XXXXX-XXXXX');
    fireEvent.change(input, { target: { value: 'A2B3CD4E5FG6H7J' } });

    expect(input.value).toBe('SFXAD-A2B3C-D4E5F-G6H7J');

    const redeemBtn = screen.getByRole('button', { name: /Redeem Key/i });
    expect(redeemBtn).not.toBeDisabled();

    fireEvent.click(redeemBtn);

    await waitFor(() => {
      expect(mockRedeemKey).toHaveBeenCalledWith('SFXAD-A2B3C-D4E5F-G6H7J');
      expect(mockShowSuccess).toHaveBeenCalled();
    });
  });

  it('renders active lifetime ad-free badge when user is ad-free', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      accountUser: { email: 'user@example.com', displayName: 'Test User' },
      isSignedIn: true,
      signInWithGoogle: mockSignInWithGoogle
    });

    vi.spyOn(AdFreeContextModule, 'useAdFree').mockReturnValue({
      isAdFree: true,
      adFreeData: {
        method: 'purchase',
        keyHash: 'a'.repeat(64),
        orderId: 'ORDER-12345678',
        activatedAt: 1720000000000
      },
      loading: false
    });

    render(<AdFreeSettings onClose={() => {}} />);

    expect(screen.getByText('Lifetime Ad-Free Active')).toBeInTheDocument();
    expect(screen.getByText('PayPal Purchase ($2.99)')).toBeInTheDocument();
    expect(screen.getByText('ORDER-12345678')).toBeInTheDocument();
  });

  describe('PayPal purchase flow', () => {
    const signedIn = () => {
      vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
        accountUser: { email: 'user@example.com', displayName: 'Test User' },
        isSignedIn: true,
        signInWithGoogle: mockSignInWithGoogle
      });
      vi.spyOn(AdFreeContextModule, 'useAdFree').mockReturnValue({
        isAdFree: false,
        adFreeData: null,
        loading: false,
        redeemKey: mockRedeemKey,
        createPayPalOrder: mockCreatePayPalOrder,
        completePayPalPurchase: mockCompletePayPalPurchase
      });
    };

    it('opens sandbox checkout and captures with an order-derived requestId', async () => {
      signedIn();
      mockCreatePayPalOrder.mockResolvedValue({
        ok: true,
        orderId: '5O190127TN364715T',
        checkoutUrl: 'https://www.sandbox.paypal.com/checkoutnow?token=5O190127TN364715T'
      });
      mockCompletePayPalPurchase.mockResolvedValue({ ok: true });

      // Closed straight away so the popup poll fires on its first tick.
      const popup = { closed: true };
      const openSpy = vi.spyOn(window, 'open').mockReturnValue(popup);

      render(<AdFreeSettings onClose={() => {}} />);
      fireEvent.click(screen.getByRole('button', { name: /Purchase Ad-Free/i }));

      await waitFor(() => expect(openSpy).toHaveBeenCalled());

      // VITE_PAYPAL_ENV is unset under test, so checkout must be the sandbox host.
      expect(openSpy.mock.calls[0][0]).toBe(
        'https://www.sandbox.paypal.com/checkoutnow?token=5O190127TN364715T'
      );

      // The requestId must be derived from the order, not random, so a retry
      // resumes the server-side reservation instead of colliding with it.
      await waitFor(() =>
        expect(mockCompletePayPalPurchase).toHaveBeenCalledWith(
          '5O190127TN364715T',
          'adfree-5O190127TN364715T'
        )
      );
      expect(mockShowSuccess).toHaveBeenCalledWith(
        'Payment verified! Lifetime Ad-Free is now active.'
      );
    });

    it('follows the server to the live host even though the build says sandbox', async () => {
      signedIn();
      // The exact live-mode failure: PAYPAL_ENV=live on the server mints a live
      // order id, while VITE_PAYPAL_ENV is baked sandbox into the bundle. Built
      // client-side that URL goes to sandbox/checkoutnow, where the token does
      // not exist — PayPal answers "Things don't appear to be working at the
      // moment" and nothing is charged.
      mockCreatePayPalOrder.mockResolvedValue({
        ok: true,
        orderId: '26J86727T2545091L',
        checkoutUrl: 'https://www.paypal.com/checkoutnow?token=26J86727T2545091L'
      });
      mockCompletePayPalPurchase.mockResolvedValue({ ok: true });

      const openSpy = vi.spyOn(window, 'open').mockReturnValue({ closed: true });

      render(<AdFreeSettings onClose={() => {}} />);
      fireEvent.click(screen.getByRole('button', { name: /Purchase Ad-Free/i }));

      await waitFor(() => expect(openSpy).toHaveBeenCalled());
      expect(openSpy.mock.calls[0][0]).toBe(
        'https://www.paypal.com/checkoutnow?token=26J86727T2545091L'
      );
      expect(openSpy.mock.calls[0][0]).not.toContain('sandbox');
    });

    it('ignores a checkoutUrl that is not a PayPal checkout host', async () => {
      signedIn();
      // This value is handed straight to window.open, so a tampered response
      // must not be able to land a buyer on a lookalike payment page.
      mockCreatePayPalOrder.mockResolvedValue({
        ok: true,
        orderId: '5O190127TN364715T',
        checkoutUrl: 'https://paypal.evil.example/checkoutnow?token=5O190127TN364715T'
      });
      mockCompletePayPalPurchase.mockResolvedValue({ ok: true });

      const openSpy = vi.spyOn(window, 'open').mockReturnValue({ closed: true });

      render(<AdFreeSettings onClose={() => {}} />);
      fireEvent.click(screen.getByRole('button', { name: /Purchase Ad-Free/i }));

      await waitFor(() => expect(openSpy).toHaveBeenCalled());
      expect(openSpy.mock.calls[0][0]).toBe(
        'https://www.sandbox.paypal.com/checkoutnow?token=5O190127TN364715T'
      );
    });

    it('falls back to the built-in host when the server sends no checkoutUrl', async () => {
      signedIn();
      // Covers a browser holding a newer bundle than the deployed Function.
      mockCreatePayPalOrder.mockResolvedValue({ ok: true, orderId: '5O190127TN364715T' });
      mockCompletePayPalPurchase.mockResolvedValue({ ok: true });

      const openSpy = vi.spyOn(window, 'open').mockReturnValue({ closed: true });

      render(<AdFreeSettings onClose={() => {}} />);
      fireEvent.click(screen.getByRole('button', { name: /Purchase Ad-Free/i }));

      await waitFor(() => expect(openSpy).toHaveBeenCalled());
      expect(openSpy.mock.calls[0][0]).toBe(
        'https://www.sandbox.paypal.com/checkoutnow?token=5O190127TN364715T'
      );
    });

    it('surfaces an order-creation failure without opening checkout', async () => {
      signedIn();
      mockCreatePayPalOrder.mockResolvedValue({ ok: false, error: 'PayPal unavailable' });
      const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);

      render(<AdFreeSettings onClose={() => {}} />);
      fireEvent.click(screen.getByRole('button', { name: /Purchase Ad-Free/i }));

      await waitFor(() => expect(mockShowError).toHaveBeenCalledWith('PayPal unavailable'));
      expect(openSpy).not.toHaveBeenCalled();
      expect(mockCompletePayPalPurchase).not.toHaveBeenCalled();
    });

    it('reports a capture failure instead of failing silently', async () => {
      signedIn();
      mockCreatePayPalOrder.mockResolvedValue({ ok: true, orderId: '5O190127TN364715T' });
      mockCompletePayPalPurchase.mockResolvedValue({
        ok: false,
        reason: 'order-not-approved',
        error: 'Order has not been approved by the buyer'
      });
      vi.spyOn(window, 'open').mockReturnValue({ closed: true });

      render(<AdFreeSettings onClose={() => {}} />);
      fireEvent.click(screen.getByRole('button', { name: /Purchase Ad-Free/i }));

      // A buyer who approved payment must never be left thinking it worked.
      // The popup poll runs on a 1s interval, so allow more than waitFor's
      // 1s default before deciding nothing was reported.
      await waitFor(
        () =>
          expect(mockShowError).toHaveBeenCalledWith('Order has not been approved by the buyer'),
        { timeout: 4000 }
      );
      expect(mockShowSuccess).not.toHaveBeenCalled();
    });
  });

  describe('admin key generation', () => {
    const mockGenerateKeys = vi.fn();

    const signIn = ({ isGlobalChatAdmin = true, isAdFree = false } = {}) => {
      vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
        accountUser: { email: 'admin@example.com', displayName: 'Admin' },
        isSignedIn: true,
        isGlobalChatAdmin,
        signInWithGoogle: mockSignInWithGoogle
      });

      vi.spyOn(AdFreeContextModule, 'useAdFree').mockReturnValue({
        isAdFree,
        adFreeData: isAdFree
          ? {
              method: 'key',
              keyHash: 'b'.repeat(64),
              activatedAt: 1720000000000
            }
          : null,
        loading: false,
        redeemKey: mockRedeemKey,
        createPayPalOrder: mockCreatePayPalOrder,
        completePayPalPurchase: mockCompletePayPalPurchase,
        generateKeys: mockGenerateKeys
      });
    };

    beforeEach(() => {
      mockGenerateKeys.mockReset();
    });

    it('is hidden from non-admin accounts', () => {
      signIn({ isGlobalChatAdmin: false });

      render(<AdFreeSettings onClose={() => {}} />);

      expect(screen.queryByText('Admin: Generate Keys')).not.toBeInTheDocument();
    });

    it('is available to admins on the upgrade screen', () => {
      signIn();

      render(<AdFreeSettings onClose={() => {}} />);

      expect(screen.getByText('Admin: Generate Keys')).toBeInTheDocument();
      expect(screen.getByLabelText('How many')).toHaveValue(5);
    });

    it('is also available to admins who are already ad-free', () => {
      signIn({ isAdFree: true });

      render(<AdFreeSettings onClose={() => {}} />);

      expect(screen.getByText('Admin: Generate Keys')).toBeInTheDocument();
    });

    it('never submits a count outside 1-25', () => {
      signIn();

      render(<AdFreeSettings onClose={() => {}} />);

      const input = screen.getByLabelText('How many');
      expect(input).toHaveAttribute('min', '1');
      expect(input).toHaveAttribute('max', '25');

      fireEvent.change(input, { target: { value: '30' } });
      fireEvent.click(screen.getByRole('button', { name: /^Generate$/ }));

      // Native constraint validation blocks the submit, so the request never
      // leaves the browser and the server-side 1..25 cap is never exercised.
      expect(mockGenerateKeys).not.toHaveBeenCalled();
    });

    it('rejects a blank count with an inline error and no API call', async () => {
      signIn();

      render(<AdFreeSettings onClose={() => {}} />);

      // Clearing the field passes constraint validation (the input is not
      // required), so the component's own guard has to catch it.
      fireEvent.change(screen.getByLabelText('How many'), { target: { value: '' } });
      fireEvent.click(screen.getByRole('button', { name: /^Generate$/ }));

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent(
          'Count must be a whole number between 1 and 25'
        );
      });
      expect(mockGenerateKeys).not.toHaveBeenCalled();
    });

    it('lists generated keys with a per-key copy control', async () => {
      signIn();
      const keys = ['SFXAD-AAAAA-BBBBB-CCCCC', 'SFXAD-DDDDD-EEEEE-FFFFF'];
      mockGenerateKeys.mockResolvedValue({ ok: true, keys });

      const writeText = vi.fn().mockResolvedValue(undefined);
      vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });

      render(<AdFreeSettings onClose={() => {}} />);

      fireEvent.change(screen.getByLabelText('How many'), { target: { value: '2' } });
      fireEvent.click(screen.getByRole('button', { name: /^Generate$/ }));

      await waitFor(() => {
        expect(mockGenerateKeys).toHaveBeenCalledWith(2);
      });

      for (const key of keys) {
        expect(screen.getByText(key)).toBeInTheDocument();
      }
      expect(mockShowSuccess).toHaveBeenCalledWith('Generated 2 keys');

      fireEvent.click(screen.getByRole('button', { name: `Copy key ${keys[0]}` }));

      await waitFor(() => {
        expect(writeText).toHaveBeenCalledWith(keys[0]);
      });
      expect(screen.getByRole('button', { name: `Copy key ${keys[0]}` })).toHaveTextContent(
        'Copied'
      );
    });

    it('reports a clipboard failure instead of silently dropping the copy', async () => {
      signIn();
      mockGenerateKeys.mockResolvedValue({ ok: true, keys: ['SFXAD-AAAAA-BBBBB-CCCCC'] });
      vi.stubGlobal('navigator', {
        ...navigator,
        clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) }
      });

      render(<AdFreeSettings onClose={() => {}} />);
      fireEvent.click(screen.getByRole('button', { name: /^Generate$/ }));

      await waitFor(() => {
        expect(screen.getByText('SFXAD-AAAAA-BBBBB-CCCCC')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /^Copy key / }));

      await waitFor(() => {
        expect(mockShowError).toHaveBeenCalledWith(
          'Clipboard unavailable — select the key and copy manually'
        );
      });
    });

    it('surfaces a server rejection', async () => {
      signIn();
      mockGenerateKeys.mockResolvedValue({
        ok: false,
        reason: 'admin-required',
        error: 'Admin privileges required'
      });

      render(<AdFreeSettings onClose={() => {}} />);
      fireEvent.click(screen.getByRole('button', { name: /^Generate$/ }));

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent('Admin privileges required');
      });
      expect(mockShowError).toHaveBeenCalledWith('Admin privileges required');
    });
  });
});
