import React, { useEffect, useState } from 'react';
import { X, Download, Loader2, CheckCircle } from 'lucide-react';
import { useDownloadContext, DOWNLOAD_STAGES } from '../../contexts/DownloadContext';
import AdInterstitial from './AdInterstitial';
import './DownloadAdModal.css';

/**
 * DownloadAdModal - Interstitial ad modal shown during downloads
 * 
 * Flow:
 * 1. Modal opens when download starts
 * 2. File downloads + processes → blob stored (no save yet)
 * 3. Download completes (progress = 100%) → "Continue" button active
 * 4. User clicks Continue → saveAs() called → Save dialog appears → Modal closes
 */
const DownloadAdModal = () => {
    const {
        isAdModalOpen,
        closeAdModal,
        currentDownloadTrack,
        activeTask,
        pendingDownload,
        triggerPendingSave,
        albumProgress
    } = useDownloadContext();

    const [countdown, setCountdown] = useState(5);
    const [canClose, setCanClose] = useState(false);

    // Determine if this is an album download
    const isAlbumDownload = albumProgress?.isAlbum && albumProgress?.total > 0;

    // Get download progress
    // For album downloads, use track counter progress
    // For single tracks, use byte-based progress
    const progress = isAlbumDownload
        ? (albumProgress.completed / albumProgress.total) * 100
        : (activeTask?.progress ?? 0);

    const stage = activeTask?.stage ?? DOWNLOAD_STAGES.IDLE;
    const isComplete = isAlbumDownload
        ? (albumProgress.completed >= albumProgress.total && pendingDownload?.blob)
        : stage === DOWNLOAD_STAGES.COMPLETE;
    const isError = stage === DOWNLOAD_STAGES.ERROR;

    // Download is ready when blob is stored
    const isReadyToSave = pendingDownload?.blob;

    // Countdown timer controls the minimum ad display time (5 seconds)
    // But the "Save File" button only appears when download is actually complete
    useEffect(() => {
        if (!isAdModalOpen) {
            setCountdown(5);
            setCanClose(false);
            return;
        }

        // Allow close immediately if download is ready to save
        if (isReadyToSave) {
            setCanClose(true);
            return;
        }

        // Also allow close on error (after countdown finishes)
        if (isError && countdown <= 0) {
            setCanClose(true);
            return;
        }

        const timer = setInterval(() => {
            setCountdown(prev => {
                if (prev <= 1) {
                    clearInterval(timer);
                    // Don't set canClose here - wait for download to complete
                    // Only set canClose if there's an error
                    if (isError) {
                        setCanClose(true);
                    }
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(timer);
    }, [isAdModalOpen, isReadyToSave, isError, countdown]);

    /**
     * Handle Continue button click
     * Only allow save if blob is actually ready
     */
    const handleContinue = () => {
        if (isReadyToSave) {
            triggerPendingSave();
        } else if (isError) {
            closeAdModal();
        }
        // If not ready and not error, do nothing (button shouldn't be clickable)
    };

    if (!isAdModalOpen) return null;

    const trackTitle = currentDownloadTrack?.title ?? 'Track';
    const artistName = currentDownloadTrack?.artist?.name ??
        currentDownloadTrack?.artists?.[0]?.name ??
        'Unknown Artist';

    return (
        <div className="download-ad-modal-overlay" onClick={(isReadyToSave || isError) ? handleContinue : undefined}>
            <div className="download-ad-modal" onClick={e => e.stopPropagation()}>
                {/* Close button - only show when ready to save or error */}
                {(isReadyToSave || isError) && (
                    <button className="download-ad-modal__close" onClick={handleContinue}>
                        <X size={20} />
                    </button>
                )}

                {/* Header */}
                <div className="download-ad-modal__header">
                    {isReadyToSave ? (
                        <CheckCircle size={24} className="download-ad-modal__icon download-ad-modal__icon--success" />
                    ) : (
                        <Loader2 size={24} className="download-ad-modal__icon download-ad-modal__icon--loading" />
                    )}
                    <h2 className="download-ad-modal__title">
                        {isReadyToSave ? 'Ready to Save!' : 'Preparing Download...'}
                    </h2>
                </div>

                {/* Track info */}
                <div className="download-ad-modal__track">
                    <span className="download-ad-modal__track-title">{trackTitle}</span>
                    <span className="download-ad-modal__track-artist">{artistName}</span>
                </div>

                {/* Progress bar */}
                <div className="download-ad-modal__progress-container">
                    <div
                        className="download-ad-modal__progress-bar"
                        style={{ width: `${Math.min(progress, 100)}%` }}
                    />
                </div>
                <span className="download-ad-modal__progress-text">
                    {isReadyToSave ? '100% - Ready!' : (
                        isAlbumDownload
                            ? `${albumProgress.completed}/${albumProgress.total} tracks`
                            : `${Math.round(progress)}%`
                    )}
                </span>

                {/* Ad container */}
                <div className="download-ad-modal__ad-container">
                    <span className="download-ad-modal__ad-label">Sponsored</span>
                    <AdInterstitial />
                </div>

                {/* Footer */}
                <div className="download-ad-modal__footer">
                    {isReadyToSave ? (
                        <button className="download-ad-modal__btn" onClick={handleContinue}>
                            Save File
                        </button>
                    ) : isError ? (
                        <button className="download-ad-modal__btn download-ad-modal__btn--secondary" onClick={handleContinue}>
                            Close
                        </button>
                    ) : countdown > 0 ? (
                        <span className="download-ad-modal__countdown">
                            Please wait {countdown}s...
                        </span>
                    ) : (
                        <span className="download-ad-modal__countdown">
                            Downloading...
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
};

export default DownloadAdModal;

