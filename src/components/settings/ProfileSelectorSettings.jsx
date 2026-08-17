import React, { useState } from 'react';
import { useProfiles } from '../../contexts/ProfileContext';
import { useToast } from '../../contexts/ToastContext';
import { X, Plus, Edit2, Check, ShieldAlert } from 'lucide-react';

export default function ProfileSelectorSettings({
  onClose,
  onCreateProfile,
  onEditProfile,
  onNavigateToPin
}) {
  const {
    profiles,
    activeProfileId,
    selectProfile,
    isKidsMode,
    requestKidsExit
  } = useProfiles();

  const { showSuccess } = useToast();
  const [isManageMode, setIsManageMode] = useState(false);

  const handleProfileClick = (profile) => {
    if (isManageMode) {
      // In Manage Mode, edit profile
      if (profile.id === activeProfileId && isKidsMode) {
        // Editing active Kids profile requires PIN
        const req = requestKidsExit({
          type: 'callback',
          callback: () => onEditProfile && onEditProfile(profile)
        });
        if (req.modalOpened && onNavigateToPin) {
          onNavigateToPin();
        }
      } else if (onEditProfile) {
        onEditProfile(profile);
      }
      return;
    }

    // In Normal Selection Mode
    if (profile.id === activeProfileId) {
      // Already active
      return;
    }

    if (isKidsMode) {
      // Switching away from Kids mode requires PIN
      const req = requestKidsExit({
        type: 'switch_profile',
        profileId: profile.id
      });
      if (req.modalOpened && onNavigateToPin) {
        onNavigateToPin();
      }
    } else {
      const res = selectProfile(profile.id);
      if (res.ok) {
        showSuccess(`Switched to ${profile.name}`);
      }
    }
  };

  const handleAddClick = () => {
    if (profiles.length >= 5) return;

    if (isKidsMode) {
      const req = requestKidsExit({
        type: 'callback',
        callback: () => onCreateProfile && onCreateProfile()
      });
      if (req.modalOpened && onNavigateToPin) {
        onNavigateToPin();
      }
    } else if (onCreateProfile) {
      onCreateProfile();
    }
  };

  const handleToggleManageMode = () => {
    if (!isManageMode && isKidsMode) {
      // Entering manage mode from Kids profile requires PIN
      const req = requestKidsExit({
        type: 'callback',
        callback: () => setIsManageMode(true)
      });
      if (req.modalOpened && onNavigateToPin) {
        onNavigateToPin();
      }
    } else {
      setIsManageMode((prev) => !prev);
    }
  };

  return (
    <div className="navbar-settings-profiles">
      <header className="navbar-settings-header no-border">
        <div>
          <h3>{isManageMode ? 'Manage Profiles' : "Who's Watching?"}</h3>
          <p className="signin-subtitle">
            {isManageMode
              ? 'Select a profile to edit or delete'
              : 'Choose a profile to start watching'}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {!isKidsMode && (
            <button
              type="button"
              className="settings-manage-toggle-btn"
              onClick={handleToggleManageMode}
            >
              {isManageMode ? 'Done' : 'Manage'}
            </button>
          )}
          <button type="button" onClick={onClose} aria-label="Close settings">
            <X />
          </button>
        </div>
      </header>

      <div className="settings-profiles-grid">
        {profiles.map((p) => {
          const isActive = p.id === activeProfileId;
          return (
            <button
              key={p.id}
              type="button"
              className={`settings-profile-card ${isActive ? 'active' : ''} ${isManageMode ? 'manage-mode' : ''}`}
              onClick={() => handleProfileClick(p)}
              aria-label={`${isManageMode ? 'Edit' : 'Select'} profile ${p.name}`}
            >
              <div className="settings-profile-avatar-wrap">
                <img
                  src={`/avatars/${p.avatar}.webp`}
                  alt={p.name}
                  className="settings-profile-avatar-img"
                  onError={(e) => {
                    e.currentTarget.src = '/avatars/avatar_01.webp';
                  }}
                />
                {isActive && (
                  <div className="settings-profile-active-check" title="Active Profile">
                    <Check size={14} />
                  </div>
                )}
                {isManageMode && (
                  <div className="settings-profile-edit-badge" title="Edit Profile">
                    <Edit2 size={16} />
                  </div>
                )}
              </div>

              <span className="settings-profile-card-name">
                {p.name}
              </span>

              {p.isKids && (
                <span className="kids-pill-badge small">KIDS</span>
              )}
            </button>
          );
        })}

        {/* Add Profile Card */}
        {profiles.length < 5 ? (
          <button
            type="button"
            className="settings-profile-card add-card"
            onClick={handleAddClick}
            aria-label="Add new profile"
          >
            <div className="settings-profile-add-avatar">
              <Plus size={32} />
            </div>
            <span className="settings-profile-card-name">Add Profile</span>
          </button>
        ) : (
          <div className="settings-profile-card add-card disabled" title="Max 5 profiles reached">
            <div className="settings-profile-add-avatar disabled">
              <ShieldAlert size={28} />
            </div>
            <span className="settings-profile-card-name disabled">Max Limit (5)</span>
          </div>
        )}
      </div>
    </div>
  );
}
