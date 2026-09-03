/**
 * HoverPreviewCard - the "Interactive Preview Card" shown on card hover.
 *
 * Rendered in a portal by HoverPreviewProvider so it can overflow the
 * carousels. Starts on the backdrop, cross-fades to a muted trailer after a
 * beat, and exposes Watch now / Share / My List / More info.
 */
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useTMDB, pickLogoPath, pickTrailerKey, parseContentRating } from '../hooks/useTMDB';
import useWatchlist from '../hooks/useWatchlist';
import { useToast } from '../contexts/ToastContext';
import { useHoverPreview } from '../contexts/HoverPreviewContext';
import { maybeOpenSmartlinkAd } from '../utils/adGating';
import { previewBackdrop, posterAsBackdrop, cardBackdrop, cardLogo } from '../utils/images';
import YouTubePlayer from './YouTubePlayer';
import './HoverPreviewCard.css';

// How long the backdrop holds before the trailer takes over.
const VIDEO_DELAY = 1600;

const VIEWPORT_MARGIN = 12;

/**
 * The preview is a fixed size per breakpoint rather than a multiple of the
 * source card, which ranges from a 200px tile to a 1520px 4K studio card.
 * Steps match the CSS breakpoints so the padded/scaled chrome stays in
 * proportion with the media.
 */
const previewWidthFor = (vw) => {
    if (vw >= 3840) return 1130;
    if (vw >= 1920) return 570;
    if (vw >= 1024) return 430;
    return 370;
};

/** Media (16:9) plus the info panel, which grows with the breakpoint.
 *  The 1920 tier's chrome is only ~1.15x the 1024 tier (see HoverPreviewCard.css
 *  — it deliberately does NOT use the 10-foot TV scale the other 1920 blocks do),
 *  so the panel is sized just above the 1024 value, not doubled. */
const bodyHeightFor = (vw) => {
    if (vw >= 3840) return 360;
    if (vw >= 1920) return 152;
    return 132;
};

