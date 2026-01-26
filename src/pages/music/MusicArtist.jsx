import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    Play,
    Shuffle,
    Download,
    User,
    ArrowLeft,
    Loader2,
    Disc3
} from 'lucide-react';
import TrackList from '../../components/music/TrackList';
import TopTracksGrid from '../../components/music/TopTracksGrid';
import ShareButton from '../../components/music/ShareButton';
import { losslessAPI } from '../../lib/music';
import { useMusicPlayer } from '../../contexts/MusicPlayerContext';
import { useMusicPreferences } from '../../contexts/MusicPreferencesContext';
import './MusicArtist.css';

/**
 * MusicArtist - Artist detail page
 * 
 * Ported from tidal-ui artist page
 * Features:
 * - Artist header with image
 * - Top tracks grid
 * - Discography section
 * - Play/Shuffle controls
 */
const MusicArtist = () => {
    const { id } = useParams();
    const navigate = useNavigate();

    const [artist, setArtist] = useState(null);
    const [tracks, setTracks] = useState([]);
    const [albums, setAlbums] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [downloadingIds, setDownloadingIds] = useState(new Set());

    const { setQueue, play, currentTrack, isPlaying, enqueue, enqueueNext } = useMusicPlayer();
    const { quality } = useMusicPreferences();

    // Load artist data
    useEffect(() => {
        const loadArtist = async () => {
            if (!id) return;

            setIsLoading(true);
            setError(null);

            try {
                const data = await losslessAPI.getArtist(parseInt(id, 10));
                setArtist(data);
                setTracks(data.tracks || []);
                setAlbums(data.albums || []);
            } catch (err) {
                console.error('Failed to load artist:', err);
                setError(err.message || 'Failed to load artist');
            } finally {
                setIsLoading(false);
            }
        };

        loadArtist();
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

    // Download track
    const handleTrackDownload = useCallback(async (track) => {
        setDownloadingIds(prev => new Set([...prev, track.id]));

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
            setDownloadingIds(prev => {
                const next = new Set(prev);
                next.delete(track.id);
                return next;
            });
        }
    }, [quality]);

    // Get artist image URL
    const getImageUrl = (size = 750) => {
        if (!artist?.picture) return null;
        return `https://resources.tidal.com/images/${artist.picture.replace(/-/g, '/')}/${size}x${size}.jpg`;
    };

    const imageUrl = getImageUrl();

    if (isLoading) {
        return (
            <div className="music-artist music-artist--loading">
                <Loader2 size={32} className="music-artist__spinner" />
                <span>Loading artist...</span>
            </div>
        );
    }

    if (error) {
        return (
            <div className="music-artist music-artist--error">
                <p>{error}</p>
                <button onClick={() => navigate(-1)}>Go Back</button>
            </div>
        );
    }

    if (!artist) {
        return null;
    }

    return (
        <div className="music-artist">
            {/* Back Button */}
            <button
                className="music-artist__back"
                onClick={() => navigate(-1)}
            >
                <ArrowLeft size={20} />
                <span>Back</span>
            </button>

            {/* Header */}
            <div className="music-artist__header">
                {/* Image */}
                <div className="music-artist__image">
                    {imageUrl ? (
                        <img src={imageUrl} alt={artist.name} />
                    ) : (
                        <div className="music-artist__image-placeholder">
                            <User size={64} />
                        </div>
                    )}
                </div>

                {/* Info */}
                <div className="music-artist__info">
                    <span className="music-artist__type">Artist</span>
                    <h1 className="music-artist__name">{artist.name}</h1>

                    {artist.type && (
                        <span className="music-artist__genre">{artist.type}</span>
                    )}

                    {/* Actions */}
                    <div className="music-artist__actions">
                        <button
                            className="music-artist__btn music-artist__btn--primary"
                            onClick={handlePlayAll}
                            disabled={tracks.length === 0}
                        >
                            <Play size={20} />
                            Play
                        </button>
                        <button
                            className="music-artist__btn music-artist__btn--secondary"
                            onClick={handleShuffle}
                            disabled={tracks.length === 0}
                        >
                            <Shuffle size={18} />
                            Shuffle
                        </button>
                        <ShareButton
                            type="artist"
                            id={artist.id}
                            title={artist.name}
                        />
                    </div>
                </div>
            </div>

            {/* Top Tracks */}
            {tracks.length > 0 && (
                <section className="music-artist__section">
                    <h2 className="music-artist__section-title">Popular Tracks</h2>
                    <TrackList
                        tracks={tracks.slice(0, 10)}
                        currentTrackId={currentTrack?.id}
                        isPlaying={isPlaying}
                        downloadingIds={downloadingIds}
                        showCover={true}
                        showIndex={true}
                        onPlay={handleTrackPlay}
                        onDownload={handleTrackDownload}
                        onEnqueue={enqueue}
                        onEnqueueNext={enqueueNext}
                    />
                </section>
            )}

            {/* Discography */}
            {albums.length > 0 && (
                <section className="music-artist__section">
                    <h2 className="music-artist__section-title">Discography</h2>
                    <div className="music-artist__albums-grid">
                        {albums.map((album) => {
                            const albumCover = album.cover
                                ? `https://resources.tidal.com/images/${album.cover.replace(/-/g, '/')}/320x320.jpg`
                                : null;

                            return (
                                <div
                                    key={album.id}
                                    className="music-artist__album-card"
                                    onClick={() => navigate(`/music/album/${album.id}`)}
                                >
                                    <div className="music-artist__album-cover">
                                        {albumCover ? (
                                            <img src={albumCover} alt={album.title} loading="lazy" />
                                        ) : (
                                            <div className="music-artist__album-cover-placeholder">
                                                <Disc3 size={32} />
                                            </div>
                                        )}
                                    </div>
                                    <div className="music-artist__album-info">
                                        <div className="music-artist__album-title">{album.title}</div>
                                        {album.releaseDate && (
                                            <div className="music-artist__album-year">
                                                {new Date(album.releaseDate).getFullYear()}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </section>
            )}
        </div>
    );
};

export default MusicArtist;
