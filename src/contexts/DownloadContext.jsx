import React, { createContext, useContext, useState, useCallback, useRef, useMemo } from 'react';

/**
 * Download stages - same as useDownloadUI
 */
export const DOWNLOAD_STAGES = {
    IDLE: 'idle',
    DOWNLOADING: 'downloading',
    FFMPEG_COUNTDOWN: 'ffmpeg_countdown',
    FFMPEG_LOADING: 'ffmpeg_loading',
    FFMPEG_PROCESSING: 'ffmpeg_processing',
    COMPLETE: 'complete',
    ERROR: 'error'
};

const DownloadContext = createContext(null);

/**
 * DownloadProvider - Global download state management
 * 
 * Wraps the useDownloadUI logic into a Context so that:
 * 1. Download state is shared across all music pages
 * 2. Ad modal can be triggered from anywhere
 * 3. Modal can be mounted once at the app level
 */
export const DownloadProvider = ({ children }) => {
    const [tasks, setTasks] = useState(new Map());
    const [activeTaskId, setActiveTaskId] = useState(null);
    const [ffmpegState, setFfmpegState] = useState({
        stage: DOWNLOAD_STAGES.IDLE,
        progress: 0,
        totalBytes: 0,
        autoTriggered: false,
        error: null
    });
    const taskIdCounter = useRef(0);

    // Ad Modal State
    const [isAdModalOpen, setIsAdModalOpen] = useState(false);
    const [currentDownloadTrack, setCurrentDownloadTrack] = useState(null);
    const [modalOpenTime, setModalOpenTime] = useState(null);

    // Pending download - blob stored until user clicks Continue
    const [pendingDownload, setPendingDownload] = useState(null);

    // Album/bulk download progress (for track counter display)
    const [albumProgress, setAlbumProgress] = useState({ completed: 0, total: 0, isAlbum: false });

    // Minimum display time (5 seconds) to ensure ad loads
    const MINIMUM_DISPLAY_MS = 5000;

    /**
     * Open ad modal when download starts
     * @param {Object} track - Track/album info to display
     * @param {Object} options - Optional: { isAlbum: true, total: 6 } for album downloads
     */
    const openAdModal = useCallback((track, options = {}) => {
        setCurrentDownloadTrack(track);
        setIsAdModalOpen(true);
        setModalOpenTime(Date.now());
        setPendingDownload(null);

        // Set album progress tracking if this is an album download
        if (options.isAlbum && options.total) {
            setAlbumProgress({ completed: 0, total: options.total, isAlbum: true });
        } else {
            setAlbumProgress({ completed: 0, total: 0, isAlbum: false });
        }
    }, []);

    /**
     * Update album download progress (track counter)
     */
    const updateAlbumProgress = useCallback((completed, total) => {
        setAlbumProgress({ completed, total, isAlbum: true });
    }, []);

    /**
     * Store pending download (blob + filename) for deferred save
     */
    const storePendingDownload = useCallback((blob, filename) => {
        setPendingDownload({ blob, filename });
    }, []);

    /**
     * Trigger save for pending download - called when user clicks Continue
     */
    const triggerPendingSave = useCallback(() => {
        if (pendingDownload?.blob && pendingDownload?.filename) {
            // Import triggerFileDownload dynamically to avoid circular deps
            const url = URL.createObjectURL(pendingDownload.blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = pendingDownload.filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            console.log(`[Download] Save triggered for: ${pendingDownload.filename}`);
        }

        // Clear pending and close modal
        setPendingDownload(null);
        setIsAdModalOpen(false);
        setCurrentDownloadTrack(null);
        setModalOpenTime(null);
    }, [pendingDownload]);

    /**
     * Close ad modal without saving (for cancel/error cases)
     */
    const closeAdModal = useCallback(() => {
        setPendingDownload(null);
        setIsAdModalOpen(false);
        setCurrentDownloadTrack(null);
        setModalOpenTime(null);
    }, []);

    /**
     * Begin a track download
     */
    const beginTrackDownload = useCallback((track, filename, options = {}) => {
        const taskId = `download_${++taskIdCounter.current}`;
        const controller = new AbortController();

        const task = {
            id: taskId,
            track,
            filename,
            subtitle: options.subtitle ?? '',
            receivedBytes: 0,
            totalBytes: 0,
            stage: DOWNLOAD_STAGES.DOWNLOADING,
            progress: 0,
            error: null,
            controller,
            startTime: Date.now()
        };

        setTasks(prev => new Map(prev).set(taskId, task));
        setActiveTaskId(taskId);

        // Open ad modal when download starts
        openAdModal(track);

        return { taskId, controller };
    }, [openAdModal]);

    /**
     * Update track download progress
     */
    const updateTrackProgress = useCallback((taskId, receivedBytes, totalBytes) => {
        setTasks(prev => {
            const task = prev.get(taskId);
            if (!task) return prev;

            const updated = new Map(prev);
            updated.set(taskId, {
                ...task,
                receivedBytes,
                totalBytes: totalBytes ?? task.totalBytes,
                progress: totalBytes ? (receivedBytes / totalBytes) * 100 : 0
            });
            return updated;
        });
    }, []);

    /**
     * Update track download stage
     */
    const updateTrackStage = useCallback((taskId, progress) => {
        setTasks(prev => {
            const task = prev.get(taskId);
            if (!task) return prev;

            const updated = new Map(prev);
            updated.set(taskId, { ...task, progress });
            return updated;
        });
    }, []);

    /**
     * Complete track download
     * NOTE: Does NOT auto-close modal - user must click Continue
     */
    const completeTrackDownload = useCallback((taskId) => {
        setTasks(prev => {
            const task = prev.get(taskId);
            if (!task) return prev;

            const updated = new Map(prev);
            updated.set(taskId, {
                ...task,
                stage: DOWNLOAD_STAGES.COMPLETE,
                progress: 100
            });
            return updated;
        });

        // Clear active task after delay (but keep modal open)
        setTimeout(() => {
            setTasks(prev => {
                const updated = new Map(prev);
                updated.delete(taskId);
                return updated;
            });
            setActiveTaskId(prev => prev === taskId ? null : prev);
        }, 2000);
    }, []);

    /**
     * Error on track download
     * NOTE: Does NOT auto-close modal - user can click Continue on error
     */
    const errorTrackDownload = useCallback((taskId, error) => {
        setTasks(prev => {
            const task = prev.get(taskId);
            if (!task) return prev;

            const updated = new Map(prev);
            updated.set(taskId, {
                ...task,
                stage: DOWNLOAD_STAGES.ERROR,
                error: error instanceof Error ? error.message : String(error)
            });
            return updated;
        });
    }, []);

    /**
     * FFmpeg state management
     */
    const startFfmpegCountdown = useCallback((totalBytes, options = {}) => {
        setFfmpegState({
            stage: DOWNLOAD_STAGES.FFMPEG_COUNTDOWN,
            progress: 0,
            totalBytes,
            autoTriggered: options.autoTriggered ?? false,
            error: null
        });
    }, []);

    const skipFfmpegCountdown = useCallback(() => {
        setFfmpegState(prev => {
            if (prev.stage === DOWNLOAD_STAGES.FFMPEG_COUNTDOWN) {
                return { ...prev, stage: DOWNLOAD_STAGES.FFMPEG_LOADING };
            }
            return prev;
        });
    }, []);

    const startFfmpegLoading = useCallback(() => {
        setFfmpegState(prev => ({
            ...prev,
            stage: DOWNLOAD_STAGES.FFMPEG_LOADING
        }));
    }, []);

    const updateFfmpegProgress = useCallback((progress) => {
        setFfmpegState(prev => ({
            ...prev,
            stage: DOWNLOAD_STAGES.FFMPEG_PROCESSING,
            progress
        }));
    }, []);

    const completeFfmpeg = useCallback(() => {
        setFfmpegState({
            stage: DOWNLOAD_STAGES.IDLE,
            progress: 0,
            totalBytes: 0,
            autoTriggered: false,
            error: null
        });
    }, []);

    const errorFfmpeg = useCallback((error) => {
        setFfmpegState(prev => ({
            ...prev,
            stage: DOWNLOAD_STAGES.ERROR,
            error: error instanceof Error ? error.message : String(error)
        }));
    }, []);

    const resetFfmpeg = useCallback(() => {
        setFfmpegState({
            stage: DOWNLOAD_STAGES.IDLE,
            progress: 0,
            totalBytes: 0,
            autoTriggered: false,
            error: null
        });
    }, []);

    /**
     * Derived state
     */
    const activeTask = useMemo(() => {
        return activeTaskId ? tasks.get(activeTaskId) : null;
    }, [tasks, activeTaskId]);

    const isDownloading = useMemo(() => {
        return Array.from(tasks.values()).some(
            t => t.stage === DOWNLOAD_STAGES.DOWNLOADING
        );
    }, [tasks]);

    const value = {
        // Tasks
        tasks: Array.from(tasks.values()),
        activeTask,
        activeTaskId,
        isDownloading,

        // Track download actions
        beginTrackDownload,
        updateTrackProgress,
        updateTrackStage,
        completeTrackDownload,
        errorTrackDownload,

        // FFmpeg state
        ffmpegState,
        startFfmpegCountdown,
        skipFfmpegCountdown,
        startFfmpegLoading,
        updateFfmpegProgress,
        completeFfmpeg,
        errorFfmpeg,
        resetFfmpeg,

        // Ad Modal
        isAdModalOpen,
        currentDownloadTrack,
        openAdModal,
        closeAdModal,

        // Album download progress
        albumProgress,
        updateAlbumProgress,

        // Deferred save
        pendingDownload,
        storePendingDownload,
        triggerPendingSave
    };

    return (
        <DownloadContext.Provider value={value}>
            {children}
        </DownloadContext.Provider>
    );
};

/**
 * useDownloadContext - Hook to access download context
 * 
 * Returns safe no-op fallbacks when used outside provider
 * (e.g., during route transitions or ad redirects)
 */
export const useDownloadContext = () => {
    const context = useContext(DownloadContext);

    // Return safe no-op fallbacks if outside provider
    // This prevents crashes during route transitions or external redirects
    if (!context) {
        return {
            tasks: [],
            activeTask: null,
            activeTaskId: null,
            isDownloading: false,
            beginTrackDownload: () => null,
            updateTrackProgress: () => { },
            updateTrackStage: () => { },
            completeTrackDownload: () => { },
            errorTrackDownload: () => { },
            ffmpegState: { stage: 'idle', progress: 0, totalBytes: 0, autoTriggered: false, error: null },
            startFfmpegCountdown: () => { },
            skipFfmpegCountdown: () => { },
            startFfmpegLoading: () => { },
            updateFfmpegProgress: () => { },
            completeFfmpeg: () => { },
            errorFfmpeg: () => { },
            resetFfmpeg: () => { },
            isAdModalOpen: false,
            currentDownloadTrack: null,
            openAdModal: () => { },
            closeAdModal: () => { },
            albumProgress: { completed: 0, total: 0, isAlbum: false },
            updateAlbumProgress: () => { },
            pendingDownload: null,
            storePendingDownload: () => { },
            triggerPendingSave: () => { }
        };
    }

    return context;
};

export default DownloadContext;
