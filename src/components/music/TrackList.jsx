import React, { useState } from 'react';
import { Play, Download, Pause, MoreVertical, Clock, Music2 } from 'lucide-react';
import TrackMenu from './TrackMenu';
import './TrackList.css';

/**
 * Format duration from seconds to mm:ss
 */
const formatDuration = (seconds) => {
    if (!seconds || seconds <= 0) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
};

/**
 * Get cover image URL from track
 */
const getCoverUrl = (track, size = 160) => {
    if (!track) return null;

    // Check album cover
    if (track.album?.cover) {
        return `https://resources.tidal.com/images/${track.album.cover.replace(/-/g, '/')}/${size}x${size}.jpg`;
    }

    // Check direct cover
    if (track.cover) {
        return `https://resources.tidal.com/images/${track.cover.replace(/-/g, '/')}/${size}x${size}.jpg`;
    }

    return null;
};

/**
 * Get quality badge text
 */
const getQualityBadge = (track) => {
    const quality = track.audioQuality;
    if (quality === 'HI_RES_LOSSLESS' || quality === 'HI_RES') return 'Hi-Res';
    if (quality === 'DOLBY_ATMOS' || track.audioModes?.includes('DOLBY_ATMOS')) return 'Atmos';
    return null;
};

/**
 * TrackListItem - Single track row
 * Memoized to prevent unnecessary re-renders
 */
const TrackListItem = React.memo(({
    track,
    index,
    isPlaying = false,
    isCurrentTrack = false,
    isDownloading = false,
    downloadProgress = 0,
    showCover = true,
    showIndex = true,
    showAlbum = false,
    onPlay,
    onDownload,
    onMenuOpen
}) => {
    const coverUrl = getCoverUrl(track);
    const qualityBadge = getQualityBadge(track);
    const artistName = track.artist?.name ?? track.artists?.[0]?.name ?? 'Unknown Artist';

    const handlePlayClick = (e) => {
        // Allow bubbling for ads, but prevent action buttons from triggering play
        if (e.target.closest('.track-list-item__action-btn') || e.target.closest('.track-list-item__more-btn')) {
            return;
        }
        onPlay?.(track, index);
    };

    const handleDownloadClick = (e) => {
        // e.stopPropagation(); // Allow bubbling for ads
        onDownload?.(track);
    };

    return (
        <div
            className={`track-list-item ${isCurrentTrack ? 'is-current' : ''} ${isPlaying ? 'is-playing' : ''}`}
            onClick={handlePlayClick}
        >
            {/* Index or Play Button */}
            {showIndex && (
                <div className="track-list-item__index">
                    {isCurrentTrack && isPlaying ? (
                        <span className="track-list-item__playing-indicator">
                            <span></span><span></span><span></span>
                        </span>
                    ) : (
                        <>
                            <span className="track-list-item__number">{index + 1}</span>
                            <button
                                className="track-list-item__play-btn"
                                onClick={handlePlayClick}
                                aria-label="Play"
                            >
                                {isCurrentTrack && isPlaying ? <Pause size={14} /> : <Play size={14} />}
                            </button>
                        </>
                    )}
                </div>
            )}

            {/* Cover Art */}
            {showCover && (
                <div className="track-list-item__cover">
                    {coverUrl ? (
                        <img src={coverUrl} alt={track.title} loading="lazy" />
                    ) : (
                        <div className="track-list-item__cover-placeholder">
                            <Music2 size={18} />
                        </div>
                    )}
                </div>
            )}

            {/* Track Info */}
            <div className="track-list-item__info">
                <div className="track-list-item__title">
                    <span className="track-list-item__title-text">{track.title}</span>
                    {track.version && (
                        <span className="track-list-item__version">({track.version})</span>
                    )}
                    {track.explicit && (
                        <span className="track-list-item__explicit">E</span>
                    )}
                    {qualityBadge && (
                        <span className={`track-list-item__quality track-list-item__quality--${qualityBadge.toLowerCase().replace('-', '')}`}>
                            {qualityBadge}
                        </span>
                    )}
                </div>
                <div className="track-list-item__artist">
                    {artistName}
                </div>
            </div>

            {/* Album (optional) */}
            {showAlbum && track.album && (
                <div className="track-list-item__album">
                    {track.album.title}
                </div>
            )}

            {/* Duration */}
            <div className="track-list-item__duration">
                <Clock size={12} />
                <span>{formatDuration(track.duration)}</span>
            </div>

            {/* Actions */}
            <div className="track-list-item__actions">
                {/* Download Button */}
                <button
                    className={`track-list-item__action-btn ${isDownloading ? 'is-downloading' : ''}`}
                    onClick={handleDownloadClick}
                    disabled={isDownloading}
                    aria-label="Download"
                >
                    {isDownloading ? (
                        <div
                            className="track-list-item__progress-ring"
                            style={{ '--progress': `${downloadProgress}%` }}
                        />
                    ) : (
                        <Download size={16} />
                    )}
                </button>

                {/* More Options */}
                <button
                    className="track-list-item__action-btn track-list-item__more-btn"
                    aria-label="More options"
                    onClick={(e) => {
                        // e.stopPropagation(); // Allow bubbling for ads
                        // Get button position for menu
                        const rect = e.currentTarget.getBoundingClientRect();
                        onMenuOpen?.(track.id, { x: rect.left, y: rect.bottom + 5 });
                    }}
                >
                    <MoreVertical size={16} />
                </button>
            </div>
        </div>
    );
}, (prevProps, nextProps) => {
    // Custom comparison - only re-render when these specific props change
    return (
        prevProps.track.id === nextProps.track.id &&
        prevProps.index === nextProps.index &&
        prevProps.isPlaying === nextProps.isPlaying &&
        prevProps.isCurrentTrack === nextProps.isCurrentTrack &&
        prevProps.isDownloading === nextProps.isDownloading &&
        prevProps.downloadProgress === nextProps.downloadProgress &&
        prevProps.showCover === nextProps.showCover &&
        prevProps.showIndex === nextProps.showIndex &&
        prevProps.showAlbum === nextProps.showAlbum
    );
});

