import { useState, useCallback, useRef, useMemo } from 'react';

/**
 * Download stages
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

/**
 * useDownloadUI - Hook for managing download UI state
 * 
 * Ported from tidal-ui/src/lib/stores/downloadUi.ts
 * Provides:
 * - Track download progress tracking
 * - FFmpeg countdown and progress
 * - Download task management
 * - Error handling
 */
const useDownloadUI = () => {
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

        return { taskId, controller };
    }, []);

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

        // Clear active task after delay
        setTimeout(() => {
            setTasks(prev => {
                const updated = new Map(prev);
                updated.delete(taskId);
                return updated;
            });
            if (activeTaskId === taskId) {
                setActiveTaskId(null);
            }
        }, 2000);
    }, [activeTaskId]);

    /**
     * Error on track download
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
     * Start FFmpeg countdown
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

    /**
     * Skip FFmpeg countdown
     */
    const skipFfmpegCountdown = useCallback(() => {
        setFfmpegState(prev => {
            if (prev.stage === DOWNLOAD_STAGES.FFMPEG_COUNTDOWN) {
                return { ...prev, stage: DOWNLOAD_STAGES.FFMPEG_LOADING };
            }
            return prev;
        });
    }, []);

    /**
     * Start FFmpeg loading
     */
    const startFfmpegLoading = useCallback(() => {
        setFfmpegState(prev => ({
            ...prev,
            stage: DOWNLOAD_STAGES.FFMPEG_LOADING
        }));
    }, []);

    /**
     * Update FFmpeg progress
     */
    const updateFfmpegProgress = useCallback((progress) => {
        setFfmpegState(prev => ({
            ...prev,
            stage: DOWNLOAD_STAGES.FFMPEG_PROCESSING,
            progress
        }));
    }, []);

    /**
     * Complete FFmpeg
     */
    const completeFfmpeg = useCallback(() => {
        setFfmpegState({
            stage: DOWNLOAD_STAGES.IDLE,
            progress: 0,
            totalBytes: 0,
            autoTriggered: false,
            error: null
        });
    }, []);

    /**
     * FFmpeg error
     */
    const errorFfmpeg = useCallback((error) => {
        setFfmpegState(prev => ({
            ...prev,
            stage: DOWNLOAD_STAGES.ERROR,
            error: error instanceof Error ? error.message : String(error)
        }));
    }, []);

    /**
     * Reset FFmpeg state
     */
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
     * Get active task
     */
    const activeTask = useMemo(() => {
        return activeTaskId ? tasks.get(activeTaskId) : null;
    }, [tasks, activeTaskId]);

    /**
     * Check if downloading
     */
    const isDownloading = useMemo(() => {
        return Array.from(tasks.values()).some(
            t => t.stage === DOWNLOAD_STAGES.DOWNLOADING
        );
    }, [tasks]);

    return {
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
        resetFfmpeg
    };
};

export default useDownloadUI;
