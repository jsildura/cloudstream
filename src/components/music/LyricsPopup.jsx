import React, { useEffect, useRef, useState, useCallback } from 'react';
import { X, RefreshCw, ChevronDown, MoreHorizontal } from 'lucide-react';
import { useMusicPlayer } from '../../contexts/MusicPlayerContext';
import './LyricsPopup.css';
import DynamicBackgroundWebGL from './DynamicBackgroundWebGL';
import AmLyricsWrapper from './AmLyricsWrapper';

/**
 * LyricsPopup - Apple Music-style fullscreen lyrics display
 * 
 * Features:
 * - Immersive fullscreen with album art gradient background
 * - Large bold lyrics with active line highlighting
 * - Track info card in header
 * - Click-to-seek functionality
 */

const LyricsPopup = ({ isOpen, onClose }) => {
    const { currentTrack, currentTime, isPlaying, seek } = useMusicPlayer();

    const [dominantColor, setDominantColor] = useState({ r: 30, g: 40, b: 60 });
    const colorCanvasRef = useRef(null);

    // Helper to get cover URL
    const getCoverUrl = (track, size = 640) => {
        if (!track) return '';

        const formatTidalUrl = (uuid) => {
            if (!uuid || typeof uuid !== 'string') return '';
            return `https://resources.tidal.com/images/${uuid.replace(/-/g, '/')}/${size}x${size}.jpg`;
        };

        if (track.album?.cover) {
            return formatTidalUrl(track.album.cover);
        }
        if (track.cover) {
            return formatTidalUrl(track.cover);
        }

        // Check if coverUrl is actually a UUID
        const coverUrl = track.album?.coverUrl || track.coverUrl;
        if (coverUrl && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(coverUrl)) {
            return formatTidalUrl(coverUrl);
        }

        return coverUrl || '';
    };

    // Build metadata from current track
    const metadata = currentTrack ? {
        title: currentTrack.title || '',
        artist: currentTrack.artist?.name ||
            currentTrack.artists?.[0]?.name ||
            '',
        album: currentTrack.album?.title || '',
        albumArt: getCoverUrl(currentTrack, 640),
        query: `${currentTrack.title || ''} ${currentTrack.artist?.name || currentTrack.artists?.[0]?.name || ''}`.trim(),
        durationMs: typeof currentTrack.duration === 'number'
            ? Math.max(0, Math.round(currentTrack.duration * 1000))
            : undefined,
        isrc: currentTrack.isrc || ''
    } : null;

    // Extract dominant color from album art
    useEffect(() => {
        if (!metadata?.albumArt) {
            setDominantColor({ r: 30, g: 40, b: 60 });
            return;
        }

        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            try {
                if (!colorCanvasRef.current) {
                    colorCanvasRef.current = document.createElement('canvas');
                }
                const canvas = colorCanvasRef.current;
                const ctx = canvas.getContext('2d', { willReadFrequently: true });
                canvas.width = 50;
                canvas.height = 50;
                ctx.drawImage(img, 0, 0, 50, 50);
                const imageData = ctx.getImageData(0, 0, 50, 50).data;

                let r = 0, g = 0, b = 0, count = 0;
                for (let i = 0; i < imageData.length; i += 16) {
                    r += imageData[i];
                    g += imageData[i + 1];
                    b += imageData[i + 2];
                    count++;
                }

                // Darken the color for better contrast with white text
                const avgR = Math.floor((r / count) * 0.4);
                const avgG = Math.floor((g / count) * 0.4);
                const avgB = Math.floor((b / count) * 0.4);

                setDominantColor({ r: avgR, g: avgG, b: avgB });
            } catch {
                setDominantColor({ r: 30, g: 40, b: 60 });
            }
        };
        img.onerror = () => setDominantColor({ r: 30, g: 40, b: 60 });
        img.src = metadata.albumArt;
    }, [metadata?.albumArt]);

    // Load component when popup opens
    useEffect(() => {
        // Wrapper handles loading
    }, [isOpen]);

    // Handle keyboard escape
    useEffect(() => {
        if (!isOpen) return;

        const handleEscape = (event) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                onClose();
            }
        };

        window.addEventListener('keydown', handleEscape);
        return () => window.removeEventListener('keydown', handleEscape);
    }, [isOpen, onClose]);

    // Toggle body class for fullscreen mode
    useEffect(() => {
        if (isOpen) {
            document.body.classList.add('lyrics-open');
        } else {
            document.body.classList.remove('lyrics-open');
        }

        return () => {
            document.body.classList.remove('lyrics-open');
        };
    }, [isOpen]);

    if (!isOpen) return null;

    const backgroundStyle = {
        '--bg-color-r': dominantColor.r,
        '--bg-color-g': dominantColor.g,
        '--bg-color-b': dominantColor.b,
    };

    return (
        <div className="lyrics-fullscreen" style={backgroundStyle}>
            {/* Gradient Background */}
            {/* Gradient Background */}
            <DynamicBackgroundWebGL coverUrl={metadata?.albumArt} className="lyrics-fullscreen__bg" />

            {/* Header with track info */}
            <header className="lyrics-fullscreen__header">
                <button
                    type="button"
                    className="lyrics-fullscreen__close-btn"
                    onClick={onClose}
                    aria-label="Close lyrics"
                >
                    <ChevronDown size={28} />
                </button>

                {metadata && (
                    <div className="lyrics-fullscreen__track-card">
                        {metadata.albumArt && (
                            <img
                                src={metadata.albumArt}
                                alt={metadata.album}
                                className="lyrics-fullscreen__album-art"
                            />
                        )}
                        <div className="lyrics-fullscreen__track-info">
                            <span className="lyrics-fullscreen__track-title">{metadata.title}</span>
                            <span className="lyrics-fullscreen__track-artist">{metadata.artist}</span>
                        </div>
                    </div>
                )}
            </header>

            {/* Lyrics Content */}
            <main className="lyrics-fullscreen__content">
                <AmLyricsWrapper />
            </main>
        </div>
    );
};

export default LyricsPopup;