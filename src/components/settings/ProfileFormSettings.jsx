import React, { useState } from 'react';
import { useProfiles } from '../../contexts/ProfileContext';
import { useToast } from '../../contexts/ToastContext';
import {
  ALLOWED_AVATARS,
  KIDS_AVATARS,
  ADULT_AVATARS,
  DEFAULT_KIDS_AVATAR,
  DEFAULT_ADULT_AVATAR,
  PIN_REGEX
} from '../../lib/profileModel';
import { X, Check, Trash2, ArrowLeft, AlertTriangle } from 'lucide-react';

export default function ProfileFormSettings({
  profile = null,
  onCancel,
  onSuccess
}) {
  const isEditing = Boolean(profile && profile.id);
  const { profiles, createProfile, updateProfile, deleteProfile } = useProfiles();
  const { showSuccess, showError } = useToast();

  const [name, setName] = useState(profile ? profile.name : '');
  const [isKids, setIsKids] = useState(profile ? Boolean(profile.isKids) : false);
  const [avatar, setAvatar] = useState(() => {
    if (profile?.avatar && ALLOWED_AVATARS.includes(profile.avatar)) {
      return profile.avatar;
    }
    return profile?.isKids ? DEFAULT_KIDS_AVATAR : DEFAULT_ADULT_AVATAR;
  });
  const [pin, setPin] = useState('');
  const [currentPin, setCurrentPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [currentPinError, setCurrentPinError] = useState('');
  const [formError, setFormError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const isOnlyProfile = profiles.length <= 1;
  const isExistingKidsProfile = Boolean(isEditing && profile?.isKids);

  const handleKidsToggle = (checked) => {
    setIsKids(checked);
    setPinError('');
    setCurrentPinError('');
    if (checked) {
      if (!KIDS_AVATARS.includes(avatar)) {
        setAvatar(DEFAULT_KIDS_AVATAR);
      }
    } else {
      if (!ADULT_AVATARS.includes(avatar)) {
        setAvatar(DEFAULT_ADULT_AVATAR);
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    setPinError('');
    setCurrentPinError('');

    const trimmedName = name.trim();
    if (!trimmedName) {
      setFormError('Profile name is required');
      return;
    }
    if (trimmedName.length > 20) {
      setFormError('Profile name cannot exceed 20 characters');
      return;
    }

    // PIN check for Kids mode
    if (isKids) {
      if (isExistingKidsProfile) {
        if (pin.length > 0 || currentPin.length > 0) {
          if (!currentPin || currentPin.length !== 4) {
            setCurrentPinError('Current 4-digit PIN is required to change PIN');
            return;
          }
          if (!PIN_REGEX.test(pin)) {
            setPinError('New PIN must be 4 numeric digits');
            return;
          }
        }
      } else {
        if (!PIN_REGEX.test(pin)) {
          setPinError('A 4-digit numeric PIN is required for Kids mode');
          return;
        }
      }
    }

    setIsSaving(true);
    try {
      if (isEditing) {
        const res = await updateProfile(
          profile.id,
          {
            name: trimmedName,
            avatar,
            isKids
          },
          pin,
          currentPin
        );

        if (res.ok) {
          showSuccess('Profile updated');
          if (onSuccess) onSuccess();
        } else if (res.reason === 'invalid-current-pin' || res.reason === 'current-pin-required') {
          setCurrentPinError(res.message || 'Current PIN is incorrect');
        } else {
          setFormError(res.message || res.reason || 'Failed to update profile');
        }
      } else {
        const res = await createProfile(
          {
            name: trimmedName,
            avatar,
            isKids
          },
          pin
        );

        if (res.ok) {
          showSuccess('Profile created');
          if (onSuccess) onSuccess();
        } else {
          setFormError(res.message || res.reason || 'Failed to create profile');
        }
      }
    } catch (err) {
      setFormError(err?.message || 'Save failed');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (isOnlyProfile || !isEditing) return;

    setIsDeleting(true);
    try {
      const res = await deleteProfile(profile.id);
      if (res.ok) {
        showSuccess('Profile deleted');
        if (onSuccess) onSuccess();
      } else {
        showError(res.message || 'Failed to delete profile');
        setShowDeleteConfirm(false);
      }
    } catch (err) {
      showError(err?.message || 'Delete failed');
      setShowDeleteConfirm(false);
    } finally {
      setIsDeleting(false);
    }
  };

  const visibleAvatars = isKids ? KIDS_AVATARS : ADULT_AVATARS;

  return (
    <div className="navbar-settings-profile-form">
      <header className="navbar-settings-header no-border">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button
            type="button"
            className="settings-back-btn"
            onClick={onCancel}
            aria-label="Back to profiles list"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h3>{isEditing ? 'Edit Profile' : 'Add Profile'}</h3>
            <p className="signin-subtitle">
              {isEditing ? 'Update profile information' : 'Create a new viewing profile'}
            </p>
          </div>
        </div>
        <button type="button" onClick={onCancel} aria-label="Close form">
          <X />
        </button>
      </header>

      {formError && (
        <div className="settings-form-alert error" role="alert">
          {formError}
        </div>
      )}

      <form onSubmit={handleSubmit} className="settings-profile-form-content">
        {/* Name input */}
        <div className="settings-form-group">
          <label htmlFor="profile-name-input" className="settings-form-label">
            <span>Name</span>
            <span className="settings-char-count">{name.length}/20</span>
          </label>
          <input
            id="profile-name-input"
            type="text"
            className="settings-form-input"
            value={name}
            onChange={(e) => setName(e.target.value.slice(0, 20))}
            placeholder="e.g. Sarah"
            maxLength={20}
            autoFocus
          />
        </div>

        {/* Kids Mode Toggle */}
        <div className="settings-form-group toggle-group">
          <div className="settings-toggle-info">
            <span className="settings-toggle-title">Kids Profile</span>
            <span className="settings-toggle-desc">
              Restricts content to child-friendly movies and TV series.
            </span>
          </div>
          <label className="settings-switch">
            <input
              type="checkbox"
              checked={isKids}
              onChange={(e) => handleKidsToggle(e.target.checked)}
            />
            <span className="settings-slider round" />
          </label>
        </div>

        {/* Avatar Picker */}
        <div className="settings-form-group">
          <label className="settings-form-label">
            <span>Choose Avatar</span>
          </label>
          <div className="settings-avatar-grid">
            {visibleAvatars.map((avId) => {
              const isSelected = avatar === avId;
              return (
                <button
                  key={avId}
                  type="button"
                  className={`settings-avatar-option ${isSelected ? 'selected' : ''}`}
                  onClick={() => setAvatar(avId)}
                  aria-label={`Select avatar ${avId}`}
                >
                  <img
                    src={`/avatars/${avId}.webp`}
                    alt={avId}
                    className="settings-avatar-option-img"
                    onError={(e) => {
                      e.currentTarget.src = '/avatars/avatar_01.webp';
                    }}
                  />
                  {isSelected && (
                    <div className="settings-avatar-selected-check">
                      <Check size={12} />
                    </div>
                  )}
                  {isKids && <span className="settings-avatar-kid-tag">KIDS</span>}
                </button>
              );
            })}
          </div>
        </div>

        {/* Kids PIN Setup - Existing Kids Profile */}
        {isKids && isExistingKidsProfile && (
          <div className="settings-form-group">
            <div className="settings-pin-horizontal-row">
              <div className="settings-form-group pin-group">
                <label htmlFor="current-pin-input" className="settings-form-label">
                  <span>Current PIN (4 digits)</span>
                </label>
                <input
                  id="current-pin-input"
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  className={`settings-form-input pin-input ${currentPinError ? 'input-error' : ''}`}
                  value={currentPin}
                  onChange={(e) => {
                    const val = e.target.value.replace(/[^0-9]/g, '').slice(0, 4);
                    setCurrentPin(val);
                    setCurrentPinError('');
                    setPinError('');
                  }}
                  placeholder="••••"
                  maxLength={4}
                />
                {currentPinError && (
                  <span className="settings-field-error">{currentPinError}</span>
                )}
              </div>

              <div className="settings-form-group pin-group">
                <label htmlFor="kids-pin-input" className="settings-form-label">
                  <span>New Parental Exit PIN</span>
                </label>
                <input
                  id="kids-pin-input"
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  className={`settings-form-input pin-input ${pinError ? 'input-error' : ''}`}
                  value={pin}
                  onChange={(e) => {
                    const val = e.target.value.replace(/[^0-9]/g, '').slice(0, 4);
                    setPin(val);
                    setPinError('');
                    setCurrentPinError('');
                  }}
                  placeholder="••••"
                  maxLength={4}
                />
                {pinError && (
                  <span className="settings-field-error">{pinError}</span>
                )}
              </div>
            </div>
            <span className="settings-field-hint">
              Enter current PIN and new PIN to change it, or leave blank to keep existing PIN.
            </span>
          </div>
        )}

        {/* Kids PIN Setup - New Profile or Converting from Adult */}
        {isKids && !isExistingKidsProfile && (
          <div className="settings-form-group pin-group">
            <label htmlFor="kids-pin-input" className="settings-form-label">
              <span>Parental Exit PIN (4 digits)</span>
            </label>
            <input
              id="kids-pin-input"
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              className={`settings-form-input pin-input ${pinError ? 'input-error' : ''}`}
              value={pin}
              onChange={(e) => {
                const val = e.target.value.replace(/[^0-9]/g, '').slice(0, 4);
                setPin(val);
                setPinError('');
              }}
              placeholder="••••"
              maxLength={4}
            />
            {pinError ? (
              <span className="settings-field-error">{pinError}</span>
            ) : (
              <span className="settings-field-hint">
                This PIN is required to exit the Kids profile.
              </span>
            )}
          </div>
        )}

        {/* Submit & Cancel Buttons */}
        <div className="settings-form-actions">
          <button
            type="submit"
            className="settings-primary-btn"
            disabled={isSaving}
          >
            {isSaving ? 'Saving...' : isEditing ? 'Save Changes' : 'Create Profile'}
          </button>
          <button
            type="button"
            className="settings-secondary-btn"
            onClick={onCancel}
            disabled={isSaving}
          >
            Cancel
          </button>
        </div>

        {/* Delete Profile Section in Edit Mode */}
        {isEditing && (
          <div className="settings-delete-section">
            {!showDeleteConfirm ? (
              <button
                type="button"
                className="settings-delete-trigger-btn"
                disabled={isOnlyProfile}
                onClick={() => setShowDeleteConfirm(true)}
                title={isOnlyProfile ? 'Cannot delete the final profile' : 'Delete profile'}
              >
                <Trash2 size={16} />
                <span>Delete Profile</span>
              </button>
            ) : (
              <div className="settings-delete-confirm-box">
                <div className="settings-delete-confirm-header">
                  <AlertTriangle size={18} color="#ef4444" />
                  <span>Delete this profile?</span>
                </div>
                <p className="settings-delete-confirm-text">
                  This will permanently delete this profile and all of its watchlist and watch history. This cannot be undone.
                </p>
                <div className="settings-delete-confirm-actions">
                  <button
                    type="button"
                    className="settings-danger-btn"
                    onClick={handleDelete}
                    disabled={isDeleting}
                  >
                    {isDeleting ? 'Deleting...' : 'Yes, Delete'}
                  </button>
                  <button
                    type="button"
                    className="settings-secondary-btn"
                    onClick={() => setShowDeleteConfirm(false)}
                    disabled={isDeleting}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
            {isOnlyProfile && (
              <span className="settings-delete-disabled-hint">
                Accounts must have at least one profile.
              </span>
            )}
          </div>
        )}
      </form>
    </div>
  );
}
