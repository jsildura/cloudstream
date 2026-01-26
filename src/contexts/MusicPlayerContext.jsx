import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';

/**
 * Audio quality options
 */
export const AUDIO_QUALITIES = {
    HI_RES_LOSSLESS: 'HI_RES_LOSSLESS',
    LOSSLESS: 'LOSSLESS',
    HIGH: 'HIGH',
    LOW: 'LOW'
};

const STORAGE_KEY = 'music_player_state';

/**
 * Initial player state
 */
const getInitialState = () => {
    const defaultState = {
        currentTrack: null,
        isPlaying: false,
        currentTime: 0,
        duration: 0,
        volume: 0.8,
        quality: AUDIO_QUALITIES.LOSSLESS,
        qualitySource: 'manual', // 'auto' | 'manual'
        isLoading: false,
        queue: [],
        queueIndex: -1,
        sampleRate: null,
        bitDepth: null,
        replayGain: null
    };

    // Try to restore from sessionStorage
    try {
        const stored = sessionStorage.getItem(STORAGE_KEY);
        if (stored) {
            const parsed = JSON.parse(stored);
            return {
                ...defaultState,
                ...parsed,
                isPlaying: false, // Don't auto-play on restore
                isLoading: false
            };
        }
    } catch (e) {
        console.warn('Failed to restore player state', e);
    }

    return defaultState;
};

/**
 * MusicPlayerContext
 */
const MusicPlayerContext = createContext(null);

/**
 * MusicPlayerProvider - Manages audio player state
 * 
 * Ported from tidal-ui/src/lib/stores/player.ts
 * Provides:
 * - Current track, queue, playback state
 * - Play/pause/next/previous controls
 * - Volume, quality, audio info (sampleRate, bitDepth)
 * - Queue management (enqueue, shuffle, remove)
 * - Session storage persistence
 */
