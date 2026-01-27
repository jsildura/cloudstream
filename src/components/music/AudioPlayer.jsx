import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
    Play,
    Pause,
    SkipBack,
    SkipForward,
    Volume2,
    VolumeX,
    Volume1,
    Shuffle,
    ListMusic,
    Download,
    Music2,
    X,
    Mic2,
    Trash2,
    Maximize2
} from 'lucide-react';
import { useMusicPlayer } from '../../contexts/MusicPlayerContext';
import { useMusicPreferences } from '../../contexts/MusicPreferencesContext';
import { losslessAPI } from '../../lib/music';
import FullScreenPlayer from './FullScreenPlayer';
import './AudioPlayer.css';

/**
 * Format time from seconds to mm:ss
 */
const formatTime = (seconds) => {
    if (!seconds || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
};

/**
 * Get cover image URL
 */
const getCoverUrl = (track, size = 160) => {
    if (!track) return null;
    if (track.album?.cover) {
        return `https://resources.tidal.com/images/${track.album.cover.replace(/-/g, '/')}/${size}x${size}.jpg`;
    }
    if (track.cover) {
        return `https://resources.tidal.com/images/${track.cover.replace(/-/g, '/')}/${size}x${size}.jpg`;
    }
    return null;
};

/**
 * AudioPlayer - Fixed bottom audio player component
 * 
 * Ported from tidal-ui AudioPlayer.svelte
 * Features:
 * - Playback controls
 * - Progress bar with seek
 * - Volume control
 * - Queue panel
 * - Track info display
 * - Audio quality indicator
 */
const AudioPlayer = ({ onLyricsOpen }) => {
    const {
        currentTrack,
        isPlaying,
        currentTime,
        duration,
        volume,
        isLoading,
        queue,
        queueIndex,
        sampleRate,
        bitDepth,
        hasNext,
        hasPrevious,
        play,
        pause,
        togglePlay,
        next,
        previous,
        setCurrentTime,
        setVolume,
        shuffleQueue,
        playAtIndex,
        setLoading,
        setSampleRate,
        setBitDepth,
        setReplayGain,
        removeFromQueue,
        clearQueue
    } = useMusicPlayer();

    const { playbackQuality } = useMusicPreferences();

    const [showQueue, setShowQueue] = useState(false);
    const [showFullScreen, setShowFullScreen] = useState(false);
    const [isSeeking, setIsSeeking] = useState(false);
    const [seekPosition, setSeekPosition] = useState(0);
    const [streamUrl, setStreamUrl] = useState(null);

    const audioRef = useRef(null);
    const progressRef = useRef(null);

    // Load stream when track changes
    useEffect(() => {
        // Reset stream URL immediately to stop previous track
        setStreamUrl(null);

        const loadStream = async () => {
            if (!currentTrack?.id) {
                return;
            }

            setLoading(true);
            try {
                const data = await losslessAPI.getStreamData(currentTrack.id, playbackQuality);
                setStreamUrl(data.url);
                setSampleRate(data.sampleRate);
                setBitDepth(data.bitDepth);
                setReplayGain(data.replayGain);
            } catch (err) {
                console.error('Failed to load stream:', err);
                setStreamUrl(null);
            } finally {
                setLoading(false);
            }
        };

        loadStream();
    }, [currentTrack?.id, playbackQuality, setLoading, setSampleRate, setBitDepth, setReplayGain]);

    // Audio element event handlers
    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;

        const handleTimeUpdate = () => {
            if (!isSeeking) {
                setCurrentTime(audio.currentTime);
            }
        };

        const handleEnded = () => {
            if (hasNext) {
                next();
            } else {
                pause();
            }
        };

        const handleCanPlay = () => {
            setLoading(false);
            if (isPlaying) {
                audio.play().catch(console.error);
            }
        };

        audio.addEventListener('timeupdate', handleTimeUpdate);
        audio.addEventListener('ended', handleEnded);
        audio.addEventListener('canplay', handleCanPlay);

        return () => {
            audio.removeEventListener('timeupdate', handleTimeUpdate);
            audio.removeEventListener('ended', handleEnded);
            audio.removeEventListener('canplay', handleCanPlay);
        };
    }, [isSeeking, isPlaying, hasNext, next, pause, setCurrentTime, setLoading]);

    // Play/pause sync
    useEffect(() => {
        const audio = audioRef.current;
        if (!audio || !streamUrl) return;

        if (isPlaying) {
            audio.play().catch(console.error);
        } else {
            audio.pause();
        }
    }, [isPlaying, streamUrl]);

    // Volume sync
    useEffect(() => {
        const audio = audioRef.current;
        if (audio) {
            audio.volume = volume;
        }
    }, [volume]);

    // Progress bar interaction
    const handleProgressClick = useCallback((e) => {
        if (!progressRef.current || !duration) return;

        const rect = progressRef.current.getBoundingClientRect();
        const percent = (e.clientX - rect.left) / rect.width;
        const newTime = percent * duration;

        if (audioRef.current) {
            audioRef.current.currentTime = newTime;
        }
        setCurrentTime(newTime);
    }, [duration, setCurrentTime]);

    const handleSeekStart = useCallback((e) => {
        setIsSeeking(true);
        handleProgressClick(e);
    }, [handleProgressClick]);

    const handleSeekMove = useCallback((e) => {
        if (isSeeking && progressRef.current && duration) {
            const rect = progressRef.current.getBoundingClientRect();
            const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            setSeekPosition(percent * duration);
        }
    }, [isSeeking, duration]);

    const handleSeekEnd = useCallback(() => {
        if (isSeeking && audioRef.current) {
            audioRef.current.currentTime = seekPosition;
            setCurrentTime(seekPosition);
        }
        setIsSeeking(false);
    }, [isSeeking, seekPosition, setCurrentTime]);

    // Volume icon
    const VolumeIcon = volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;

    // Progress percentage
    const progress = duration > 0 ? ((isSeeking ? seekPosition : currentTime) / duration) * 100 : 0;

    // Cover URL
    const coverUrl = getCoverUrl(currentTrack);
    const artistName = currentTrack?.artist?.name ?? currentTrack?.artists?.[0]?.name ?? '';

    // Quality badge
    const getQualityBadge = () => {
        if (!currentTrack) return null;
        if (sampleRate && bitDepth) {
            if (sampleRate > 44100 || bitDepth > 16) {
                return `${Math.round(sampleRate / 1000)}kHz/${bitDepth}bit`;
            }
            return 'CD';
        }
        if (playbackQuality === 'HI_RES_LOSSLESS') return 'Hi-Res';
        if (playbackQuality === 'LOSSLESS') return 'CD';
        if (playbackQuality === 'HIGH') return 'High';
        if (playbackQuality === 'LOW') return 'Low';
        return playbackQuality;
    };

    if (!currentTrack) {
        return null;
    }

    return (
        <>
            {/* Hidden Audio Element */}
            <audio
                ref={audioRef}
                src={streamUrl}
                preload="auto"
            />

            {/* Player Bar */}
            <div className="audio-player">
                {/* Track Info */}
                <div className="audio-player__track">
                    <div className="audio-player__cover">
                        {coverUrl ? (
                            <>
                                <img src={coverUrl} alt={currentTrack.title} />
                                <div className="audio-player__cover-overlay">
                                    <button
                                        className="audio-player__cover-fullscreen-btn"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setShowFullScreen(true);
                                            // Trigger browser native fullscreen
                                            if (document.documentElement.requestFullscreen) {
                                                document.documentElement.requestFullscreen().catch(err => {
                                                    console.warn('Error attempting to enable fullscreen:', err);
                                                });
                                            } else if (document.documentElement.webkitRequestFullscreen) { // Safari/Chrome fallback
                                                document.documentElement.webkitRequestFullscreen();
                                            } else if (document.documentElement.msRequestFullscreen) { // IE11 fallback
                                                document.documentElement.msRequestFullscreen();
                                            }
                                        }}
                                        aria-label="Fullscreen"
                                    >
                                        <Maximize2 size={24} />
                                    </button>
                                </div>
                            </>
                        ) : (
                            <div className="audio-player__cover-placeholder">
                                <Music2 size={20} />
                            </div>
                        )}
                    </div>
                    <div className="audio-player__info">
                        <div className="audio-player__title">{currentTrack.title}</div>
                        <div className="audio-player__artist">{artistName}</div>
                    </div>
                </div>

                {/* Controls */}
                <div className="audio-player__controls">
                    <div className="audio-player__buttons">
                        <button
                            className="audio-player__btn audio-player__btn--secondary"
                            onClick={shuffleQueue}
                            aria-label="Shuffle"
                        >
                            <Shuffle size={18} />
                        </button>
                        <button
                            className="audio-player__btn audio-player__btn--secondary"
                            onClick={previous}
                            disabled={!hasPrevious}
                            aria-label="Previous"
                        >
                            <SkipBack size={20} fill="currentColor" />
                        </button>
                        <button
                            className="audio-player__btn audio-player__btn--primary"
                            onClick={togglePlay}
                            disabled={isLoading}
                            aria-label={isPlaying ? 'Pause' : 'Play'}
                        >
                            {isLoading ? (
                                <div className="audio-player__loader" />
                            ) : isPlaying ? (
                                <Pause size={22} fill="currentColor" />
                            ) : (
                                <Play size={22} fill="currentColor" />
                            )}
                        </button>
                        <button
                            className="audio-player__btn audio-player__btn--secondary"
                            onClick={next}
                            disabled={!hasNext}
                            aria-label="Next"
                        >
                            <SkipForward size={20} fill="currentColor" />
                        </button>
                        <button
                            className={`audio-player__btn audio-player__btn--secondary ${showQueue ? 'is-active' : ''}`}
                            onClick={() => setShowQueue(!showQueue)}
                            aria-label="Queue"
                        >
                            <ListMusic size={18} />
                        </button>
                    </div>

                    {/* Progress Bar */}
                    <div className="audio-player__progress-container">
                        <span className="audio-player__time">
                            {formatTime(isSeeking ? seekPosition : currentTime)}
                        </span>
                        <div
                            ref={progressRef}
                            className="audio-player__progress"
                            onClick={handleProgressClick}
                            onMouseDown={handleSeekStart}
                            onMouseMove={handleSeekMove}
                            onMouseUp={handleSeekEnd}
                            onMouseLeave={handleSeekEnd}
                        >
                            <div
                                className="audio-player__progress-fill"
                                style={{ width: `${progress}%` }}
                            />
                            <div
                                className="audio-player__progress-thumb"
                                style={{ left: `${progress}%` }}
                            />
                        </div>
                        <span className="audio-player__time">
                            {formatTime(duration)}
                        </span>
                    </div>
                </div>

                {/* Right Side Actions */}
                <div className="audio-player__actions">
                    {/* Quality Badge */}
                    {getQualityBadge() && (
                        <span className="audio-player__quality">
                            {getQualityBadge()}
                        </span>
                    )}

                    {/* Lyrics Button */}
                    {onLyricsOpen && (
                        <button
                            className="audio-player__btn audio-player__btn--secondary"
                            onClick={onLyricsOpen}
                            aria-label="Lyrics"
                        >
                            <Mic2 size={18} />
                        </button>
                    )}

                    {/* Volume */}
                    <div className="audio-player__volume">
                        <button
                            className="audio-player__btn audio-player__btn--secondary"
                            onClick={() => setVolume(volume === 0 ? 1 : 0)}
                            aria-label={volume === 0 ? 'Unmute' : 'Mute'}
                        >
                            <VolumeIcon size={18} />
                        </button>
                        <input
                            type="range"
                            className="audio-player__volume-slider"
                            min="0"
                            max="1"
                            step="0.01"
                            value={volume}
                            onChange={(e) => setVolume(parseFloat(e.target.value))}
                        />
                    </div>
                </div>
            </div>

            {/* Queue Panel */}
            {showQueue && (
                <div className="audio-player__queue">
                    <div className="audio-player__queue-header">
                        <div className="audio-player__queue-title">
                            <h3>Playback Queue</h3>
                            <span className="audio-player__queue-count">{queue.length}</span>
                        </div>
                        <div className="audio-player__queue-actions">
                            <button className="audio-player__queue-action-btn" onClick={shuffleQueue}>
                                <Shuffle size={14} />
                                <span>SHUFFLE</span>
                            </button>
                            <button className="audio-player__queue-action-btn" onClick={clearQueue}>
                                <Trash2 size={14} />
                                <span>CLEAR</span>
                            </button>
                            <button className="audio-player__queue-close-btn" onClick={() => setShowQueue(false)}>
                                <X size={18} />
                            </button>
                        </div>
                    </div>
                    <div className="audio-player__queue-list">
                        {queue.map((track, index) => (
                            <div
                                key={`${track.id}-${index}`}
                                className={`audio-player__queue-item ${index === queueIndex ? 'is-current' : ''}`}
                                onClick={() => playAtIndex(index)}
                            >
                                <div className="audio-player__queue-item-index">
                                    {index + 1}
                                </div>
                                <div className="audio-player__queue-item-info">
                                    <div className="audio-player__queue-item-title">
                                        {track.title}
                                    </div>
                                    <div className="audio-player__queue-item-artist">
                                        {track.artist?.name ?? track.artists?.[0]?.name ?? ''}
                                    </div>
                                </div>
                                <button
                                    className="audio-player__queue-remove-btn"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        removeFromQueue(index);
                                    }}
                                >
                                    <X size={16} />
                                </button>
                            </div>
                        ))}
                        {queue.length === 0 && (
                            <p className="audio-player__queue-empty">
                                Queue is empty
                            </p>
                        )}
                    </div>
                </div>
            )}
            {/* Fullscreen Player */}
            {showFullScreen && (
                <FullScreenPlayer
                    onClose={() => setShowFullScreen(false)}
                    onLyricsOpen={onLyricsOpen}
                />
            )}
        </>
    );
};

export default AudioPlayer;
