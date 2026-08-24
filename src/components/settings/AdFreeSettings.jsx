import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useAdFree } from '../../contexts/AdFreeContext';
import { useToast } from '../../contexts/ToastContext';
import { ADFREE_PRICE_LABEL } from '../../utils/adGating';
import {
  Sparkles,
  ShieldCheck,
  Zap,
  KeyRound,
  AlertCircle,
  Copy,
  Check,
  Lock,
  X,
  Loader2
} from 'lucide-react';

const MIN_KEY_COUNT = 1;
const MAX_KEY_COUNT = 25;

// The only two hosts that can approve a PayPal order.
const PAYPAL_CHECKOUT_HOSTS = ['https://www.paypal.com', 'https://www.sandbox.paypal.com'];

/**
 * Returns `url` only if it is a PayPal checkout URL, else null.
 *
 * The server chooses the checkout host, but this value is handed to
 * `window.open`, so it is host-checked rather than trusted outright — a tampered
 * or misconfigured response must not be able to send a buyer somewhere that only
 * looks like PayPal.
 */
function payPalCheckoutUrl(url) {
  if (typeof url !== 'string') return null;
  return PAYPAL_CHECKOUT_HOSTS.some((host) => url.startsWith(`${host}/checkoutnow?`)) ? url : null;
}

/**
 * Admin-only batch key generation.
 *
 * Raw keys exist in component state for the current UI session only — they are
 * never written to localStorage, Firebase, or the console.
 */
