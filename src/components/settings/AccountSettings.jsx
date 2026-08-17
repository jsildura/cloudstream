import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useProfiles } from '../../contexts/ProfileContext';
import { useToast } from '../../contexts/ToastContext';
import { isTVDevice } from '../../utils/platform';
import { Star, Film, Monitor, LogOut, X, User, ArrowRight } from 'lucide-react';

export default function AccountSettings({
  onClose,
  onNavigateToProfiles,
  onNavigateToPin
}) {
  const { accountUser, isSignedIn, signInWithGoogle, signOutAccount } = useAuth();
  const { activeProfile, isKidsMode, requestKidsExit } = useProfiles();
  const { showSuccess, showError } = useToast();

  const [isSigningIn, setIsSigningIn] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const isTV = isTVDevice();

  const handleGoogleSignIn = async () => {
    if (isSigningIn) return;
    setIsSigningIn(true);
    try {
      const res = await signInWithGoogle();
      if (res.ok) {
        showSuccess('Signed in with Google!');
      } else if (res.reason === 'tv-unsupported') {
        showError(res.message);
      } else if (res.reason === 'popup-closed') {
        // User closed popup
      } else if (res.reason === 'popup-blocked') {
        showError('Popup blocked. Please allow popups or use redirect.');
      } else if (res.reason === 'existing-provider-unsupported') {
        showError(res.message || 'An account exists with a different credential.');
      } else if (res.message) {
        showError(res.message);
      }
    } catch (err) {
      showError(err?.message || 'Sign in with Google failed');
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleSignOutClick = () => {
    if (isSigningOut) return;

    const executeSignOut = async () => {
      setIsSigningOut(true);
      try {
        const res = await signOutAccount();
        if (res.ok) {
          showSuccess('Signed out of Google account.');
        } else if (res.error) {
          showError(res.error.message || 'Failed to sign out.');
        }
      } catch (err) {
        showError(err?.message || 'Failed to sign out');
      } finally {
        setIsSigningOut(false);
      }
    };

    if (isKidsMode) {
      const exitReq = requestKidsExit({
        type: 'callback',
        callback: executeSignOut
      });
      if (exitReq.modalOpened && onNavigateToPin) {
        onNavigateToPin();
      }
    } else {
      executeSignOut();
    }
  };

  const handleSwitchProfileClick = () => {
    if (isKidsMode) {
      const exitReq = requestKidsExit({
        type: 'callback',
        callback: onNavigateToProfiles
      });
      if (exitReq.modalOpened && onNavigateToPin) {
        onNavigateToPin();
      }
    } else if (onNavigateToProfiles) {
      onNavigateToProfiles();
    }
  };

  if (!isSignedIn || !accountUser) {
    return (
      <div className="navbar-settings-signin">
        <header className="navbar-settings-header no-border">
          <div>
            <span className="signin-welcome-label">WELCOME</span>
            <h3>Sign in to continue</h3>
            <p className="signin-subtitle">
              Pick up where you left off.<br />
              Your next watch is waiting.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close settings">
            <X />
          </button>
        </header>

        <div className="signin-features">
          <div className="signin-feature">
            <Star /> <span>Watchlist sync</span>
          </div>
          <div className="signin-feature">
            <Film /> <span>Continue watching</span>
          </div>
          <div className="signin-feature">
            <Monitor /> <span>Multi-profile</span>
          </div>
        </div>

        <div className="signin-divider">
          <span>ONE-CLICK SIGN IN</span>
        </div>

        {isTV ? (
          <div
            className="signin-tv-notice"
            style={{
              padding: '14px',
              background: '#1c1c1e',
              borderRadius: '8px',
              border: '1px solid #333',
              color: '#ffb340',
              fontSize: '13px',
              textAlign: 'center',
              lineHeight: '1.4'
            }}
          >
            Sign-in is unavailable on this TV browser. Use a phone or computer.
          </div>
        ) : (
          <button
            className="signin-google-btn"
            onClick={handleGoogleSignIn}
            disabled={isSigningIn}
            style={isSigningIn ? { opacity: 0.7, cursor: 'wait' } : {}}
          >
            <img
              src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
              alt="G"
            />
            {isSigningIn ? 'Signing in...' : 'Sign in with Google'}
          </button>
        )}

        <p className="signin-footer-text">
          By continuing, you agree to our <a href="/terms">Terms</a> and{' '}
          <a href="/privacy">Privacy Policy</a>.
        </p>
      </div>
    );
  }

  return (
    <div className="navbar-settings-signin">
      <header className="navbar-settings-header no-border">
        <div>
          <span className="signin-welcome-label" style={{ color: '#4ade80' }}>
            CONNECTED ACCOUNT
          </span>
          <h3>{accountUser.displayName || 'Google Account'}</h3>
          <p className="signin-subtitle">
            {accountUser.email || 'Signed in with Google'}
          </p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close settings">
          <X />
        </button>
      </header>

      {/* Active Profile Summary Card */}
      {activeProfile && (
        <div className="settings-active-profile-card">
          <div className="settings-active-profile-info">
            <img
              src={`/avatars/${activeProfile.avatar}.webp`}
              alt={activeProfile.name}
              className="settings-active-profile-avatar"
              onError={(e) => {
                e.currentTarget.src = '/avatars/avatar_01.webp';
              }}
            />
            <div>
              <div className="settings-active-profile-name">
                {activeProfile.name}
                {activeProfile.isKids && (
                  <span className="kids-pill-badge">KIDS</span>
                )}
              </div>
              <span className="settings-active-profile-tag">Active Profile</span>
            </div>
          </div>
          <button
            type="button"
            className="settings-switch-profile-btn"
            onClick={handleSwitchProfileClick}
            aria-label="Switch Profile"
          >
            <span>Switch</span>
            <ArrowRight size={16} />
          </button>
        </div>
      )}

      <div className="signin-features">
        <div className="signin-feature">
          <Star style={{ color: '#fbbf24' }} /> <span>Watchlist sync on</span>
        </div>
        <div className="signin-feature">
          <Film style={{ color: '#60a5fa' }} /> <span>Continue Watching on</span>
        </div>
        <div className="signin-feature">
          <Monitor style={{ color: '#a78bfa' }} /> <span>Multi-Profile support</span>
        </div>
      </div>

      <div className="signin-divider">
        <span>ACCOUNT ACTIONS</span>
      </div>

      <button
        className="signin-google-btn"
        onClick={handleSignOutClick}
        disabled={isSigningOut}
        style={{
          background: '#261214',
          borderColor: '#5c1d24',
          color: '#ff7b88',
          cursor: isSigningOut ? 'wait' : 'pointer'
        }}
      >
        <LogOut size={18} />
        {isSigningOut ? 'Signing out...' : 'Sign Out of Google'}
      </button>
    </div>
  );
}
