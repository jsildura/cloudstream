import React, { useState } from 'react';
import { useProfileData } from '../../contexts/ProfileDataContext';
import { useProfiles } from '../../contexts/ProfileContext';
import { useToast } from '../../contexts/ToastContext';
import { DownloadCloud, CheckCircle2, AlertCircle, Bookmark, History, ArrowRight } from 'lucide-react';

const DataMigrationSettings = ({ onComplete, onCancel }) => {
  const {
    migrationPreview,
    acceptMigration,
    declineMigration,
    isMigrating
  } = useProfileData();
  const { activeProfile } = useProfiles();
  const { showSuccess, showError } = useToast();

  const [errorMsg, setErrorMsg] = useState(null);
  const [successResult, setSuccessResult] = useState(null);

  const handleAccept = async () => {
    setErrorMsg(null);
    const res = await acceptMigration();
    if (res?.ok) {
      setSuccessResult(res);
      showSuccess('Device data successfully imported into your profile!');
      if (onComplete) {
        setTimeout(() => onComplete(), 1500);
      }
    } else {
      const msg = res?.message || 'Failed to import device data. Please try again.';
      setErrorMsg(msg);
      showError(msg);
    }
  };

  const handleDecline = async () => {
    await declineMigration();
    if (onCancel) {
      onCancel();
    }
  };

  if (successResult) {
    return (
      <div className="settings-migration-panel">
        <div className="settings-panel-header">
          <h3 className="settings-panel-title">Data Migration Complete</h3>
          <p className="signin-subtitle">Your device data has been imported</p>
        </div>

        <div className="migration-success-card">
          <CheckCircle2 size={36} className="migration-success-icon" />
          <h3>Import Successful</h3>
          <p>
            {successResult.migratedWatchlist || 0} watchlist items and {successResult.migratedHistory || 0} history items were imported into <strong>{activeProfile?.name || 'your profile'}</strong>.
          </p>
          <button
            className="settings-action-btn primary"
            onClick={onComplete || onCancel}
          >
            <span>Continue</span>
            <ArrowRight size={15} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="settings-migration-panel">
      <div className="settings-panel-header">
        <h3 className="settings-panel-title" style={{ fontWeight: 600, fontSize: "24px", marginBottom: "7px" }}>Import Device Data</h3>
        <p className="signin-subtitle">
          Copy local watchlist and history into your profile
        </p>
      </div>

      <div className="migration-info-box">
        <DownloadCloud size={22} className="migration-info-icon" />
        <p className="migration-prompt-text">
          Your existing device watchlist and viewing history can be copied into this profile. The original device data will not be deleted. Viewing history will still be used while signed out; My List requires Google sign-in.
        </p>
      </div>

      {errorMsg && (
        <div className="migration-error-banner" role="alert">
          <AlertCircle size={16} />
          <span>{errorMsg}</span>
        </div>
      )}

      <div className="migration-preview-grid">
        <div className="migration-stat-card">
          <div className="migration-stat-icon">
            <Bookmark size={16} />
          </div>
          <div className="migration-stat-details">
            <span className="migration-stat-value">{migrationPreview.legacyWatchlistCount}</span>
            <span className="migration-stat-label">Watchlist items on device</span>
          </div>
        </div>

        <div className="migration-stat-card">
          <div className="migration-stat-icon">
            <History size={16} />
          </div>
          <div className="migration-stat-details">
            <span className="migration-stat-value">{migrationPreview.legacyHistoryCount}</span>
            <span className="migration-stat-label">History items on device</span>
          </div>
        </div>
      </div>

      <div className="migration-actions-row">
        <button
          className="settings-action-btn primary"
          onClick={handleAccept}
          disabled={isMigrating}
        >
          {isMigrating ? (
            <span>Importing...</span>
          ) : (
            <>
              <DownloadCloud size={16} />
              <span>Import into {activeProfile?.name || 'Profile'}</span>
            </>
          )}
        </button>

        <button
          className="settings-action-btn secondary"
          onClick={handleDecline}
          disabled={isMigrating}
        >
          <span>Not Now</span>
        </button>
      </div>
    </div>
  );
};

export default DataMigrationSettings;