function AdminKeyGenerator() {
  const { generateKeys } = useAdFree();
  const { showSuccess, showError } = useToast();

  const [countInput, setCountInput] = useState('5');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedKeys, setGeneratedKeys] = useState([]);
  const [genError, setGenError] = useState(null);
  const [copiedKey, setCopiedKey] = useState(null);
  const copyTimerRef = useRef(null);

  useEffect(() => () => clearTimeout(copyTimerRef.current), []);

  const handleGenerate = async (e) => {
    e.preventDefault();
    if (isGenerating) return;
    setGenError(null);

    const count = Number.parseInt(countInput, 10);
    if (!Number.isInteger(count) || count < MIN_KEY_COUNT || count > MAX_KEY_COUNT) {
      setGenError(`Count must be a whole number between ${MIN_KEY_COUNT} and ${MAX_KEY_COUNT}`);
      return;
    }

    setIsGenerating(true);
    try {
      const res = await generateKeys(count);
      if (res.ok) {
        setGeneratedKeys(res.keys);
        showSuccess(`Generated ${res.keys.length} key${res.keys.length === 1 ? '' : 's'}`);
      } else {
        const msg = res.error || 'Failed to generate keys';
        setGenError(msg);
        showError(msg);
      }
    } catch (err) {
      const msg = err.message || 'Failed to generate keys';
      setGenError(msg);
      showError(msg);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = async (key) => {
    try {
      await navigator.clipboard.writeText(key);
      setCopiedKey(key);
      clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopiedKey(null), 2000);
    } catch {
      showError('Clipboard unavailable — select the key and copy manually');
    }
  };

  return (
    <section className="adfree-admin-card">
      <div className="adfree-admin-header">
        <ShieldCheck size={18} color="#fbbf24" />
        <div>
          <h4 className="adfree-admin-title">Admin: Generate Keys</h4>
          <p className="adfree-admin-sub">
            Keys are shown once and never stored — copy them before closing.
          </p>
        </div>
      </div>

      <form className="adfree-admin-form" onSubmit={handleGenerate}>
        <label className="adfree-admin-count-label" htmlFor="adfree-key-count">
          How many
        </label>
        <input
          id="adfree-key-count"
          type="number"
          className="adfree-admin-count-input"
          min={MIN_KEY_COUNT}
          max={MAX_KEY_COUNT}
          step={1}
          value={countInput}
          onChange={(e) => {
            setGenError(null);
            setCountInput(e.target.value);
          }}
          disabled={isGenerating}
        />
        <button type="submit" className="adfree-admin-generate-btn" disabled={isGenerating}>
          {isGenerating ? (
            <>
              <Loader2 size={16} className="spin-loader" />
              <span>Generating...</span>
            </>
          ) : (
            <span>Generate</span>
          )}
        </button>
      </form>

      {genError && (
        <div className="adfree-error-msg" role="alert">
          <AlertCircle size={15} />
          <span>{genError}</span>
        </div>
      )}

      {generatedKeys.length > 0 && (
        <ul className="adfree-admin-key-list">
          {generatedKeys.map((key) => (
            <li key={key} className="adfree-admin-key-row">
              <code className="adfree-admin-key monospace">{key}</code>
              <button
                type="button"
                className="adfree-admin-copy-btn"
                onClick={() => handleCopy(key)}
                aria-label={`Copy key ${key}`}
              >
                {copiedKey === key ? <Check size={15} color="#4ade80" /> : <Copy size={15} />}
                <span>{copiedKey === key ? 'Copied' : 'Copy'}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function AdFreeSettings({ onClose }) {
  const { accountUser, isSignedIn, isGlobalChatAdmin, signInWithGoogle } = useAuth();
  const {
    isAdFree,
    adFreeData,
    redeemKey,
    createPayPalOrder,
    completePayPalPurchase
  } = useAdFree();
  const { showSuccess, showError } = useToast();

  const [rawKeyInput, setRawKeyInput] = useState('');
  const [isRedeeming, setIsRedeeming] = useState(false);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [keyError, setKeyError] = useState(null);
  const [isSigningIn, setIsSigningIn] = useState(false);

  // Key formatting helper: auto-formats to SFXAD-XXXXX-XXXXX-XXXXX
  const handleKeyInputChange = (e) => {
    setKeyError(null);
    let val = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');

    // Strip optional SFXAD prefix if user pasted it without hyphens
    if (val.startsWith('SFXAD')) {
      val = val.slice(5);
    }

    // Limit to 15 alphanumeric chars after prefix
    val = val.slice(0, 15);

    let formatted = 'SFXAD';
    if (val.length > 0) {
      formatted += '-' + val.slice(0, 5);
    }
    if (val.length > 5) {
      formatted += '-' + val.slice(5, 10);
    }
    if (val.length > 10) {
      formatted += '-' + val.slice(10, 15);
    }

    setRawKeyInput(formatted);
  };

  const handleRedeemSubmit = async (e) => {
    e.preventDefault();
    setKeyError(null);

    const trimmed = rawKeyInput.trim();
    if (!/^SFXAD-[A-Z0-9]{5}-[A-Z0-9]{5}-[A-Z0-9]{5}$/.test(trimmed)) {
      setKeyError('Please enter a full 15-character key in SFXAD-XXXXX-XXXXX-XXXXX format');
      return;
    }

    setIsRedeeming(true);
    try {
      const res = await redeemKey(trimmed);
      if (res.ok) {
        showSuccess('Ad-Free access unlocked! Thank you for your support.');
        setRawKeyInput('');
      } else {
        const msg = res.error || 'Failed to redeem key';
        setKeyError(msg);
        showError(msg);
      }
    } catch (err) {
      const msg = err.message || 'An unexpected error occurred';
      setKeyError(msg);
      showError(msg);
    } finally {
      setIsRedeeming(false);
    }
  };

  const handlePayPalPurchase = async () => {
    if (isPurchasing) return;
    setIsPurchasing(true);

    try {
      const orderRes = await createPayPalOrder();
      if (!orderRes.ok || !orderRes.orderId) {
        showError(orderRes.error || 'Failed to initiate PayPal order');
        setIsPurchasing(false);
        return;
      }

      const orderId = orderRes.orderId;
      // Derived from the order id rather than random, so a retry after a failed
      // or interrupted capture — even in a new tab — presents the same request
      // id and resumes the server's existing reservation instead of colliding
      // with it and getting rejected as someone else's in-flight order.
      const requestId = `adfree-${orderId}`;

      // The server tells us where to approve this order, because only the server
      // knows which PayPal environment minted it. Sending a live order id to
      // sandbox's checkoutnow (or the reverse) shows PayPal's generic "Things
      // don't appear to be working at the moment" page and charges nothing.
      // The VITE_PAYPAL_ENV fallback only covers a browser holding a newer
      // bundle than the deployed Function; it is not the normal path.
      const isLive = import.meta.env?.VITE_PAYPAL_ENV === 'live';
      const fallbackDomain = isLive ? 'https://www.paypal.com' : 'https://www.sandbox.paypal.com';

      const checkoutUrl =
        payPalCheckoutUrl(orderRes.checkoutUrl) ||
        `${fallbackDomain}/checkoutnow?token=${encodeURIComponent(orderId)}`;

      const popup = window.open(
        checkoutUrl,
        'streamflix_paypal',
        'width=500,height=700,status=no,resizable=yes'
      );

      if (!popup) {
        // Fallback to direct redirect if popup blocked
        window.location.href = checkoutUrl;
        return;
      }

      // Poll popup completion
      const checkPopup = setInterval(async () => {
        if (!popup || popup.closed) {
          clearInterval(checkPopup);
          // Attempt capture & server activation
          try {
            const captureRes = await completePayPalPurchase(orderId, requestId);
            if (captureRes.ok) {
              showSuccess('Payment verified! Lifetime Ad-Free is now active.');
            } else {
              // Never silent: a buyer who approved the payment and then hits a
              // capture failure has to be told, or they close the pane assuming
              // it worked and have no idea a paid order is left unactivated.
              showError(
                captureRes.error || 'Payment could not be verified — reopen this panel to retry'
              );
            }
          } catch (err) {
            showError(err.message || 'Payment could not be verified — reopen this panel to retry');
          } finally {
            setIsPurchasing(false);
          }
        }
      }, 1000);
    } catch (err) {
      showError(err.message || 'PayPal purchase error');
      setIsPurchasing(false);
    }
  };

  const handleSignIn = async () => {
    if (isSigningIn) return;
    setIsSigningIn(true);
    try {
      const res = await signInWithGoogle();
      if (res.ok) {
        showSuccess('Signed in with Google!');
      } else if (res.message) {
        showError(res.message);
      }
    } catch (err) {
      showError(err.message || 'Sign-in failed');
    } finally {
      setIsSigningIn(false);
    }
  };

  // 1. Unauthenticated or Anonymous state
  if (!isSignedIn || !accountUser) {
    return (
      <div className="navbar-settings-signin adfree-settings-container">
        <header className="navbar-settings-header no-border">
          <div>
            <span className="signin-welcome-label" style={{ color: '#e50914' }}>
              PREMIUM EXPERIENCE
            </span>
            <h3>Disable Ads</h3>
            <p className="signin-subtitle">
              Permanently removes the ads Streamflix serves, on every profile in your account.
            </p>
          </div>
          {onClose && (
            <button type="button" onClick={onClose} aria-label="Close settings">
              <X />
            </button>
          )}
        </header>

        <div className="adfree-benefit-grid">
          <div className="adfree-benefit-card">
            <Zap className="adfree-benefit-icon" style={{ color: '#e50914' }} />
            <div>
              <h4>No Popunders or Redirects</h4>
              <p>Pressing play stops opening sponsor tabs and redirect pages.</p>
            </div>
          </div>
          <div className="adfree-benefit-card">
            <ShieldCheck className="adfree-benefit-icon" style={{ color: '#4ade80' }} />
            <div>
              <h4>Clean Interface</h4>
              <p>Banner, native and full-page ad slots stop loading — and no anti-adblock gate.</p>
            </div>
          </div>
          <div className="adfree-benefit-card">
            <Sparkles className="adfree-benefit-icon" style={{ color: '#fbbf24' }} />
            <div>
              <h4>Account-Wide Lifetime Sync</h4>
              <p>
                One-time purchase covering every device and profile — and it helps keep the
                site hosted and maintained.
              </p>
            </div>
          </div>
        </div>

        <div className="signin-divider">
          <span>SIGN IN TO ACTIVATE</span>
        </div>

        <button
          className="signin-google-btn"
          onClick={handleSignIn}
          disabled={isSigningIn}
          style={isSigningIn ? { opacity: 0.7, cursor: 'wait' } : {}}
        >
          <img
            src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
            alt="G"
          />
          {isSigningIn ? 'Signing in...' : 'Sign in with Google to Continue'}
        </button>

        <p className="signin-footer-text">
          Ad-Free entitlements are permanently bound to your Google account identity.
        </p>
      </div>
    );
  }

  // 2. Active Lifetime Ad-Free state
  if (isAdFree) {
    const activatedDate = adFreeData?.activatedAt
      ? new Date(adFreeData.activatedAt).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      })
      : 'Active';

    const isPurchase = adFreeData?.method === 'purchase';

    return (
      <div className="navbar-settings-signin adfree-settings-container">
        <header className="navbar-settings-header no-border">
          <div>
            <span className="signin-welcome-label" style={{ color: '#4ade80' }}>
              ENTITLEMENT ACTIVE
            </span>
            <h3>Ad-Free Status</h3>
            <p className="signin-subtitle">The ads Streamflix serves are disabled for your account.</p>
          </div>
          {onClose && (
            <button type="button" onClick={onClose} aria-label="Close settings">
              <X />
            </button>
          )}
        </header>

        <div className="adfree-active-badge-card">
          <div className="adfree-active-badge-header">
            <div className="adfree-active-icon-wrap" aria-hidden="true">
              <Check size={18} strokeWidth={3} />
            </div>
            <div>
              <div className="adfree-active-title">Lifetime Ad-Free Active</div>
              <div className="adfree-active-sub">
                No popups · No banners · No anti-adblock gate
              </div>
            </div>
          </div>

          <div className="adfree-card-divider" aria-hidden="true" />

          <dl className="adfree-active-details">
            <div className="adfree-detail-row">
              <dt className="adfree-detail-label">Linked Account</dt>
              <dd className="adfree-detail-value">{accountUser.email}</dd>
            </div>
            <div className="adfree-detail-row">
              <dt className="adfree-detail-label">Activation Method</dt>
              <dd className="adfree-detail-value">
                {/* Shows the current price, not what this buyer was charged — the
                    amount is recorded on the server-only adFreeOrders node, which
                    the client cannot read. Matters only if the price ever changes
                    after a real purchase exists. */}
                {isPurchase ? `PayPal Purchase (${ADFREE_PRICE_LABEL})` : 'Redeemed Key'}
              </dd>
            </div>
            <div className="adfree-detail-row">
              <dt className="adfree-detail-label">Activated On</dt>
              <dd className="adfree-detail-value">{activatedDate}</dd>
            </div>
            {isPurchase && adFreeData?.orderId && (
              <div className="adfree-detail-row">
                <dt className="adfree-detail-label">PayPal Order</dt>
                <dd className="adfree-detail-value monospace">{adFreeData.orderId}</dd>
              </div>
            )}
          </dl>
        </div>

        <div className="adfree-footer-note">
          <p>
            Thank you for supporting Streamflix! Your purchase helps cover hosting and
            maintenance, and stays active on all your devices and profiles.
          </p>
        </div>

        {isGlobalChatAdmin && <AdminKeyGenerator />}
      </div>
    );
  }

  // 3. Google Authenticated — Upgrade or Redeem Options
  return (
    <div className="navbar-settings-signin adfree-settings-container">
      <header className="navbar-settings-header no-border">
        <div>
          <span className="signin-welcome-label" style={{ color: '#e50914' }}>
            UPGRADE ACCOUNT
          </span>
          <h3>Disable Ads</h3>
          <p className="signin-subtitle">
            Permanently removes the ads Streamflix serves for{' '}
            <strong style={{ color: '#fff' }}>{accountUser.email}</strong>.
          </p>
        </div>
        {onClose && (
          <button type="button" onClick={onClose} aria-label="Close settings">
            <X />
          </button>
        )}
      </header>

      {/* Option 1: PayPal Lifetime Purchase */}
      <div className="adfree-purchase-card">
        <div className="adfree-card-header">
          <h4 className="adfree-card-title">Go Ad-Free</h4>
          <span className="adfree-card-tag">Lifetime</span>
        </div>

        <div className="adfree-card-price-row">
          <span className="adfree-card-price">{ADFREE_PRICE_LABEL}</span>
          <span className="adfree-card-currency">USD</span>
        </div>
        <p className="adfree-card-sub">
          One-time payment, no subscription — your support keeps Streamflix hosted and
          maintained.
        </p>

        <div className="adfree-card-divider" aria-hidden="true" />

        <ul className="adfree-feature-list">
          {[
            'Zero site popups, redirects & popunders',
            'No banner or interstitial ads',
            'Clean interface — no anti-adblock gate',
            'Syncs across all devices and profiles'
          ].map((feature) => (
            <li key={feature}>
              <span className="adfree-feature-check" aria-hidden="true">
                <Check size={12} strokeWidth={3} />
              </span>
              {feature}
            </li>
          ))}
        </ul>

        <button
          type="button"
          className="adfree-paypal-btn"
          onClick={handlePayPalPurchase}
          disabled={isPurchasing}
          aria-busy={isPurchasing}
          aria-label={`Pay ${ADFREE_PRICE_LABEL} · Lifetime Access — purchase Ad-Free with PayPal`}
        >
          {isPurchasing ? (
            <>
              <Loader2 size={18} className="spin-loader" />
              <span>Connecting to PayPal...</span>
            </>
          ) : (
            <>
              <span className="adfree-btn-label">Pay {ADFREE_PRICE_LABEL} · Lifetime Access</span>
              <span className="adfree-btn-divider" aria-hidden="true" />
              <span className="paypal-logo-text" aria-hidden="true">
                <span style={{ color: '#003087' }}>Pay</span>
                <span style={{ color: '#0079c1' }}>Pal</span>
              </span>
            </>
          )}
        </button>

        <p className="adfree-secure-note">
          <Lock size={11} aria-hidden="true" />
          Secure payment via PayPal
        </p>
      </div>

      <div className="signin-divider">
        <span>OR REDEEM KEY</span>
      </div>

      {/* Option 2: Key Redemption */}
      <form onSubmit={handleRedeemSubmit} className="adfree-redeem-form">
        <div className="adfree-input-wrap">
          <KeyRound className="adfree-input-icon" />
          <input
            type="text"
            className="adfree-key-input monospace"
            placeholder="SFXAD-XXXXX-XXXXX-XXXXX"
            value={rawKeyInput}
            onChange={handleKeyInputChange}
            maxLength={23}
            autoCapitalize="characters"
            spellCheck="false"
            disabled={isRedeeming}
          />
        </div>

        {keyError && (
          <div className="adfree-error-msg" role="alert">
            <AlertCircle size={15} />
            <span>{keyError}</span>
          </div>
        )}

        <button
          type="submit"
          className="adfree-redeem-btn"
          disabled={isRedeeming || rawKeyInput.length < 23}
        >
          {isRedeeming ? (
            <>
              <Loader2 size={16} className="spin-loader" />
              <span>Redeeming Key...</span>
            </>
          ) : (
            <span>Redeem Key</span>
          )}
        </button>
      </form>

      {isGlobalChatAdmin && <AdminKeyGenerator />}
    </div>
  );
}