export const MusicPlayerProvider = ({ children }) => {
    const [state, setState] = useState(getInitialState);
    const stateRef = useRef(state);

    // Keep ref in sync
    useEffect(() => {
        stateRef.current = state;
    }, [state]);

    // Persist to sessionStorage on state change
    useEffect(() => {
        try {
            const toSave = {
                currentTrack: state.currentTrack,
                queue: state.queue,
                queueIndex: state.queueIndex,
                volume: state.volume,
                quality: state.quality,
                qualitySource: state.qualitySource,
                currentTime: state.currentTime,
                duration: state.duration,
                sampleRate: state.sampleRate,
                bitDepth: state.bitDepth,
                replayGain: state.replayGain
            };
            sessionStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
        } catch (e) {
            console.warn('Failed to save player state', e);
        }
    }, [state]);

    // =====================
    // Basic Playback Actions
    // =====================

    const setTrack = useCallback((track) => {
        setState(prev => ({
            ...prev,
            currentTrack: track,
            duration: track?.duration ?? 0,
            currentTime: 0,
            isLoading: true,
            sampleRate: null,
            bitDepth: null,
            replayGain: null
        }));
    }, []);

    const play = useCallback(() => {
        setState(prev => ({ ...prev, isPlaying: true }));
    }, []);

    const pause = useCallback(() => {
        setState(prev => ({ ...prev, isPlaying: false }));
    }, []);

    const togglePlay = useCallback(() => {
        setState(prev => ({ ...prev, isPlaying: !prev.isPlaying }));
    }, []);

    const setCurrentTime = useCallback((time) => {
        setState(prev => ({ ...prev, currentTime: time }));
    }, []);

    const setDuration = useCallback((duration) => {
        setState(prev => ({ ...prev, duration }));
    }, []);

    const setVolume = useCallback((volume) => {
        setState(prev => ({ ...prev, volume: Math.max(0, Math.min(1, volume)) }));
    }, []);

    const setLoading = useCallback((isLoading) => {
        setState(prev => ({ ...prev, isLoading }));
    }, []);

    // =====================
    // Audio Info Actions
    // =====================

    const setSampleRate = useCallback((sampleRate) => {
        setState(prev => ({ ...prev, sampleRate }));
    }, []);

    const setBitDepth = useCallback((bitDepth) => {
        setState(prev => ({ ...prev, bitDepth }));
    }, []);

    const setReplayGain = useCallback((replayGain) => {
        setState(prev => ({ ...prev, replayGain }));
    }, []);

    // =====================
    // Quality Actions
    // =====================

    const setQuality = useCallback((quality) => {
        setState(prev => ({ ...prev, quality, qualitySource: 'manual' }));
    }, []);

    // =====================
    // Queue Actions
    // =====================

    const setQueue = useCallback((queue, startIndex = 0) => {
        setState(prev => {
            const hasTracks = queue.length > 0;
            const clampedIndex = hasTracks
                ? Math.min(Math.max(startIndex, 0), queue.length - 1)
                : -1;
            const nextTrack = hasTracks ? queue[clampedIndex] : null;

            return {
                ...prev,
                queue,
                queueIndex: clampedIndex,
                currentTrack: nextTrack,
                isPlaying: hasTracks ? prev.isPlaying : false,
                isLoading: hasTracks,
                currentTime: 0,
                duration: nextTrack?.duration ?? 0,
                sampleRate: null,
                bitDepth: null,
                replayGain: null
            };
        });
    }, []);

    const enqueue = useCallback((track) => {
        setState(prev => {
            const queue = [...prev.queue];

            if (queue.length === 0) {
                return {
                    ...prev,
                    queue: [track],
                    queueIndex: 0,
                    currentTrack: track,
                    isPlaying: true,
                    isLoading: true,
                    currentTime: 0,
                    duration: track.duration ?? 0,
                    sampleRate: null,
                    bitDepth: null,
                    replayGain: null
                };
            }

            queue.push(track);
            return { ...prev, queue };
        });
    }, []);

    const enqueueNext = useCallback((track) => {
        setState(prev => {
            const queue = [...prev.queue];
            let queueIndex = prev.queueIndex;

            if (queue.length === 0 || queueIndex === -1) {
                return {
                    ...prev,
                    queue: [track],
                    queueIndex: 0,
                    currentTrack: track,
                    isPlaying: true,
                    isLoading: true,
                    currentTime: 0,
                    duration: track.duration ?? 0,
                    sampleRate: null,
                    bitDepth: null,
                    replayGain: null
                };
            }

            const insertIndex = Math.min(queueIndex + 1, queue.length);
            queue.splice(insertIndex, 0, track);
            if (insertIndex <= queueIndex) {
                queueIndex += 1;
            }

            return { ...prev, queue, queueIndex };
        });
    }, []);

    const next = useCallback(() => {
        setState(prev => {
            if (prev.queueIndex < prev.queue.length - 1) {
                const newIndex = prev.queueIndex + 1;
                const nextTrack = prev.queue[newIndex] ?? null;
                return {
                    ...prev,
                    queueIndex: newIndex,
                    currentTrack: nextTrack,
                    currentTime: 0,
                    duration: nextTrack?.duration ?? 0,
                    isPlaying: true,
                    isLoading: true,
                    sampleRate: null,
                    bitDepth: null,
                    replayGain: null
                };
            }
            return prev;
        });
    }, []);

    const previous = useCallback(() => {
        setState(prev => {
            if (prev.queueIndex > 0) {
                const newIndex = prev.queueIndex - 1;
                const nextTrack = prev.queue[newIndex] ?? null;
                return {
                    ...prev,
                    queueIndex: newIndex,
                    currentTrack: nextTrack,
                    currentTime: 0,
                    duration: nextTrack?.duration ?? 0,
                    isPlaying: true,
                    sampleRate: null,
                    bitDepth: null,
                    replayGain: null
                };
            }
            return prev;
        });
    }, []);

    const shuffleQueue = useCallback(() => {
        setState(prev => {
            const { queue: originalQueue, currentTrack: originalCurrent } = prev;

            if (originalQueue.length <= 1) {
                return prev;
            }

            const queue = [...originalQueue];
            let pinnedTrack = null;

            // Remove current track from shuffle
            if (originalCurrent) {
                const locatedIndex = queue.findIndex((track) => track.id === originalCurrent.id);
                if (locatedIndex >= 0) {
                    pinnedTrack = queue.splice(locatedIndex, 1)[0];
                }
            }

            // Fisher-Yates shuffle
            for (let i = queue.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [queue[i], queue[j]] = [queue[j], queue[i]];
            }

            // Put current track at the beginning
            if (pinnedTrack) {
                queue.unshift(pinnedTrack);
            }

            const nextQueueIndex = queue.length > 0 ? 0 : -1;
            const nextCurrentTrack = queue.length > 0 ? queue[0] : null;

            return {
                ...prev,
                queue,
                queueIndex: nextQueueIndex,
                currentTrack: nextCurrentTrack,
                currentTime: prev.currentTime,
                duration: nextCurrentTrack?.duration ?? 0,
                sampleRate: null,
                bitDepth: null,
                replayGain: null
            };
        });
    }, []);

    const playAtIndex = useCallback((index) => {
        setState(prev => {
            if (index < 0 || index >= prev.queue.length) {
                return prev;
            }

            const nextTrack = prev.queue[index] ?? null;
            return {
                ...prev,
                queueIndex: index,
                currentTrack: nextTrack,
                currentTime: 0,
                isPlaying: true,
                isLoading: true,
                duration: nextTrack?.duration ?? 0,
                sampleRate: null,
                bitDepth: null,
                replayGain: null
            };
        });
    }, []);

    const removeFromQueue = useCallback((index) => {
        setState(prev => {
            if (index < 0 || index >= prev.queue.length) {
                return prev;
            }

            const queue = [...prev.queue];
            queue.splice(index, 1);

            let queueIndex = prev.queueIndex;
            let currentTrack = prev.currentTrack;
            let isPlaying = prev.isPlaying;
            let isLoading = prev.isLoading;
            let currentTime = prev.currentTime;
            let duration = prev.duration;

            if (queue.length === 0) {
                return {
                    ...prev,
                    queue,
                    queueIndex: -1,
                    currentTrack: null,
                    isPlaying: false,
                    isLoading: false,
                    currentTime: 0,
                    duration: 0,
                    sampleRate: null,
                    bitDepth: null,
                    replayGain: null
                };
            }

            if (index < queueIndex) {
                queueIndex -= 1;
            } else if (index === queueIndex) {
                if (queueIndex >= queue.length) {
                    queueIndex = queue.length - 1;
                }
                currentTrack = queue[queueIndex] ?? null;
                currentTime = 0;
                duration = currentTrack?.duration ?? 0;
                if (!currentTrack) {
                    isPlaying = false;
                    isLoading = false;
                } else {
                    isLoading = true;
                }
            }

            return {
                ...prev,
                queue,
                queueIndex,
                currentTrack,
                isPlaying,
                isLoading,
                currentTime,
                duration
            };
        });
    }, []);

    const clearQueue = useCallback(() => {
        setState(prev => ({
            ...prev,
            queue: [],
            queueIndex: -1,
            currentTrack: null,
            isPlaying: false,
            isLoading: false,
            currentTime: 0,
            duration: 0,
            sampleRate: null,
            bitDepth: null,
            replayGain: null
        }));
    }, []);

    const reset = useCallback(() => {
        setState(getInitialState());
    }, []);

    // =====================
    // Derived Values
    // =====================

    const progress = useMemo(() => {
        return state.duration > 0 ? (state.currentTime / state.duration) * 100 : 0;
    }, [state.currentTime, state.duration]);

    const hasNext = useMemo(() => {
        return state.queueIndex < state.queue.length - 1;
    }, [state.queueIndex, state.queue.length]);

    const hasPrevious = useMemo(() => {
        return state.queueIndex > 0;
    }, [state.queueIndex]);

    const value = useMemo(() => ({
        // State
        currentTrack: state.currentTrack,
        isPlaying: state.isPlaying,
        currentTime: state.currentTime,
        duration: state.duration,
        volume: state.volume,
        quality: state.quality,
        qualitySource: state.qualitySource,
        isLoading: state.isLoading,
        queue: state.queue,
        queueIndex: state.queueIndex,
        sampleRate: state.sampleRate,
        bitDepth: state.bitDepth,
        replayGain: state.replayGain,

        // Derived
        progress,
        hasNext,
        hasPrevious,

        // Basic playback actions
        setTrack,
        play,
        pause,
        togglePlay,
        setCurrentTime,
        setDuration,
        setVolume,
        setLoading,

        // Audio info actions
        setSampleRate,
        setBitDepth,
        setReplayGain,

        // Quality actions
        setQuality,

        // Queue actions
        setQueue,
        enqueue,
        enqueueNext,
        next,
        previous,
        shuffleQueue,
        playAtIndex,
        removeFromQueue,
        clearQueue,
        reset
    }), [
        state,
        progress,
        hasNext,
        hasPrevious,
        setTrack,
        play,
        pause,
        togglePlay,
        setCurrentTime,
        setDuration,
        setVolume,
        setLoading,
        setSampleRate,
        setBitDepth,
        setReplayGain,
        setQuality,
        setQueue,
        enqueue,
        enqueueNext,
        next,
        previous,
        shuffleQueue,
        playAtIndex,
        removeFromQueue,
        clearQueue,
        reset
    ]);

    return (
        <MusicPlayerContext.Provider value={value}>
            {children}
        </MusicPlayerContext.Provider>
    );
};

/**
 * Hook to access music player context
 */
export const useMusicPlayer = () => {
    const context = useContext(MusicPlayerContext);
    if (!context) {
        throw new Error('useMusicPlayer must be used within a MusicPlayerProvider');
    }
    return context;
};

export default MusicPlayerContext;