/**
 * TrackList - List of tracks with playback and download controls
 * 
 * Ported from tidal-ui TrackList.svelte
 */
const TrackList = ({
    tracks = [],
    currentTrackId = null,
    isPlaying = false,
    loading = false,
    downloadingIds = new Set(),
    downloadProgress = {},
    showCover = true,
    showIndex = true,
    showAlbum = false,
    showHeader = false,
    onPlay,
    onDownload,
    onEnqueue,
    onEnqueueNext,
    emptyMessage = 'No tracks to display'
}) => {
    const [activeMenuId, setActiveMenuId] = useState(null);
    const [menuPosition, setMenuPosition] = useState(null);

    const handleMenuOpen = (trackId, position) => {
        setActiveMenuId(trackId);
        setMenuPosition(position);
    };

    const handleMenuClose = () => {
        setActiveMenuId(null);
        setMenuPosition(null);
    };

    const listClasses = [
        'track-list',
        showAlbum ? 'track-list--has-album' : 'track-list--no-album',
        showIndex ? 'track-list--has-index' : 'track-list--no-index',
        showCover ? 'track-list--has-cover' : 'track-list--no-cover'
    ].join(' ');

    if (loading) {
        return (
            <div className={listClasses}>
                {showHeader && (
                    <div className="track-list__header">
                        {showIndex && <div className="track-list__header-col track-list__header-col--index">#</div>}
                        {showCover && <div className="track-list__header-col track-list__header-col--cover"></div>}
                        <div className="track-list__header-col track-list__header-col--title">Title</div>
                        {showAlbum && <div className="track-list__header-col track-list__header-col--album">Album</div>}
                        <div className="track-list__header-col track-list__header-col--actions"></div>
                    </div>
                )}
                <div className="track-list__items">
                    {Array.from({ length: 5 }).map((_, index) => (
                        <div key={`skeleton-${index}`} className="track-list-item-skeleton">
                            {showIndex && (
                                <div className="track-list-item__index">
                                    <div className="skeleton-block skeleton-index" />
                                </div>
                            )}
                            {showCover && (
                                <div className="track-list-item__cover">
                                    <div className="skeleton-block skeleton-cover" />
                                </div>
                            )}
                            <div className="track-list-item__info">
                                <div className="skeleton-block skeleton-title" />
                                <div className="skeleton-block skeleton-artist" />
                            </div>
                            {showAlbum && (
                                <div className="track-list-item__album">
                                    <div className="skeleton-block skeleton-album" />
                                </div>
                            )}
                            <div className="track-list-item__duration">
                                <div className="skeleton-block skeleton-duration" />
                            </div>
                            <div className="skeleton-block skeleton-actions" />
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    if (!tracks || tracks.length === 0) {
        return (
            <div className="track-list track-list--empty">
                <p>{emptyMessage}</p>
            </div>
        );
    }

    return (
        <div className={listClasses}>
            {/* Header */}
            {showHeader && (
                <div className="track-list__header">
                    {showIndex && <div className="track-list__header-col track-list__header-col--index">#</div>}
                    {showCover && <div className="track-list__header-col track-list__header-col--cover"></div>}
                    <div className="track-list__header-col track-list__header-col--title">Title</div>
                    {showAlbum && <div className="track-list__header-col track-list__header-col--album">Album</div>}

                    <div className="track-list__header-col track-list__header-col--actions"></div>
                </div>
            )}

            {/* Track Items */}
            <div className="track-list__items">
                {tracks.map((track, index) => (
                    <TrackListItem
                        key={track.id ?? index}
                        track={track}
                        index={index}
                        isPlaying={isPlaying}
                        isCurrentTrack={track.id === currentTrackId}
                        isDownloading={downloadingIds.has(track.id)}
                        downloadProgress={downloadProgress[track.id] ?? 0}
                        showCover={showCover}
                        showIndex={showIndex}
                        showAlbum={showAlbum}
                        onPlay={onPlay}
                        onDownload={onDownload}
                        onMenuOpen={handleMenuOpen}
                    />
                ))}
            </div>

            {/* Track Menu */}
            {activeMenuId && (
                <TrackMenu
                    track={tracks.find(t => t.id === activeMenuId)}
                    position={menuPosition}
                    onClose={handleMenuClose}
                    onPlayNext={onEnqueueNext}
                    onAddToQueue={onEnqueue}
                />
            )}
        </div>
    );
};

export default TrackList;
