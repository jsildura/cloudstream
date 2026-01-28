import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
    Search,
    X,
    Music,
    Disc3,
    User,
    ListMusic,
    Link2,
    Download,
    Loader2,
    AlertCircle
} from 'lucide-react';
import TrackList from './TrackList';
import { losslessAPI, downloadTrack, buildTrackFilename } from '../../lib/music';
import { useMusicPlayer } from '../../contexts/MusicPlayerContext';
import { useMusicPreferences } from '../../contexts/MusicPreferencesContext';
import { useMusicSearch, SEARCH_TABS, TAB_CONFIG } from '../../contexts/MusicSearchContext';
import { isTidalUrl, parseTidalUrl } from '../../lib/music/urlParser';
import { isSupportedStreamingUrl, convertToTidal, isSpotifyPlaylistUrl } from '../../lib/music/songlink';
import useDownloadUI from '../../hooks/music/useDownloadUI';

import SettingsButton from './SettingsMenu';
import './SearchInterface.css';

/**
 * SearchInterface - Main search component for music
 * 
 * Ported from tidal-ui SearchInterface.svelte
 * Features:
 * - Search with debounce
 * - Tab navigation
 * - URL import (Tidal, Spotify, Apple Music)
 * - Track/Album/Artist/Playlist results
 * - Download functionality
 */
