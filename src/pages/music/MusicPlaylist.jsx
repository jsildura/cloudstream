import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    Play,
    Shuffle,
    Download,
    Clock,
    ListMusic,
    ArrowLeft,
    Loader2,
    User
} from 'lucide-react';
import TrackList from '../../components/music/TrackList';
import ShareButton from '../../components/music/ShareButton';
import { losslessAPI, downloadTrack, buildTrackFilename, downloadAlbum } from '../../lib/music';
import { useMusicPlayer } from '../../contexts/MusicPlayerContext';
import { useMusicPreferences } from '../../contexts/MusicPreferencesContext';
import useDownloadUI from '../../hooks/music/useDownloadUI';
import './MusicPlaylist.css';

/**
 * Format duration from seconds
 */
const formatTotalDuration = (tracks) => {
    const totalSeconds = tracks.reduce((sum, t) => sum + (t.item?.duration || t.duration || 0), 0);
    const hours = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);

    if (hours > 0) {
        return `${hours} hr ${mins} min`;
    }
    return `${mins} min`;
};

/**
 * MusicPlaylist - Playlist detail page
 * 
 * Ported from tidal-ui playlist page
 * Features:
 * - Playlist header with cover
 * - Track list
 * - Play all / Shuffle buttons
 * - Download all
 */
