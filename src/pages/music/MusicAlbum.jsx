import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    Play,
    Shuffle,
    Download,
    Clock,
    Calendar,
    Disc3,
    ArrowLeft,
    Loader2
} from 'lucide-react';
import TrackList from '../../components/music/TrackList';
import ShareButton from '../../components/music/ShareButton';
import { losslessAPI, downloadTrack, buildTrackFilename, downloadAlbum } from '../../lib/music';
import { useMusicPlayer } from '../../contexts/MusicPlayerContext';
import { useMusicPreferences } from '../../contexts/MusicPreferencesContext';
import { useDownloadContext } from '../../contexts/DownloadContext';
import './MusicAlbum.css';

/**
 * Format duration from seconds to readable format
 */
const formatTotalDuration = (tracks) => {
    const totalSeconds = tracks.reduce((sum, t) => sum + (t.duration || 0), 0);
    const hours = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);

    if (hours > 0) {
        return `${hours} hr ${mins} min`;
    }
    return `${mins} min`;
};

/**
 * MusicAlbum - Album detail page
 * 
 * Ported from tidal-ui album page
 * Features:
 * - Album metadata header
 * - Track list
 * - Play all / Shuffle buttons
 * - Download all
 * - Share functionality
 */
const MusicAlbum = () => {
    const { id } = useParams();
    const navigate = useNavigate();

    const [album, setAlbum] = useState(null);
    const [tracks, setTracks] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    // Bulk download progress state
    const [bulkDownload, setBulkDownload] = useState({
        isActive: false,
        completed: 0,
        total: 0
    });

    const { setQueue, play, currentTrack, isPlaying, enqueue, enqueueNext } = useMusicPlayer();
    const { playbackQuality: quality, convertAacToMp3 } = useMusicPreferences();

    // Download UI state
    const {
        tasks,
        beginTrackDownload,
        updateTrackProgress,
        completeTrackDownload,
        errorTrackDownload,
        storePendingDownload,
        openAdModal,
        updateAlbumProgress
    } = useDownloadContext();

    // Load album data
    useEffect(() => {
        const loadAlbum = async () => {
            if (!id) return;

            setIsLoading(true);
            setError(null);

            try {
                const data = await losslessAPI.getAlbum(parseInt(id, 10));
                setAlbum(data.album);
                setTracks(data.tracks);
            } catch (err) {
                console.error('Failed to load album:', err);
                setError(err.message || 'Failed to load album');
            } finally {
                setIsLoading(false);
            }
        };

        loadAlbum();
    }, [id]);

    // Play all tracks
    const handlePlayAll = useCallback(() => {
        if (tracks.length > 0) {
            setQueue(tracks, 0);
            play();
        }
    }, [tracks, setQueue, play]);

    // Shuffle play
    const handleShuffle = useCallback(() => {
        if (tracks.length > 0) {
            const shuffled = [...tracks].sort(() => Math.random() - 0.5);
            setQueue(shuffled, 0);
            play();
        }
    }, [tracks, setQueue, play]);

    // Play specific track
    const handleTrackPlay = useCallback((track, index) => {
        setQueue(tracks, index);
        play();
    }, [tracks, setQueue, play]);

    // Download track (deferred save for ad modal)
    const handleTrackDownload = useCallback(async (track) => {
        const artistName = track.artist?.name ?? track.artists?.[0]?.name ?? 'Unknown';
        const filename = buildTrackFilename(album, track, quality, artistName, convertAacToMp3);

        const { taskId } = beginTrackDownload(track, filename);

        try {
            const result = await downloadTrack(track, quality, {
                convertAacToMp3,
                deferSave: true, // Store blob, don't trigger save yet
                callbacks: {
                    onProgress: (received, total) => {
                        updateTrackProgress(taskId, received, total);
                    }
                }
            });

            if (result.success) {
                // Store the blob for deferred save
                if (result.blob && result.filename) {
                    storePendingDownload(result.blob, result.filename);
                }
                completeTrackDownload(taskId);
            } else {
                errorTrackDownload(taskId, result.error);
            }
        } catch (err) {
            console.error('Download failed:', err);
            errorTrackDownload(taskId, err);
        }
    }, [quality, convertAacToMp3, album, beginTrackDownload, updateTrackProgress, completeTrackDownload, errorTrackDownload, storePendingDownload]);

    // Download all tracks with progress tracking (deferred save for ad modal)
    const handleDownloadAll = useCallback(async () => {
        if (bulkDownload.isActive) return;

        const total = tracks.length;
        setBulkDownload({ isActive: true, completed: 0, total });

        // Create a pseudo-track for the modal to display album info
        const albumTrack = {
            title: album?.title ?? 'Album',
            artists: album?.artists ?? [{ name: album?.artist?.name ?? 'Unknown Artist' }]
        };

        // Open ad modal at start with album tracking enabled
        openAdModal(albumTrack, { isAlbum: true, total });

        try {
            const result = await downloadAlbum(album, tracks, quality, {
                onTrackDownloaded: (completed, total, track) => {
                    setBulkDownload(prev => ({ ...prev, completed }));
                    updateAlbumProgress(completed, total); // Update modal counter
                }
            }, {
                mode: 'zip',
                convertAacToMp3,
                deferSave: true // Return blob instead of auto-downloading
            });

            // Store the ZIP blob for deferred save
            if (result.success && result.blob && result.filename) {
                storePendingDownload(result.blob, result.filename);
            }
        } catch (err) {
            console.error('Bulk download failed', err);
        } finally {
            // Reset after brief delay to show completion
            setTimeout(() => {
                setBulkDownload({ isActive: false, completed: 0, total: 0 });
            }, 2000);
        }
    }, [tracks, bulkDownload.isActive, album, quality, convertAacToMp3, openAdModal, storePendingDownload, updateAlbumProgress]);

    // Get cover URL
    const getCoverUrl = (size = 640) => {
        if (!album?.cover) return null;
        return `https://resources.tidal.com/images/${album.cover.replace(/-/g, '/')}/${size}x${size}.jpg`;
    };

    const coverUrl = getCoverUrl();
    const artistName = album?.artist?.name ?? album?.artists?.[0]?.name ?? 'Unknown Artist';
    const releaseYear = album?.releaseDate
        ? new Date(album.releaseDate).getFullYear()
        : null;

    // Derived state for TrackList
    const downloadingIds = new Set(tasks.map(t => t.track.id));
    const downloadProgress = tasks.reduce((acc, task) => {
        acc[task.track.id] = task.progress;
        return acc;
    }, {});

    // Bulk download progress percentage
    const bulkProgress = bulkDownload.total > 0
        ? Math.round((bulkDownload.completed / bulkDownload.total) * 100)
        : 0;

    if (isLoading) {
        return (
            <div className="music-album music-album--loading">
                <Loader2 size={32} className="music-album__spinner" />
                <span>Loading album...</span>
            </div>
        );
    }

    if (error) {
        return (
            <div className="music-album music-album--error">
                <p>{error}</p>
                <button onClick={() => navigate(-1)}>Go Back</button>
            </div>
        );
    }

    if (!album) {
        return null;
    }

    return (
        <div className="music-album">
            {/* Back Button - stopImmediatePropagation prevents ad script interception */}
            <button
                className="music-album__back"
                onClick={(e) => {
                    e.stopPropagation();
                    e.nativeEvent.stopImmediatePropagation();
                    navigate(-1);
                }}
            >
                <ArrowLeft size={20} />
                <span>Back</span>
            </button>

            {/* Header */}
            <div className="music-album__header">
                {/* Cover Art */}
                <div className="music-album__cover">
                    {coverUrl ? (
                        <img src={coverUrl} alt={album.title} />
                    ) : (
                        <div className="music-album__cover-placeholder">
                            <Disc3 size={64} />
                        </div>
                    )}
                </div>

                {/* Info */}
                <div className="music-album__info">
                    <span className="music-album__type">Album</span>
                    <h1 className="music-album__title">{album.title}</h1>
                    <div className="music-album__meta">
                        <span
                            className="music-album__artist"
                            onClick={() => album.artist?.id && navigate(`/music/artist/${album.artist.id}`)}
                        >
                            {artistName}
                        </span>
                        {releaseYear && (
                            <>
                                <span className="music-album__separator">•</span>
                                <span className="music-album__year">
                                    <Calendar size={14} />
                                    {releaseYear}
                                </span>
                            </>
                        )}
                        <span className="music-album__separator">•</span>
                        <span className="music-album__tracks-count">
                            {tracks.length} tracks
                        </span>
                        <span className="music-album__separator">•</span>
                        <span className="music-album__duration">
                            <Clock size={14} />
                            {formatTotalDuration(tracks)}
                        </span>
                    </div>

                    {/* Quality Badge */}
                    {album.audioQuality && (
                        <div className={`music-album__quality music-album__quality--${album.audioQuality.toLowerCase().replace('_', '')}`}>
                            {album.audioQuality === 'HI_RES_LOSSLESS' ? 'Hi-Res' :
                                album.audioQuality === 'LOSSLESS' ? 'Lossless' :
                                    album.audioQuality}
                        </div>
                    )}

                    {/* Actions */}
                    <div className="music-album__actions">
                        <button
                            className="music-album__btn music-album__btn--primary"
                            onClick={handlePlayAll}
                        >
                            <Play size={20} />
                            Play
                        </button>
                        <button
                            className="music-album__btn music-album__btn--secondary"
                            onClick={handleShuffle}
                        >
                            <Shuffle size={18} />
                            Shuffle
                        </button>
                        <button
                            className={`music-album__btn music-album__btn--secondary ${bulkDownload.isActive ? 'music-album__btn--downloading' : ''}`}
                            onClick={handleDownloadAll}
                            disabled={bulkDownload.isActive}
                            style={bulkDownload.isActive ? { '--download-progress': `${bulkProgress}%` } : undefined}
                        >
                            {bulkDownload.isActive ? (
                                <>
                                    <Loader2 size={18} className="music-album__spinner" />
                                    <span>{bulkDownload.completed} / {bulkDownload.total}</span>
                                </>
                            ) : (
                                <>
                                    <Download size={18} />
                                    Download Album
                                </>
                            )}
                        </button>
                        <ShareButton
                            type="album"
                            id={album.id}
                            title={album.title}
                            artist={artistName}
                        />
                    </div>
                </div>
            </div>

            {/* Track List */}
            <div className="music-album__tracks">
                <TrackList
                    tracks={tracks}
                    currentTrackId={currentTrack?.id}
                    isPlaying={isPlaying}
                    downloadingIds={downloadingIds}
                    downloadProgress={downloadProgress}
                    showCover={false}
                    showIndex={true}
                    showHeader={true}
                    onPlay={handleTrackPlay}
                    onDownload={handleTrackDownload}
                    onEnqueue={enqueue}
                    onEnqueueNext={enqueueNext}
                />
            </div>

            {/* Copyright */}
            {album.copyright && (
                <div className="music-album__copyright">
                    {album.copyright}
                </div>
            )}
        </div>
    );
};

export default MusicAlbum;