const SearchInterface = ({ onNavigate }) => {
    const {
        query,
        setQuery,
        activeTab,
        setActiveTab,
        results,
        setResults,
        isSearching,
        setIsSearching,
        error,
        setError,
        clearSearch
    } = useMusicSearch();

    const searchTimeoutRef = useRef(null);
    const inputRef = useRef(null);
    const abortControllerRef = useRef(null);
    const lastSearchQueryRef = useRef('');

    const { setQueue, play, currentTrack, isPlaying, enqueue, enqueueNext } = useMusicPlayer();
    const { region, playbackQuality: quality, convertAacToMp3 } = useMusicPreferences();

    // Download UI state for individual track progress
    const {
        tasks,
        beginTrackDownload,
        updateTrackProgress,
        completeTrackDownload,
        errorTrackDownload
    } = useDownloadUI();

    // Derived state for TrackList from useDownloadUI tasks
    const downloadingIds = new Set(tasks.map(t => t.track.id));
    const downloadProgress = tasks.reduce((acc, task) => {
        acc[task.track.id] = task.progress;
        return acc;
    }, {});

    // Check if query is a URL
    const isQueryUrl = query.trim().length > 0 && (
        isTidalUrl(query.trim()) || isSupportedStreamingUrl(query.trim())
    );
    const isSpotifyPlaylist = query.trim().length > 0 && isSpotifyPlaylistUrl(query.trim());

    /**
     * Perform search with abort capability to cancel stale requests
     */
    const performSearch = useCallback(async (searchQuery, retryAttempt = 0) => {
        if (!searchQuery.trim()) {
            clearSearch();
            return;
        }

        // Cancel any pending search
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        abortControllerRef.current = new AbortController();
        lastSearchQueryRef.current = searchQuery;

        setIsSearching(true);
        setError(null);

        try {
            // Search all tabs in parallel
            const [tracks, albums, artists, playlists] = await Promise.all([
                losslessAPI.searchTracks(searchQuery, region).catch(() => ({ items: [], totalNumberOfItems: 0 })),
                losslessAPI.searchAlbums(searchQuery, region).catch(() => ({ items: [], totalNumberOfItems: 0 })),
                losslessAPI.searchArtists(searchQuery, region).catch(() => ({ items: [], totalNumberOfItems: 0 })),
                losslessAPI.searchPlaylists(searchQuery, region).catch(() => ({ items: [], totalNumberOfItems: 0 }))
            ]);

            // Only update results if this is still the latest search
            if (lastSearchQueryRef.current === searchQuery) {
                setResults({
                    [SEARCH_TABS.TRACKS]: tracks,
                    [SEARCH_TABS.ALBUMS]: albums,
                    [SEARCH_TABS.ARTISTS]: artists,
                    [SEARCH_TABS.PLAYLISTS]: playlists
                });
            }
        } catch (err) {
            // Don't show error if request was aborted (user typed new query)
            if (err.name === 'AbortError') return;
            console.error('Search failed:', err);
            setError(err.message || 'Search failed. Click to retry.');
        } finally {
            if (lastSearchQueryRef.current === searchQuery) {
                setIsSearching(false);
            }
        }
    }, [region, clearSearch, setIsSearching, setError, setResults]);

    /**
     * Handle query change with debounce
     */
    const handleQueryChange = useCallback((e) => {
        const newQuery = e.target.value;
        setQuery(newQuery);
        setError(null);

        // Clear existing timeout
        if (searchTimeoutRef.current) {
            clearTimeout(searchTimeoutRef.current);
        }

        // Don't search if it's a URL
        if (isTidalUrl(newQuery.trim()) || isSupportedStreamingUrl(newQuery.trim())) {
            return;
        }

        // Debounced search
        searchTimeoutRef.current = setTimeout(() => {
            performSearch(newQuery);
        }, 300);
    }, [performSearch]);

    /**
     * Handle URL import
     */
    const handleUrlImport = useCallback(async () => {
        const url = query.trim();
        if (!url) return;

        setIsSearching(true);
        setError(null);

        try {
            // Handle Tidal URLs
            if (isTidalUrl(url)) {
                const parsed = parseTidalUrl(url);
                if (parsed.type !== 'unknown') {
                    const result = await losslessAPI.importFromUrl(url);

                    if (result.type === 'track') {
                        // Play the track
                        setQueue([result.data], 0);
                        play();
                    } else if (result.type === 'album' && onNavigate) {
                        onNavigate(`/music/album/${result.data.id}`);
                    } else if (result.type === 'artist' && onNavigate) {
                        onNavigate(`/music/artist/${result.data.id}`);
                    } else if (result.type === 'playlist' && onNavigate) {
                        onNavigate(`/music/playlist/${result.data.playlist.uuid}`);
                    }
                    return;
                }
            }

            // Handle Spotify/Apple Music URLs via Songlink
            if (isSupportedStreamingUrl(url)) {
                const tidalInfo = await convertToTidal(url);
                if (tidalInfo) {
                    if (tidalInfo.type === 'track') {
                        const lookup = await losslessAPI.getTrack(parseInt(tidalInfo.id, 10));
                        setQueue([lookup.track], 0);
                        play();
                    } else if (tidalInfo.type === 'album' && onNavigate) {
                        onNavigate(`/music/album/${tidalInfo.id}`);
                    }
                } else {
                    setError('Could not find this content on TIDAL');
                }
                return;
            }

            setError('Invalid URL format');
        } catch (err) {
            console.error('URL import failed:', err);
            setError(err.message || 'Failed to import URL');
        } finally {
            setIsSearching(false);
        }
    }, [query, setQueue, play, onNavigate]);

    /**
     * Handle track play
     */
    const handleTrackPlay = useCallback((track, index) => {
        const tracks = results[SEARCH_TABS.TRACKS]?.items ?? [];
        setQueue(tracks, index);
        play();
    }, [results, setQueue, play]);

    /**
     * Handle track download with progress tracking
     */
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
                setError(`Download failed: ${result.error?.message || 'Unknown error'}`);
            }
        } catch (err) {
            console.error('Download failed:', err);
            errorTrackDownload(taskId, err);
            setError(`Download failed: ${err.message}`);
        }
    }, [quality, convertAacToMp3, beginTrackDownload, updateTrackProgress, completeTrackDownload, errorTrackDownload, setError]);

    /**
     * Clear search
     */
    const handleClear = useCallback(() => {
        clearSearch();
        inputRef.current?.focus();
    }, [clearSearch]);

    // Cleanup timeout
    useEffect(() => {
        return () => {
            if (searchTimeoutRef.current) {
                clearTimeout(searchTimeoutRef.current);
            }
        };
    }, []);

    const currentResults = results[activeTab] ?? { items: [], totalNumberOfItems: 0 };
    const hasResults = Object.values(results).some(r => r.items.length > 0);

    return (
        <div className="search-interface">
            {/* Search Input */}
            <div className="search-interface__input-wrapper">
                <div className="search-interface__input-container">
                    <Search size={20} className="search-interface__input-icon" />
                    <input
                        ref={inputRef}
                        type="text"
                        className="search-interface__input"
                        placeholder="Search for tracks, albums, artists, or paste a URL..."
                        value={query}
                        onChange={handleQueryChange}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && isQueryUrl) {
                                handleUrlImport();
                            }
                        }}
                    />
                    {query && (
                        <button
                            className="search-interface__clear-btn"
                            onClick={handleClear}
                            aria-label="Clear search"
                        >
                            <X size={18} />
                        </button>
                    )}
                </div>

                {/* URL Import Button */}
                {isQueryUrl && (
                    <button
                        className="search-interface__import-btn"
                        onClick={handleUrlImport}
                        disabled={isSearching}
                    >
                        {isSearching ? (
                            <Loader2 size={18} className="search-interface__spinner" />
                        ) : (
                            <Link2 size={18} />
                        )}
                        <span>Import</span>
                    </button>
                )}

                {/* Settings Button */}
                <SettingsButton />
            </div>

            {/* Error Display */}
            {error && (
                <div className="search-interface__error">
                    <AlertCircle size={16} />
                    <span>{error}</span>
                    <button
                        className="search-interface__retry-btn"
                        onClick={() => performSearch(query)}
                    >
                        Retry
                    </button>
                </div>
            )}

            {/* Tabs */}
            <div className="search-interface__tabs">
                {TAB_CONFIG.map(({ id, label, icon: Icon }) => {
                    const count = results[id]?.totalNumberOfItems ?? 0;
                    return (
                        <button
                            key={id}
                            className={`search-interface__tab ${activeTab === id ? 'is-active' : ''}`}
                            onClick={() => setActiveTab(id)}
                        >
                            <Icon size={16} />
                            <span>{label}</span>
                            {count > 0 && (
                                <span className="search-interface__tab-count">{count}</span>
                            )}
                        </button>
                    );
                })}
            </div>

            {/* Loading State - Show spinner for non-track tabs */}
            {isSearching && activeTab !== SEARCH_TABS.TRACKS && (
                <div className="search-interface__loading">
                    <Loader2 size={24} className="search-interface__spinner" />
                    <span>Searching...</span>
                </div>
            )}

            {/* Results */}
            <div className="search-interface__results">
                {activeTab === SEARCH_TABS.TRACKS && (
                    <TrackList
                        tracks={currentResults.items}
                        currentTrackId={currentTrack?.id}
                        isPlaying={isPlaying}
                        loading={isSearching}
                        downloadingIds={downloadingIds}
                        downloadProgress={downloadProgress}
                        onPlay={handleTrackPlay}
                        onDownload={handleTrackDownload}
                        onEnqueue={enqueue}
                        onEnqueueNext={enqueueNext}
                        emptyMessage={query ? 'No tracks found' : 'Search for tracks, albums, or paste a URL above'}
                    />
                )}

                {!isSearching && activeTab === SEARCH_TABS.ALBUMS && (
                    <div className="search-interface__grid">
                        {currentResults.items.map((album) => (
                            <AlbumCard
                                key={album.id}
                                album={album}
                                onClick={() => onNavigate?.(`/music/album/${album.id}`)}
                            />
                        ))}
                        {currentResults.items.length === 0 && query && (
                            <p className="search-interface__empty">No albums found</p>
                        )}
                    </div>
                )}

                {!isSearching && activeTab === SEARCH_TABS.ARTISTS && (
                    <div className="search-interface__grid search-interface__grid--artists">
                        {currentResults.items.map((artist) => (
                            <ArtistCard
                                key={artist.id}
                                artist={artist}
                                onClick={() => onNavigate?.(`/music/artist/${artist.id}`)}
                            />
                        ))}
                        {currentResults.items.length === 0 && query && (
                            <p className="search-interface__empty">No artists found</p>
                        )}
                    </div>
                )}

                {!isSearching && activeTab === SEARCH_TABS.PLAYLISTS && (
                    <div className="search-interface__grid">
                        {currentResults.items.map((playlist) => (
                            <PlaylistCard
                                key={playlist.uuid}
                                playlist={playlist}
                                onClick={() => onNavigate?.(`/music/playlist/${playlist.uuid}`)}
                            />
                        ))}
                        {currentResults.items.length === 0 && query && (
                            <p className="search-interface__empty">No playlists found</p>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

/**
 * AlbumCard - Album grid item (memoized)
 */
const AlbumCard = React.memo(({ album, onClick }) => {
    const coverUrl = album.cover
        ? `https://resources.tidal.com/images/${album.cover.replace(/-/g, '/')}/320x320.jpg`
        : null;
    const artistName = album.artist?.name ?? album.artists?.[0]?.name ?? 'Unknown Artist';

    return (
        <div className="album-card" onClick={onClick}>
            <div className="album-card__cover">
                {coverUrl ? (
                    <img src={coverUrl} alt={album.title} loading="lazy" />
                ) : (
                    <div className="album-card__cover-placeholder">
                        <Disc3 size={32} />
                    </div>
                )}
            </div>
            <div className="album-card__info">
                <div className="album-card__title">{album.title}</div>
                <div className="album-card__artist">{artistName}</div>
                {album.releaseDate && (
                    <div className="album-card__year">
                        {new Date(album.releaseDate).getFullYear()}
                    </div>
                )}
            </div>
        </div>
    );
});

/**
 * ArtistCard - Artist grid item (memoized)
 */
const ArtistCard = React.memo(({ artist, onClick }) => {
    const pictureUrl = artist.picture
        ? `https://resources.tidal.com/images/${artist.picture.replace(/-/g, '/')}/320x320.jpg`
        : null;

    return (
        <div className="artist-card" onClick={onClick}>
            <div className="artist-card__image">
                {pictureUrl ? (
                    <img src={pictureUrl} alt={artist.name} loading="lazy" />
                ) : (
                    <div className="artist-card__image-placeholder">
                        <User size={32} />
                    </div>
                )}
            </div>
            <div className="artist-card__name">{artist.name}</div>
            {artist.type && (
                <div className="artist-card__type">{artist.type}</div>
            )}
        </div>
    );
});

/**
 * PlaylistCard - Playlist grid item (memoized)
 */
const PlaylistCard = React.memo(({ playlist, onClick }) => {
    const coverUrl = playlist.squareImage
        ? `https://resources.tidal.com/images/${playlist.squareImage.replace(/-/g, '/')}/320x320.jpg`
        : playlist.image
            ? `https://resources.tidal.com/images/${playlist.image.replace(/-/g, '/')}/320x320.jpg`
            : null;

    return (
        <div className="playlist-card" onClick={onClick}>
            <div className="playlist-card__cover">
                {coverUrl ? (
                    <img src={coverUrl} alt={playlist.title} loading="lazy" />
                ) : (
                    <div className="playlist-card__cover-placeholder">
                        <ListMusic size={32} />
                    </div>
                )}
            </div>
            <div className="playlist-card__info">
                <div className="playlist-card__title">{playlist.title}</div>
                {playlist.creator?.name && (
                    <div className="playlist-card__creator">by {playlist.creator.name}</div>
                )}
                {playlist.numberOfTracks && (
                    <div className="playlist-card__tracks">
                        {playlist.numberOfTracks} tracks
                    </div>
                )}
            </div>
        </div>
    );
});

export default SearchInterface;
