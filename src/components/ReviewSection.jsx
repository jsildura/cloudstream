/**
 * ReviewSection — displays real TMDB audience reviews inside the Modal.
 *
 * Data is sourced from TMDB's /movie/{id}/reviews (or /tv/{id}/reviews).
 * voteAverage and voteCount come pre-fetched from the Modal's item object
 * so we avoid a redundant detail fetch.
 */
import React, { useState, memo } from 'react';
import useTMDBReviews, { resolveAvatar } from '../hooks/useTMDBReviews';
import './ReviewSection.css';

// ─── Helpers ────────────────────────────────────────────────────────────────

const formatDate = (iso) => {
    if (!iso) return '';
    try {
        return new Date(iso).toLocaleDateString('en-US', {
            year: 'numeric', month: 'short', day: 'numeric'
        });
    } catch {
        return '';
    }
};

const formatVoteCount = (n) => {
    if (!n) return '';
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return n.toLocaleString();
};

// ─── Star display (read-only, supports half-stars) ───────────────────────────

const StarRow = ({ rating, outOf5 = true, size = 13 }) => {
    if (rating == null) return null;
    const max = outOf5 ? 5 : 5;
    const normalized = outOf5 ? rating : rating / 2;

    return (
        <div className="review-stars-row" aria-label={`Rated ${rating} out of ${outOf5 ? 5 : 10}`}>
            {Array.from({ length: max }, (_, i) => {
                const filled = normalized >= i + 1;
                const half = !filled && normalized >= i + 0.5;
                return (
                    <svg
                        key={i}
                        width={size}
                        height={size}
                        viewBox="0 0 24 24"
                        className={`review-star ${filled ? 'full' : half ? 'half' : 'empty'}`}
                    >
                        <defs>
                            {half && (
                                <linearGradient id={`half-${i}`} x1="0" x2="1" y1="0" y2="0">
                                    <stop offset="50%" stopColor="#FFC107" />
                                    <stop offset="50%" stopColor="transparent" />
                                </linearGradient>
                            )}
                        </defs>
                        <polygon
                            points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"
                            fill={filled ? '#FFC107' : half ? `url(#half-${i})` : 'none'}
                            stroke={filled || half ? '#FFC107' : 'rgba(255,255,255,0.18)'}
                            strokeWidth="1.5"
                        />
                    </svg>
                );
            })}
        </div>
    );
};

// ─── Avatar ──────────────────────────────────────────────────────────────────

const Avatar = ({ url, name }) => {
    const [failed, setFailed] = useState(false);
    const initials = (name || '?').charAt(0).toUpperCase();

    if (url && !failed) {
        return (
            <img
                src={url}
                alt=""
                className="review-avatar"
                loading="lazy"
                onError={() => setFailed(true)}
            />
        );
    }
    return <div className="review-avatar review-avatar-initials">{initials}</div>;
};

// ─── Single review card ──────────────────────────────────────────────────────

const TRUNCATE_LEN = 400;

const ReviewCard = memo(({ review }) => {
    const [expanded, setExpanded] = useState(false);
    const { author, username, avatarUrl, rating, content, createdAt, url } = review;

    const shouldTruncate = content.length > TRUNCATE_LEN;
    const displayText = shouldTruncate && !expanded
        ? content.slice(0, TRUNCATE_LEN).trimEnd() + '…'
        : content;

    return (
        <div className="review-card">
            <div className="review-card-header">
                <Avatar url={avatarUrl} name={author} />

                <div className="review-meta">
                    <div className="review-author">{author || username}</div>
                    {rating != null && (
                        <StarRow rating={rating} />
                    )}
                </div>

                <div className="review-card-header-right">
                    <span className="review-timestamp">{formatDate(createdAt)}</span>
                    {url && (
                        <a
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="review-source-link"
                            aria-label="Read full review on TMDB"
                        >
                            Full review
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                                <polyline points="15 3 21 3 21 9" />
                                <line x1="10" y1="14" x2="21" y2="3" />
                            </svg>
                        </a>
                    )}
                </div>
            </div>

            {content && (
                <>
                    <p className="review-text">{displayText}</p>
                    {shouldTruncate && (
                        <button
                            className="review-read-more"
                            onClick={() => setExpanded((e) => !e)}
                        >
                            {expanded ? 'Show less' : 'Read more'}
                        </button>
                    )}
                </>
            )}
        </div>
    );
});

ReviewCard.displayName = 'ReviewCard';

// ─── Score summary ───────────────────────────────────────────────────────────

const ScoreSummary = ({ voteAverage, voteCount }) => {
    if (!voteAverage) return null;
    const score = parseFloat(voteAverage).toFixed(1);
    const ratingOutOf5 = voteAverage / 2;

    return (
        <div className="review-score-row">
            <span className="review-big-score">{score}</span>
            <div className="review-score-right">
                <StarRow rating={ratingOutOf5} size={14} />
                {voteCount > 0 && (
                    <span className="review-vote-count">{formatVoteCount(voteCount)} votes</span>
                )}
            </div>
        </div>
    );
};

// ─── Main Component ───────────────────────────────────────────────────────────

const ReviewSection = memo(({ contentId, type, voteAverage, voteCount }) => {
    const { reviews, totalResults, loading, error } = useTMDBReviews(contentId, type);

    return (
        <div className="review-section">
            <div className="review-section-header">
                <h3 className="review-section-title">Audience Reviews</h3>
                <span className="review-tmdb-badge">via TMDB</span>
            </div>

            <ScoreSummary voteAverage={voteAverage} voteCount={voteCount} />

            {loading && (
                <div className="review-loading">Loading reviews…</div>
            )}

            {!loading && error && (
                <div className="review-error">{error}</div>
            )}

            {!loading && !error && reviews.length > 0 && (
                <>
                    <div className="reviews-list">
                        {reviews.map((review) => (
                            <ReviewCard key={review.id} review={review} />
                        ))}
                    </div>
                    {totalResults > reviews.length && (
                        <p className="review-more-hint">
                            Showing {reviews.length} of {totalResults} reviews
                        </p>
                    )}
                </>
            )}

            {!loading && !error && reviews.length === 0 && (
                <div className="reviews-empty">
                    <div className="reviews-empty-icon">🎬</div>
                    No written reviews yet on TMDB.
                </div>
            )}
        </div>
    );
});

ReviewSection.displayName = 'ReviewSection';

export default ReviewSection;
