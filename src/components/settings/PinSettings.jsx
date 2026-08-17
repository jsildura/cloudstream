import React, { useState, useEffect, useCallback } from 'react';
import { useProfiles } from '../../contexts/ProfileContext';
import { X, Delete, Lock, ShieldAlert } from 'lucide-react';

export default function PinSettings({ onCancel, onSuccess }) {
  const {
    submitKidsPin,
    cancelKidsExit,
    remainingAttempts,
    cooldownUntil,
    pinAction
  } = useProfiles();

  const [pin, setPin] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(0);

  // Cooldown countdown timer
  useEffect(() => {
    if (!cooldownUntil) {
      setSecondsRemaining(0);
      return;
    }

    const updateTimer = () => {
      const remaining = Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000));
      setSecondsRemaining(remaining);
      if (remaining <= 0) {
        setErrorMsg('');
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [cooldownUntil]);

  const isCooldownActive = secondsRemaining > 0;

  const triggerSubmit = useCallback(async (pinToSubmit) => {
    setIsSubmitting(true);
    try {
      const res = await submitKidsPin(pinToSubmit);
      if (res.ok) {
        setPin('');
        setErrorMsg('');
        if (onSuccess) onSuccess();
      } else {
        setPin('');
        if (res.reason === 'cooldown-active' || res.cooldownActivated) {
          setErrorMsg('Too many failed attempts. Please wait 30 seconds.');
        } else {
          setErrorMsg(
            res.remainingAttempts !== undefined
              ? `Incorrect PIN. ${res.remainingAttempts} ${res.remainingAttempts === 1 ? 'attempt' : 'attempts'} remaining.`
              : 'Incorrect PIN. Please try again.'
          );
        }
      }
    } catch {
      setErrorMsg('Verification failed. Please try again.');
      setPin('');
    } finally {
      setIsSubmitting(false);
    }
  }, [submitKidsPin, onSuccess]);

  const handleDigit = useCallback((digit) => {
    if (isCooldownActive || isSubmitting) return;
    setPin((prevPin) => {
      if (prevPin.length < 4) {
        const nextPin = prevPin + digit;
        setErrorMsg('');
        if (nextPin.length === 4) {
          setTimeout(() => triggerSubmit(nextPin), 0);
        }
        return nextPin;
      }
      return prevPin;
    });
  }, [isCooldownActive, isSubmitting, triggerSubmit]);

  const handleBackspace = useCallback(() => {
    if (isCooldownActive || isSubmitting) return;
    setPin((prev) => prev.slice(0, -1));
    setErrorMsg('');
  }, [isCooldownActive, isSubmitting]);

  const handleClear = useCallback(() => {
    if (isCooldownActive || isSubmitting) return;
    setPin('');
    setErrorMsg('');
  }, [isCooldownActive, isSubmitting]);

  const handleCancelClick = useCallback(() => {
    cancelKidsExit();
    if (onCancel) onCancel();
  }, [cancelKidsExit, onCancel]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key >= '0' && e.key <= '9') {
        handleDigit(e.key);
      } else if (e.key === 'Backspace') {
        handleBackspace();
      } else if (e.key === 'Escape') {
        handleCancelClick();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleDigit, handleBackspace, handleCancelClick]);

  const getActionDescription = () => {
    if (!pinAction) return 'Enter your 4-digit PIN to exit Kids profile';
    if (pinAction.type === 'switch_profile') return 'Enter PIN to switch to another profile';
    if (pinAction.type === 'sign_out') return 'Enter PIN to sign out of Google account';
    if (pinAction.type === 'manage_profiles') return 'Enter PIN to manage profiles';
    return 'Enter your 4-digit PIN to continue';
  };

  return (
    <div className="navbar-settings-pin-view">
      <header className="navbar-settings-header no-border">
        <div>
          <h3>Exit Kids Profile</h3>
          <p className="signin-subtitle">{getActionDescription()}</p>
        </div>
        <button type="button" onClick={handleCancelClick} aria-label="Cancel and close PIN view">
          <X />
        </button>
      </header>

      <div className="pin-settings-content">
        <div className="pin-icon-wrap">
          <Lock size={24} color="#E50914" />
        </div>

        {/* Masked Dots */}
        <div
          className="pin-dots-display"
          role="group"
          aria-label={`PIN entered: ${pin.length} of 4 digits`}
        >
          {[0, 1, 2, 3].map((index) => {
            const isFilled = index < pin.length;
            return (
              <div
                key={index}
                className={`pin-dot ${isFilled ? 'filled' : ''} ${errorMsg ? 'error' : ''}`}
              />
            );
          })}
        </div>

        {/* Feedback message */}
        {isCooldownActive ? (
          <div className="pin-feedback-msg cooldown" role="alert">
            <ShieldAlert size={16} />
            <span>Too many attempts. Try again in {secondsRemaining}s</span>
          </div>
        ) : errorMsg ? (
          <div className="pin-feedback-msg error" role="alert">
            <span>{errorMsg}</span>
          </div>
        ) : (
          <div className="pin-feedback-msg info">
            <span>{remainingAttempts} of 3 attempts remaining</span>
          </div>
        )}

        {/* Keypad */}
        <div className="pin-keypad-grid" role="group" aria-label="PIN Keypad">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
            <button
              key={digit}
              type="button"
              className="pin-key-btn"
              onClick={() => handleDigit(digit)}
              disabled={isCooldownActive || isSubmitting}
            >
              {digit}
            </button>
          ))}
          <button
            type="button"
            className="pin-key-btn control-key"
            onClick={handleClear}
            disabled={isCooldownActive || isSubmitting || pin.length === 0}
            aria-label="Clear all digits"
          >
            Clear
          </button>
          <button
            type="button"
            className="pin-key-btn"
            onClick={() => handleDigit('0')}
            disabled={isCooldownActive || isSubmitting}
          >
            0
          </button>
          <button
            type="button"
            className="pin-key-btn control-key"
            onClick={handleBackspace}
            disabled={isCooldownActive || isSubmitting || pin.length === 0}
            aria-label="Delete last digit"
          >
            <Delete size={18} />
          </button>
        </div>

        <div className="pin-footer-actions">
          <button
            type="button"
            className="settings-secondary-btn"
            onClick={handleCancelClick}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