const HoverPreviewCard = ({ item, type, rect, onMoreInfo, isClosing = false, initialBackdropSrc = null }) => {
    const navigate = useNavigate();
    const { fetchItemBundle, movieGenres, tvGenres } = useTMDB();
    const { isInWatchlist, toggleWatchlist } = useWatchlist();
    const { showSuccess, showError } = useToast();
    const { keepPreview, closePreview, closeNow } = useHoverPreview();

    const [logoPath, setLogoPath] = useState(item.logo_path || null);
    const [trailerKey, setTrailerKey] = useState(null);
    const [showVideo, setShowVideo] = useState(false);
    const [contentRating, setContentRating] = useState(item.contentRating || null);
    const [isMuted, setIsMuted] = useState(false);

    // Evaluate list status directly from the hook to stay in sync
    const inList = isInWatchlist(type || item.type || 'movie', item.id);

    // runtime in minutes — seeded from item if detail-fetched, else lazy-loaded
    const [runtimeMins, setRuntimeMins] = useState(
        item.runtime || (Array.isArray(item.episode_run_time) ? item.episode_run_time[0] : null) || null
    );

    const videoTimer = useRef(null);
    const title = item.title || item.name || '';

    // Fetch logo / trailer / rating / runtime in parallel; bail out if the preview
    // unmounts first so we never setState on a dead component.
    useEffect(() => {
        let alive = true;

        (async () => {
            const needsRuntime = !item.runtime && !(Array.isArray(item.episode_run_time) && item.episode_run_time[0]);

            // One request covers all four pieces. Runtime and the rating come
            // from the detail record we have to load anyway, so only the appends
            // are conditional: skip them when the row already enriched the item.
            const appends = ['videos'];
            if (!item.logo_path) appends.push('images');
            if (!item.contentRating) {
                appends.push(type === 'tv' ? 'content_ratings' : 'release_dates');
            }

            const data = await fetchItemBundle(type, item.id, appends).catch(() => null);
            if (!alive || !data) return;

            const logo = item.logo_path || pickLogoPath(data.images?.logos || []);
            const rating = item.contentRating || parseContentRating(
                type,
                type === 'tv' ? data.content_ratings : data.release_dates
            );
            const key = pickTrailerKey(data.videos?.results || []);

            if (logo) setLogoPath(logo);
            if (rating) setContentRating(rating);
            if (needsRuntime) {
                const mins = data.runtime ||
                    (Array.isArray(data.episode_run_time) ? data.episode_run_time[0] : null);
                if (mins) setRuntimeMins(mins);
            }
            if (key) {
                setTrailerKey(key);
                videoTimer.current = setTimeout(() => setShowVideo(true), VIDEO_DELAY);
            }
        })();

        return () => {
            alive = false;
            if (videoTimer.current) clearTimeout(videoTimer.current);
        };
    }, [item.id, type, item.logo_path, item.contentRating, item.runtime, item.episode_run_time, fetchItemBundle]);

    // Position: centred on the source card, clamped to the viewport, flipped
    // above the card when there isn't room below.
    const style = useMemo(() => {
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const width = Math.min(previewWidthFor(vw), vw - VIEWPORT_MARGIN * 2);

        let left = rect.left + rect.width / 2 - width / 2;
        left = Math.max(VIEWPORT_MARGIN, Math.min(left, vw - width - VIEWPORT_MARGIN));

        const estimatedHeight = width * (9 / 16) + bodyHeightFor(vw);
        const cardCenter = rect.top + rect.height / 2;
        let top = cardCenter - estimatedHeight / 2;

        if (top + estimatedHeight > vh - VIEWPORT_MARGIN) {
            top = vh - estimatedHeight - VIEWPORT_MARGIN;
        }
        top = Math.max(VIEWPORT_MARGIN, top);

        return { top: `${top}px`, left: `${left}px`, width: `${width}px` };
    }, [rect]);

    const handleWatchNow = useCallback((e) => {
        e.stopPropagation();

        // Shared smartlink gate: no-op while pending or ad-free.
        maybeOpenSmartlinkAd();

        closeNow();
        navigate(`/watch?type=${type}&id=${item.id}`, { state: { fromModal: true } });
    }, [navigate, type, item.id, closeNow]);

    const handleShare = useCallback(async (e) => {
        e.stopPropagation();
        const shareData = {
            title,
            text: `Check out ${title}`,
            url: `${window.location.origin}/watch?type=${type}&id=${item.id}`,
        };

        try {
            if (navigator.share) {
                await navigator.share(shareData);
            } else {
                await navigator.clipboard.writeText(shareData.url);
                showSuccess('Link copied to clipboard!');
            }
        } catch (error) {
            if (error.name !== 'AbortError') console.error('Share failed:', error);
        }
    }, [title, type, item.id, showSuccess]);

    const handleToggleList = useCallback(async (e) => {
        e.stopPropagation();
        const mediaType = type || item.type || item.media_type || (item.first_air_date || (item.name && !item.title) ? 'tv' : 'movie');
        const res = await toggleWatchlist({
            id: item.id,
            type: mediaType,
            title: item.title || item.name,
            poster_path: item.poster_path,
            backdrop_path: item.backdrop_path,
            overview: item.overview,
            vote_average: item.vote_average,
            release_date: item.release_date || item.first_air_date,
            genres: item.genres || item.genre_ids
        });

        if (res?.ok) {
            showSuccess(res.action === 'added' ? 'Added to Watchlist' : 'Removed from Watchlist');
        } else if (res?.reason === 'sign-in-required') {
            showError('Sign in with Google to add to Watchlist');
        } else if (res?.message) {
            showError(res.message);
        }
    }, [item, type, toggleWatchlist, showSuccess, showError]);

    // Hands off to the row's own card-click handler so the modal that opens is
    // the exact same one - same enrichment (genres / cast / rating), same
    // owner component - as clicking the card without the preview.
    const handleMoreInfo = useCallback((e) => {
        e.stopPropagation();
        closeNow(800);
        onMoreInfo?.(item);
    }, [item, onMoreInfo, closeNow]);

    const backdropSrc = initialBackdropSrc
        ?? cardBackdrop(item.backdrop_path)
        ?? previewBackdrop(item.backdrop_path)
        ?? posterAsBackdrop(item.poster_path)
        ?? '/icons/placeholder.svg';
    // Decorative fallback art — render it letterboxed/contained, not stretched
    // across the whole 16:9 media area like a real backdrop (see CSS).
    const isPlaceholder = backdropSrc === '/icons/placeholder.svg';

    const year = (item.release_date || item.first_air_date || '').substring(0, 4);

    // Runtime formatted from lazy-loaded state
    const runtime = runtimeMins
        ? runtimeMins >= 60
            ? `${Math.floor(runtimeMins / 60)}h ${runtimeMins % 60}m`
            : `${runtimeMins}m`
        : null;

    // Genres: prefer pre-enriched names, else map from genre_ids
    const genreMap = type === 'tv' ? tvGenres : movieGenres;
    const genres = item.genres?.length
        ? item.genres.map(g => (typeof g === 'string' ? g : g.name)).filter(Boolean)
        : (item.genre_ids || []).map(id => genreMap?.get(id)).filter(Boolean);

    return createPortal(
        <div
            className={`hover-preview-card${isClosing ? ' closing' : ''}`}
            style={style}
            onMouseEnter={keepPreview}
            onMouseLeave={closePreview}
            role="dialog"
            aria-label={`Preview: ${title}`}
        >
            <div className={`hover-preview-media${isPlaceholder ? ' placeholder' : ''}`}>
                {backdropSrc && (
                    <img
                        src={backdropSrc}
                        alt={title}
                        className={`hover-preview-backdrop${showVideo ? ' faded' : ''}${isPlaceholder ? ' placeholder' : ''}`}
                        draggable="false"
                    />
                )}

                {showVideo && trailerKey && (
                    <YouTubePlayer
                        videoId={trailerKey}
                        isMuted={isMuted}
                        onMuteChange={setIsMuted}
                    />
                )}

                <div className="hover-preview-scrim" />

                {logoPath ? (
                    <div className="hover-preview-logo-overlay">
                        <img src={cardLogo(logoPath)} alt={title} draggable="false" />
                    </div>
                ) : (
                    <div className="hover-preview-title-overlay">{title}</div>
                )}

                {showVideo && trailerKey && (
                    <button
                        className="hover-preview-mute"
                        onClick={(e) => { e.stopPropagation(); setIsMuted((m) => !m); }}
                        aria-label={isMuted ? 'Unmute preview' : 'Mute preview'}
                        title={isMuted ? 'Unmute' : 'Mute'}
                    >
                        {isMuted ? (
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                                <line x1="23" y1="9" x2="17" y2="15" />
                                <line x1="17" y1="9" x2="23" y2="15" />
                            </svg>
                        ) : (
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                                <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                                <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                            </svg>
                        )}
                    </button>
                )}
            </div>

            <div className="hover-preview-body">
                <div className="hover-preview-actions">
                    <button className="banner-watch-btn" onClick={handleWatchNow}>
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                            <polygon points="6 3 20 12 6 21 6 3" />
                        </svg>
                        Watch now
                    </button>

                    <button
                        className="banner-action-icon"
                        onClick={handleShare}
                        aria-label="Share"
                        title="Share"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="18" cy="5" r="3" />
                            <circle cx="6" cy="12" r="3" />
                            <circle cx="18" cy="19" r="3" />
                            <line x1="8.59" x2="15.42" y1="13.51" y2="17.49" />
                            <line x1="15.41" x2="8.59" y1="6.51" y2="10.49" />
                        </svg>
                    </button>

                    <button
                        className={`banner-action-icon${inList ? ' in-watchlist' : ''}`}
                        onClick={handleToggleList}
                        aria-label={inList ? 'Remove from My List' : 'Add to My List'}
                        title={inList ? 'Remove from My List' : 'Add to My List'}
                    >
                        {inList ? (
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="20 6 9 17 4 12" />
                            </svg>
                        ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="12" y1="5" x2="12" y2="19" />
                                <line x1="5" y1="12" x2="19" y2="12" />
                            </svg>
                        )}
                    </button>

                    <button
                        className="banner-action-icon hover-preview-info"
                        onClick={handleMoreInfo}
                        aria-label="More info"
                        title="More info"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="m6 9 6 6 6-6" />
                        </svg>
                    </button>
                </div>

                <div className="hover-preview-meta">
                    {/* Row 1: [Rating] [HD] | Runtime | Year — badges group as a pair,
                        then rules separate them from the plain-text metadata. */}
                    <div className="hover-preview-meta-row1">
                        {contentRating && (
                            <span className="hover-preview-badge">{contentRating}</span>
                        )}
                        <span className="hover-preview-badge hover-preview-hd">HD</span>
                        {runtime && (
                            <>
                                <span className="hover-preview-meta-divider" aria-hidden="true" />
                                <span className="hover-preview-runtime">{runtime}</span>
                            </>
                        )}
                        {year && (
                            <>
                                <span className="hover-preview-meta-divider" aria-hidden="true" />
                                <span className="hover-preview-runtime hover-preview-year">{year}</span>
                            </>
                        )}
                    </div>

                    {/* Row 2: genre tags separated by bullet dots */}
                    {genres.length > 0 && (
                        <div className="hover-preview-genres">
                            {genres.slice(0, 3).map((g, i) => (
                                <span key={g} className="hover-preview-genre-item">
                                    {i > 0 && <span className="hover-preview-genre-dot" aria-hidden="true">•</span>}
                                    {g}
                                </span>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
};

export default HoverPreviewCard;