const MusicPlaylist = () => {
    const { id } = useParams();
    const navigate = useNavigate();

    const [playlist, setPlaylist] = useState(null);
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

    // Download UI state for individual track progress
    const {
        tasks,
        beginTrackDownload,
        updateTrackProgress,
        completeTrackDownload,
        errorTrackDownload
    } = useDownloadUI();

    // Load playlist data
    useEffect(() => {
        const loadPlaylist = async () => {
            if (!id) return;

            setIsLoading(true);
            setError(null);

            try {
                const data = await losslessAPI.getPlaylist(id);
                setPlaylist(data.playlist);
                // Extract tracks from items array
                const trackList = (data.items || []).map(item => item.item || item);
                setTracks(trackList);
            } catch (err) {
                console.error('Failed to load playlist:', err);
                setError(err.message || 'Failed to load playlist');
            } finally {
                setIsLoading(false);
            }
        };

        loadPlaylist();
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

    // Download track with progress tracking
    const handleTrackDownload = useCallback(async (track) => {
        const artistName = track.artist?.name ?? track.artists?.[0]?.name ?? 'Unknown';
        const album = track.album ?? { title: 'Unknown Album' };
        const filename = buildTrackFilename(album, track, quality, artistName, convertAacToMp3);

        const { taskId } = beginTrackDownload(track, filename);

        try {
            const result = await downloadTrack(track, quality, {
                convertAacToMp3,
                callbacks: {
                    onProgress: (received, total) => {
                        updateTrackProgress(taskId, received, total);
                    }
                }
            });

            if (result.success) {
                completeTrackDownload(taskId);
            } else {
                errorTrackDownload(taskId, result.error);
            }
        } catch (err) {
            console.error('Download failed:', err);
            errorTrackDownload(taskId, err);
        }
    }, [quality, convertAacToMp3, beginTrackDownload, updateTrackProgress, completeTrackDownload, errorTrackDownload]);

    // Download all tracks with progress tracking
    const handleDownloadAll = useCallback(async () => {
        if (bulkDownload.isActive) return;

        const total = tracks.length;
        setBulkDownload({ isActive: true, completed: 0, total });

        try {
            await downloadAlbum(playlist, tracks, quality, {
                onTrackDownloaded: (completed, total, track) => {
                    setBulkDownload(prev => ({ ...prev, completed }));
                }
            }, {
                mode: 'zip',
                convertAacToMp3,
                preferredArtistName: playlist?.creator?.name ?? 'Unknown'
            });
        } catch (err) {
            console.error('Bulk download failed', err);
        } finally {
            // Reset after brief delay to show completion
            setTimeout(() => {
                setBulkDownload({ isActive: false, completed: 0, total: 0 });
            }, 2000);
        }
    }, [tracks, bulkDownload.isActive, playlist, quality, convertAacToMp3]);

    // Get cover URL
    const getCoverUrl = (size = 640) => {
        const cover = playlist?.squareImage || playlist?.image;
        if (!cover) return null;
        return `https://resources.tidal.com/images/${cover.replace(/-/g, '/')}/${size}x${size}.jpg`;
    };

    const coverUrl = getCoverUrl();
    const creatorName = playlist?.creator?.name ?? 'Unknown';

    // Derived state for TrackList from useDownloadUI tasks
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
            <div className="music-playlist music-playlist--loading">
                <Loader2 size={32} className="music-playlist__spinner" />
                <span>Loading playlist...</span>
            </div>
        );
    }

    if (error) {
        return (
            <div className="music-playlist music-playlist--error">
                <p>{error}</p>
                <button onClick={() => navigate(-1)}>Go Back</button>
            </div>
        );
    }

    if (!playlist) {
        return null;
    }

    return (
        <div className="music-playlist">
            {/* Back Button */}
            <button
                className="music-playlist__back"
                onClick={() => navigate(-1)}
            >
                <ArrowLeft size={20} />
                <span>Back</span>
            </button>

            {/* Header */}
            <div className="music-playlist__header">
                {/* Cover Art */}
                <div className="music-playlist__cover">
                    {coverUrl ? (
                        <img src={coverUrl} alt={playlist.title} />
                    ) : (
                        <div className="music-playlist__cover-placeholder">
                            <ListMusic size={64} />
                        </div>
                    )}
                </div>

                {/* Info */}
                <div className="music-playlist__info">
                    <span className="music-playlist__type">Playlist</span>
                    <h1 className="music-playlist__title">{playlist.title}</h1>

                    {playlist.description && (
                        <p className="music-playlist__description">{playlist.description}</p>
                    )}

                    <div className="music-playlist__meta">
                        <span className="music-playlist__creator">
                            <User size={14} />
                            {creatorName}
                        </span>
                        <span className="music-playlist__separator">•</span>
                        <span className="music-playlist__tracks-count">
                            {tracks.length} tracks
                        </span>
                        <span className="music-playlist__separator">•</span>
                        <span className="music-playlist__duration">
                            <Clock size={14} />
                            {formatTotalDuration(tracks)}
                        </span>
                    </div>

                    {/* Actions */}
                    <div className="music-playlist__actions">
                        <button
                            className="music-playlist__btn music-playlist__btn--primary"
                            onClick={handlePlayAll}
                            disabled={tracks.length === 0}
                        >
                            <Play size={20} />
                            Play
                        </button>
                        <button
                            className="music-playlist__btn music-playlist__btn--secondary"
                            onClick={handleShuffle}
                            disabled={tracks.length === 0}
                        >
                            <Shuffle size={18} />
                            Shuffle
                        </button>
                        <button
                            className={`music-playlist__btn music-playlist__btn--secondary ${bulkDownload.isActive ? 'music-playlist__btn--downloading' : ''}`}
                            onClick={handleDownloadAll}
                            disabled={bulkDownload.isActive || tracks.length === 0}
                            style={bulkDownload.isActive ? { '--download-progress': `${bulkProgress}%` } : undefined}
                        >
                            {bulkDownload.isActive ? (
                                <>
                                    <Loader2 size={18} className="music-playlist__spinner" />
                                    <span>{bulkDownload.completed} / {bulkDownload.total}</span>
                                </>
                            ) : (
                                <>
                                    <Download size={18} />
                                    Download Playlist
                                </>
                            )}
                        </button>
                        <ShareButton
                            type="playlist"
                            id={playlist.uuid}
                            title={playlist.title}
                        />
                    </div>
                </div>
            </div>

            {/* Track List */}
            <div className="music-playlist__tracks">
                <TrackList
                    tracks={tracks}
                    currentTrackId={currentTrack?.id}
                    isPlaying={isPlaying}
                    downloadingIds={downloadingIds}
                    downloadProgress={downloadProgress}
                    showCover={true}
                    showIndex={true}
                    showHeader={true}
                    onPlay={handleTrackPlay}
                    onDownload={handleTrackDownload}
                    onEnqueue={enqueue}
                    onEnqueueNext={enqueueNext}
                />
            </div>
        </div>
    );
};

export default MusicPlaylist;
