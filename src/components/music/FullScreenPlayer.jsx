import React, { useState, useRef, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
    Play,
    Pause,
    SkipBack,
    SkipForward,
    X,
    ListMusic,
    MoreHorizontal,
    Shuffle,
    Repeat,
    Repeat1,
    MicVocal
} from 'lucide-react';
import { useMusicPlayer } from '../../contexts/MusicPlayerContext';
import DynamicBackgroundWebGL from './DynamicBackgroundWebGL';
import TrackMenu from './TrackMenu';
import AmLyricsWrapper from './AmLyricsWrapper';
import './FullScreenPlayer.css';

/**
 * Format time from seconds to mm:ss
 */
const formatTime = (seconds) => {
    if (!seconds || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const FullScreenPlayer = ({ onClose, onLyricsOpen }) => {
    const {
        currentTrack,
        isPlaying,
        currentTime,
        duration,
        togglePlay,
        next,
        previous,
        setCurrentTime,
        hasNext,
        hasPrevious,
        shuffleQueue,
        repeatMode,
        toggleRepeat,
        enqueue,
        enqueueNext
    } = useMusicPlayer();

    const navigate = useNavigate();

    const [isSeeking, setIsSeeking] = useState(false);
    const [seekPosition, setSeekPosition] = useState(0);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [menuPosition, setMenuPosition] = useState(null);
    const [isLyricsVisible, setIsLyricsVisible] = useState(false);
    const containerRef = useRef(null);
    const progressRef = useRef(null);

    // Handle Browser Fullscreen API - Listeners and Logic
    useEffect(() => {
        const handleFullscreenChange = () => {
            if (!document.fullscreenElement &&
                !document.webkitFullscreenElement &&
                !document.msFullscreenElement) {
                onClose();
            }
        };

        const events = [
            'fullscreenchange',
            'webkitfullscreenchange',
            'mozfullscreenchange',
            'MSFullscreenChange'
        ];

        events.forEach(event => document.addEventListener(event, handleFullscreenChange));

        return () => {
            events.forEach(event => document.removeEventListener(event, handleFullscreenChange));
        };
    }, [onClose]);

    // Handle Cleanup on Unmount ONLY
    useEffect(() => {
        return () => {
            // Force exit if component UNMOUNTS while still in fullscreen
            // This runs only when the component is truly destroyed/removed
            if (document.fullscreenElement) {
                try {
                    document.exitFullscreen().catch(() => { });
                } catch (e) { /* ignore */ }
            }
        };
    }, []);

    // Keep Escape key as fallback if Fullscreen API fails or isn't supported
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') {
                // If we are not in fullscreen mode (API), call onClose directly
                if (!document.fullscreenElement) {
                    onClose();
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    // Progress bar interaction
    const handleProgressClick = useCallback((e) => {
        if (!progressRef.current || !duration) return;
        const rect = progressRef.current.getBoundingClientRect();
        const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        const newTime = percent * duration;
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
        if (isSeeking) {
            setCurrentTime(seekPosition);
            setIsSeeking(false);
        }
    }, [isSeeking, seekPosition, setCurrentTime]);

    const handleMenuOpen = (e) => {
        e.stopPropagation();
        const rect = e.currentTarget.getBoundingClientRect();
        // Position menu above the button
        setMenuPosition({ x: rect.left, y: rect.top - 10 });
        setIsMenuOpen(true);
    };

    const handleMenuClose = () => {
        setIsMenuOpen(false);
        setMenuPosition(null);
    };

    const handleViewAlbum = (album) => {
        if (!album?.id) return;
        navigate(`/music/album/${album.id}`);
        onClose();
    };

    const handleViewArtist = (artist) => {
        if (!artist?.id) return;
        navigate(`/music/artist/${artist.id}`);
        onClose();
    };

    if (!currentTrack) return null;

    const coverUrl = currentTrack.album?.cover
        ? `https://resources.tidal.com/images/${currentTrack.album.cover.replace(/-/g, '/')}/1280x1280.jpg`
        : currentTrack.cover
            ? `https://resources.tidal.com/images/${currentTrack.cover.replace(/-/g, '/')}/1280x1280.jpg`
            : null;

    const artistName = currentTrack.artist?.name ?? currentTrack.artists?.[0]?.name ?? 'Unknown Artist';
    const progress = duration > 0 ? ((isSeeking ? seekPosition : currentTime) / duration) * 100 : 0;

    const [showBackground, setShowBackground] = useState(false);

    // Defer heavy background render until animation completes
    useEffect(() => {
        const timer = setTimeout(() => {
            setShowBackground(true);
        }, 450); // Slightly longer than the 400ms slide-up animation
        return () => clearTimeout(timer);
    }, []);

    // ... (rest of component) ...

    return (
        <>
            {ReactDOM.createPortal(
                <div className="fullscreen-player" ref={containerRef}>
                    {showBackground && (
                        <DynamicBackgroundWebGL className="fullscreen-player__bg" coverUrl={coverUrl} />
                    )}

                    <div className={`fullscreen-player__content ${isLyricsVisible ? 'with-lyrics' : ''}`}>
                        {/* Center Container for proper vertical spacing */}
                        <div className="fullscreen-player__center-container">

                            {/* Album Art Area */}
                            <div className="fullscreen-player__art-section">
                                <div className="fullscreen-player__art-wrapper">
                                    {coverUrl && (
                                        <img
                                            src={coverUrl}
                                            alt={currentTrack.title}
                                            className={`fullscreen-player__art ${isPlaying ? 'is-playing' : 'is-paused'}`}
                                        />
                                    )}
                                </div>
                            </div>

                            {/* Metadata */}
                            <div className="fullscreen-player__metadata">
                                {/* Title & Artist - kept for context but clean style */}
                                <div className="fullscreen-player__text-info">
                                    <div className="fullscreen-player__title-row">
                                        <h1 className="fullscreen-player__title">{currentTrack.title}</h1>
                                        {/* Optional: Explicit tag or other icons */}
                                    </div>
                                    <h2 className="fullscreen-player__artist">{artistName}</h2>
                                </div>
                            </div>

                            {/* Progress Bar Section (Above Time Labels) */}
                            <div className="fullscreen-player__progress-section">
                                <div
                                    className="fullscreen-player__progress-bar"
                                    ref={progressRef}
                                    onClick={handleProgressClick}
                                    onMouseDown={handleSeekStart}
                                    onMouseMove={handleSeekMove}
                                    onMouseUp={handleSeekEnd}
                                    onMouseLeave={handleSeekEnd}
                                >
                                    <div className="fullscreen-player__progress-bg" />
                                    <div
                                        className="fullscreen-player__progress-fill"
                                        style={{ width: `${progress}%` }}
                                    />
                                    <div
                                        className="fullscreen-player__progress-thumb"
                                        style={{ left: `${progress}%` }}
                                    />
                                </div>

                                <div className="fullscreen-player__time-labels">
                                    <span>{formatTime(isSeeking ? seekPosition : currentTime)}</span>
                                    <span>-{formatTime(Math.max(0, duration - (isSeeking ? seekPosition : currentTime)))}</span>
                                </div>
                            </div>

                            {/* Main Controls Row: More | Prev | Play | Next | Lyrics */}
                            <div className="fullscreen-player__controls-row">
                                {/* More Button (Far Left) */}
                                <button
                                    className="fullscreen-player__control-btn fullscreen-player__more-btn"
                                    onClick={handleMenuOpen}
                                    aria-label="More options"
                                >
                                    <MoreHorizontal size={24} />
                                </button>

                                {/* Playback Controls (Center) */}
                                <div className="fullscreen-player__playback-group">
                                    <button
                                        className="fullscreen-player__control-btn fullscreen-player__skip-btn"
                                        onClick={previous}
                                        disabled={!hasPrevious}
                                    >
                                        <SkipBack size={36} fill="currentColor" />
                                    </button>

                                    <button
                                        className="fullscreen-player__control-btn fullscreen-player__play-btn"
                                        onClick={togglePlay}
                                    >
                                        {isPlaying ? (
                                            <Pause size={48} fill="currentColor" />
                                        ) : (
                                            <Play size={48} fill="currentColor" />
                                        )}
                                    </button>

                                    <button
                                        className="fullscreen-player__control-btn fullscreen-player__skip-btn"
                                        onClick={next}
                                        disabled={!hasNext}
                                    >
                                        <SkipForward size={36} fill="currentColor" />
                                    </button>
                                </div>

                                {/* Lyrics Button (Far Right) */}
                                <button
                                    className={`fullscreen-player__control-btn fullscreen-player__lyrics-btn ${isLyricsVisible ? 'active' : ''}`}
                                    onClick={() => setIsLyricsVisible(!isLyricsVisible)}
                                >
                                    <MicVocal size={24} />
                                </button>
                            </div>
                        </div>

                        {/* Lyrics Pane (Desktop) */}
                        {isLyricsVisible && (
                            <div className="fullscreen-player__lyrics-pane">
                                <AmLyricsWrapper className="fullscreen-player__lyrics-content" />
                            </div>
                        )}
                    </div>
                </div>,
                document.body
            )}

            {isMenuOpen && (
                <TrackMenu
                    track={currentTrack}
                    position={menuPosition}
                    onClose={handleMenuClose}
                    onAddToQueue={enqueue}
                    onViewAlbum={handleViewAlbum}
                    onViewArtist={handleViewArtist}
                />
            )}
        </>
    );
};

export default FullScreenPlayer;
