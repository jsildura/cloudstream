import React from 'react';
import { Play, Download, Music2 } from 'lucide-react';
import './TopTracksGrid.css';

/**
 * Get cover image URL
 */
const getCoverUrl = (track, size = 320) => {
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
 * Get quality badge
 */
const getQualityBadge = (track) => {
    const quality = track.audioQuality;
    if (quality === 'HI_RES_LOSSLESS' || quality === 'HI_RES') return 'Hi-Res';
    if (quality === 'LOSSLESS') return 'CD';
    return null;
};

/**
 * TopTracksGrid - Grid of top/popular tracks
 * 
 * Ported from tidal-ui TopTracksGrid.svelte
 * Features:
 * - Card-based grid layout
 * - Cover art with hover play button
 * - Track info and quality badge
 */
const TopTracksGrid = ({
    tracks = [],
    onPlay,
    onDownload,
    maxTracks = 10,
    title,
    currentTrackId = null,
    isPlaying = false
}) => {
    const displayTracks = tracks.slice(0, maxTracks);

    if (displayTracks.length === 0) {
        return null;
    }

    return (
        <div className="top-tracks-grid">
            {title && <h3 className="top-tracks-grid__title">{title}</h3>}

            <div className="top-tracks-grid__items">
                {displayTracks.map((track, index) => {
                    const coverUrl = getCoverUrl(track);
                    const qualityBadge = getQualityBadge(track);
                    const artistName = track.artist?.name ?? track.artists?.[0]?.name ?? 'Unknown';
                    const isCurrent = track.id === currentTrackId;

                    return (
                        <div
                            key={track.id ?? index}
                            className={`top-tracks-grid__item ${isCurrent ? 'is-current' : ''}`}
                        >
                            {/* Cover */}
                            <div
                                className="top-tracks-grid__cover"
                                onClick={() => onPlay?.(track, index)}
                            >
                                {coverUrl ? (
                                    <img src={coverUrl} alt={track.title} loading="lazy" />
                                ) : (
                                    <div className="top-tracks-grid__cover-placeholder">
                                        <Music2 size={32} />
                                    </div>
                                )}

                                {/* Play Overlay */}
                                <div className="top-tracks-grid__play-overlay">
                                    <button
                                        className="top-tracks-grid__play-btn"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onPlay?.(track, index);
                                        }}
                                    >
                                        <Play size={24} />
                                    </button>
                                </div>

                                {/* Rank Badge */}
                                <div className="top-tracks-grid__rank">
                                    {index + 1}
                                </div>

                                {/* Quality Badge */}
                                {qualityBadge && (
                                    <div className={`top-tracks-grid__quality top-tracks-grid__quality--${qualityBadge.toLowerCase().replace('-', '')}`}>
                                        {qualityBadge}
                                    </div>
                                )}
                            </div>

                            {/* Info */}
                            <div className="top-tracks-grid__info">
                                <div className="top-tracks-grid__track-title">
                                    {track.title}
                                </div>
                                <div className="top-tracks-grid__artist">
                                    {artistName}
                                </div>
                            </div>

                            {/* Download Button */}
                            {onDownload && (
                                <button
                                    className="top-tracks-grid__download"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onDownload?.(track);
                                    }}
                                    aria-label="Download"
                                >
                                    <Download size={16} />
                                </button>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default TopTracksGrid;
