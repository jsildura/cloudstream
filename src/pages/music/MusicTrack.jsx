import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    Play,
    Download,
    Clock,
    Disc3,
    ArrowLeft,
    Loader2,
    Music2,
    ExternalLink
} from 'lucide-react';
import ShareButton from '../../components/music/ShareButton';
import { losslessAPI } from '../../lib/music';
import { useMusicPlayer } from '../../contexts/MusicPlayerContext';
import { useMusicPreferences } from '../../contexts/MusicPreferencesContext';
import './MusicTrack.css';

/**
 * Format duration from seconds
 */
const formatDuration = (seconds) => {
    if (!seconds) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
};

/**
 * Get quality badge text
 */
const getQualityBadge = (track) => {
    const quality = track?.audioQuality;
    if (quality === 'HI_RES_LOSSLESS' || quality === 'HI_RES') return 'Hi-Res';
    if (quality === 'LOSSLESS') return 'Lossless';
    if (quality === 'DOLBY_ATMOS' || track?.audioModes?.includes('DOLBY_ATMOS')) return 'Dolby Atmos';
    return null;
};

/**
 * MusicTrack - Track detail page
 * 
 * Ported from tidal-ui track page
 * Features:
 * - Large album artwork
 * - Track info (title, artist, album, duration, quality)
 * - Play / Download buttons
 * - Link to album
 */
const MusicTrack = () => {
    const { id } = useParams();
    const navigate = useNavigate();

    const [track, setTrack] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [isDownloading, setIsDownloading] = useState(false);

    const { setQueue, play, currentTrack, isPlaying } = useMusicPlayer();
    const { quality } = useMusicPreferences();

    // Load track data
    useEffect(() => {
        const loadTrack = async () => {
            if (!id) return;

            setIsLoading(true);
            setError(null);

            try {
                const data = await losslessAPI.getTrack(parseInt(id, 10), quality);
                setTrack(data.track);
            } catch (err) {
                console.error('Failed to load track:', err);
                setError(err.message || 'Failed to load track');
            } finally {
                setIsLoading(false);
            }
        };

        loadTrack();
    }, [id, quality]);

    // Play track
    const handlePlay = useCallback(() => {
        if (track) {
            setQueue([track], 0);
            play();
        }
    }, [track, setQueue, play]);

    // Download track
    const handleDownload = useCallback(async () => {
        if (!track || isDownloading) return;
        setIsDownloading(true);

        try {
            const streamData = await losslessAPI.getStreamData(track.id, quality);
            const response = await fetch(streamData.url);
            const blob = await response.blob();

            const artistName = track.artist?.name ?? track.artists?.[0]?.name ?? 'Unknown';
            const filename = `${artistName} - ${track.title}.flac`;

            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error('Download failed:', err);
        } finally {
            setIsDownloading(false);
        }
    }, [track, quality, isDownloading]);

    // Get cover URL
    const getCoverUrl = (size = 640) => {
        if (track?.album?.cover) {
            return `https://resources.tidal.com/images/${track.album.cover.replace(/-/g, '/')}/${size}x${size}.jpg`;
        }
        if (track?.cover) {
            return `https://resources.tidal.com/images/${track.cover.replace(/-/g, '/')}/${size}x${size}.jpg`;
        }
        return null;
    };

    const coverUrl = getCoverUrl();
    const artistName = track?.artist?.name ?? track?.artists?.[0]?.name ?? 'Unknown Artist';
    const qualityBadge = getQualityBadge(track);
    const isCurrentTrack = currentTrack?.id === track?.id;

    if (isLoading) {
        return (
            <div className="music-track music-track--loading">
                <Loader2 size={32} className="music-track__spinner" />
                <span>Loading track...</span>
            </div>
        );
    }

    if (error) {
        return (
            <div className="music-track music-track--error">
                <p>{error}</p>
                <button onClick={() => navigate(-1)}>Go Back</button>
            </div>
        );
    }

    if (!track) {
        return null;
    }

    return (
        <div className="music-track">
            {/* Back Button */}
            <button
                className="music-track__back"
                onClick={() => navigate(-1)}
            >
                <ArrowLeft size={20} />
                <span>Back</span>
            </button>

            {/* Main Content */}
            <div className="music-track__content">
                {/* Cover Art */}
                <div className="music-track__cover">
                    {coverUrl ? (
                        <img src={coverUrl} alt={track.title} />
                    ) : (
                        <div className="music-track__cover-placeholder">
                            <Music2 size={80} />
                        </div>
                    )}

                    {/* Play Overlay */}
                    <button
                        className="music-track__play-overlay"
                        onClick={handlePlay}
                    >
                        <Play size={48} />
                    </button>
                </div>

                {/* Info */}
                <div className="music-track__info">
                    <span className="music-track__type">Track</span>
                    <h1 className="music-track__title">
                        {track.title}
                        {track.version && (
                            <span className="music-track__version">({track.version})</span>
                        )}
                    </h1>

                    <div className="music-track__artist" onClick={() => track.artist?.id && navigate(`/music/artist/${track.artist.id}`)}>
                        {artistName}
                    </div>

                    {track.album && (
                        <div
                            className="music-track__album"
                            onClick={() => navigate(`/music/album/${track.album.id}`)}
                        >
                            <Disc3 size={14} />
                            <span>{track.album.title}</span>
                            <ExternalLink size={12} />
                        </div>
                    )}

                    <div className="music-track__meta">
                        <span className="music-track__duration">
                            <Clock size={14} />
                            {formatDuration(track.duration)}
                        </span>

                        {qualityBadge && (
                            <span className={`music-track__quality music-track__quality--${qualityBadge.toLowerCase().replace(' ', '').replace('-', '')}`}>
                                {qualityBadge}
                            </span>
                        )}

                        {track.explicit && (
                            <span className="music-track__explicit">E</span>
                        )}
                    </div>

                    {/* Actions */}
                    <div className="music-track__actions">
                        <button
                            className={`music-track__btn music-track__btn--primary ${isCurrentTrack && isPlaying ? 'is-playing' : ''}`}
                            onClick={handlePlay}
                        >
                            <Play size={20} />
                            {isCurrentTrack && isPlaying ? 'Playing' : 'Play'}
                        </button>
                        <button
                            className="music-track__btn music-track__btn--secondary"
                            onClick={handleDownload}
                            disabled={isDownloading}
                        >
                            {isDownloading ? (
                                <Loader2 size={18} className="music-track__spinner" />
                            ) : (
                                <Download size={18} />
                            )}
                            Download
                        </button>
                        <ShareButton
                            type="track"
                            id={track.id}
                            title={track.title}
                            artist={artistName}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default MusicTrack;
