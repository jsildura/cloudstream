import React from 'react';
import { useProfiles } from '../../contexts/ProfileContext';
import { X, ShieldCheck, Lock, Sparkles, Tv, Clapperboard, AlertCircle } from 'lucide-react';

export default function KidsSettings({
  onClose,
  onNavigateToProfiles,
  onNavigateToPin
}) {
  const { activeProfile, isKidsMode, requestKidsExit } = useProfiles();

  const handleExitKidsClick = () => {
    const req = requestKidsExit({
      type: 'callback',
      callback: () => onNavigateToProfiles && onNavigateToProfiles()
    });
    if (req.modalOpened && onNavigateToPin) {
      onNavigateToPin();
    }
  };

  return (
    <div className="navbar-settings-parental">
      <header className="navbar-settings-header no-border">
        <div>
          <h3>Parental Controls</h3>
          <p className="signin-subtitle">
            Manage Kids mode content filters and safety protections
          </p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close settings">
          <X />
        </button>
      </header>

      {isKidsMode ? (
        <div className="settings-parental-status active">
          <div className="settings-parental-badge-row">
            <span className="kids-pill-badge large">KIDS MODE ACTIVE</span>
          </div>

          <div className="settings-parental-card">
            <h4>Active Protections for {activeProfile?.name}</h4>
            <ul className="settings-parental-list">
              <li>
                <Sparkles size={16} color="#fbbf24" />
                <span>Only age-appropriate titles (G, PG, TV-Y, TV-Y7, TV-G, TV-PG) are displayed</span>
              </li>
              <li>
                <Tv size={16} color="#38bdf8" />
                <span>Live IPTV channels and unrestricted TV sections are hidden from navigation</span>
              </li>
              <li>
                <Lock size={16} color="#ec4899" />
                <span>Switching profiles, managing settings, or signing out requires the 4-digit PIN</span>
              </li>
            </ul>
          </div>

          <div className="settings-parental-actions">
            <button
              type="button"
              className="settings-primary-btn"
              onClick={handleExitKidsClick}
            >
              Exit Kids Mode (Requires PIN)
            </button>
          </div>
        </div>
      ) : (
        <div className="settings-parental-status">
          <div className="settings-parental-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
              <ShieldCheck size={24} color="#4ade80" />
              <h4 style={{ margin: 0 }}>Create a Safe Space for Kids</h4>
            </div>
            <p style={{ fontSize: '13px', color: '#9ca3af', lineHeight: 1.5, margin: 0 }}>
              Kids profiles simplify the interface and show only titles curated for family viewing.
              Set a 4-digit PIN to prevent children from switching to adult profiles.
            </p>
          </div>

          <div className="settings-parental-actions">
            <button
              type="button"
              className="settings-primary-btn"
              onClick={onNavigateToProfiles}
            >
              Manage Profiles &amp; Add Kids Profile
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
