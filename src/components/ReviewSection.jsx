import React, { useState, useEffect, useCallback, memo } from 'react';
import useReviews from '../hooks/useReviews';
import './ReviewSection.css';

/**
 * Format a timestamp into a relative time string (e.g., "2h ago", "3d ago")
 */
const formatTimeAgo = (timestamp) => {
    if (!timestamp) return '';
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    const months = Math.floor(days / 30);
    return `${months}mo ago`;
};

/**
 * Star icon component
 */
const StarIcon = ({ filled, size = 16, onClick, onMouseEnter, onMouseLeave, interactive }) => (
    <span
        className={`star-icon ${filled ? '' : 'empty'}`}
        onClick={onClick}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        style={{
            color: filled ? '#FFC107' : 'rgba(255,255,255,0.15)',
            cursor: interactive ? 'pointer' : 'default',
            fontSize: size,
            transition: 'color 0.15s, transform 0.15s',
            display: 'inline-block',
            userSelect: 'none'
        }}
        role={interactive ? 'button' : undefined}
        aria-label={interactive ? `Rate ${size} stars` : undefined}
    >
        ★
    </span>
);

/**
 * Star Picker — interactive 1-5 star selector
 */
const StarPicker = ({ value, onChange }) => {
    const [hoverValue, setHoverValue] = useState(0);
    const displayValue = hoverValue || value;

    const labels = ['', 'Bad', 'Poor', 'Average', 'Good', 'Excellent'];

    return (
        <div className="star-picker">
            <span className="star-picker-label">Rating:</span>
            {[1, 2, 3, 4, 5].map(star => (
                <button
                    key={star}
                    type="button"
                    className="star-picker-btn"
                    onClick={() => onChange(star)}
                    onMouseEnter={() => setHoverValue(star)}
                    onMouseLeave={() => setHoverValue(0)}
                    aria-label={`${star} star${star !== 1 ? 's' : ''}`}
                >
                    <svg
                        width="22"
                        height="22"
                        viewBox="0 0 24 24"
                        fill={star <= displayValue ? '#FFC107' : 'none'}
                        stroke={star <= displayValue ? '#FFC107' : 'rgba(255,255,255,0.2)'}
                        strokeWidth="2"
                    >
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                    </svg>
                </button>
            ))}
            {displayValue > 0 && (
                <span className="star-picker-text">{labels[displayValue]}</span>
            )}
        </div>
    );
};

/**
 * Rating Summary — aggregate rating display with distribution bars
 */
const RatingSummary = ({ aggregate, averageRating }) => {
    if (!aggregate) return null;

    const { reviewCount, distribution = {} } = aggregate;
    const avg = parseFloat(averageRating);

    return (
        <div className="rating-summary">
            <div className="rating-big-number">
                <span className="rating-big-value">{averageRating}</span>
                <div className="rating-big-stars">
                    {[1, 2, 3, 4, 5].map(s => (
                        <StarIcon key={s} filled={s <= Math.round(avg)} size={14} />
                    ))}
                </div>
                <span className="rating-big-count">{reviewCount} review{reviewCount !== 1 ? 's' : ''}</span>
            </div>
            <div className="rating-distribution">
                {[5, 4, 3, 2, 1].map(star => {
                    const count = distribution[star] || 0;
                    const pct = reviewCount > 0 ? (count / reviewCount) * 100 : 0;
                    return (
                        <div key={star} className="rating-bar-row">
                            <span className="rating-bar-label">{star}</span>
                            <div className="rating-bar-track">
                                <div className="rating-bar-fill" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="rating-bar-count">{count}</span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

/**
 * Single Review Card
 */
const ReviewCard = memo(({ review, onLike, onDelete }) => (
    <div className="review-card">
        <div className="review-card-header">
            {review.avatarUrl ? (
                <img src={review.avatarUrl} alt="" className="review-avatar" loading="lazy" />
            ) : (
                <div className="review-avatar" />
            )}
            <div className="review-meta">
                <div className="review-nickname">
                    {review.nickname || 'Anonymous'}
                    {review.isOwn && <span className="review-own-badge">You</span>}
                </div>
                <div className="review-stars-row">
                    {[1, 2, 3, 4, 5].map(s => (
                        <StarIcon key={s} filled={s <= review.rating} size={11} />
                    ))}
                </div>
            </div>
            <span className="review-timestamp">{formatTimeAgo(review.createdAt)}</span>
        </div>

        {review.text && <p className="review-text">{review.text}</p>}

        <div className="review-card-footer">
            <button
                className={`review-like-btn ${review.isLiked ? 'liked' : ''}`}
                onClick={() => onLike(review.id)}
                aria-label={review.isLiked ? 'Unlike' : 'Like'}
            >
                <svg width="14" height="14" viewBox="0 0 24 24" fill={review.isLiked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                </svg>
                {review.likeCount > 0 && <span>{review.likeCount}</span>}
            </button>

            {review.isOwn && (
                <button
                    className="review-delete-btn"
                    onClick={onDelete}
                    aria-label="Delete your review"
                >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                    Delete
                </button>
            )}
        </div>
    </div>
));

ReviewCard.displayName = 'ReviewCard';

/**
 * ReviewSection — Main component rendered inside Modal
 */
const ReviewSection = memo(({ contentId, type }) => {
    const {
        reviews,
        aggregate,
        averageRating,
        userReview,
        loading,
        submitting,
        error,
        submitReview,
        deleteReview,
        toggleLike,
        getUserInfo
    } = useReviews(contentId, type);

    const [showForm, setShowForm] = useState(false);
    const [rating, setRating] = useState(0);
    const [text, setText] = useState('');
    const [userInfo, setUserInfo] = useState(null);
    const [needsNickname, setNeedsNickname] = useState(false);
    const [checkingUser, setCheckingUser] = useState(false);

    // Check user info when form opens
    const handleOpenForm = useCallback(async () => {
        setCheckingUser(true);
        const info = await getUserInfo();
        setCheckingUser(false);

        if (info && info.nickname) {
            setUserInfo(info);
            setNeedsNickname(false);
            // Pre-fill if editing
            if (userReview) {
                setRating(userReview.rating);
                setText(userReview.text || '');
            }
            setShowForm(true);
        } else {
            setNeedsNickname(true);
            setShowForm(true);
        }
    }, [getUserInfo, userReview]);

    const handleCloseForm = useCallback(() => {
        setShowForm(false);
        setRating(0);
        setText('');
        setNeedsNickname(false);
    }, []);


    // Submit review handler
    const handleSubmit = useCallback(async () => {
        if (!userInfo || rating === 0) return;

        await submitReview({
            rating,
            text,
            nickname: userInfo.nickname,
            avatarUrl: userInfo.avatarUrl
        });

        handleCloseForm();
    }, [userInfo, rating, text, submitReview, handleCloseForm]);

    // Delete review handler
    const handleDelete = useCallback(async () => {
        await deleteReview();
    }, [deleteReview]);

    if (loading) {
        return (
            <div className="review-section">
                <div className="review-section-header">
                    <h3 className="review-section-title">Ratings & Reviews</h3>
                </div>
                <div className="review-loading">Loading reviews...</div>
            </div>
        );
    }

    return (
        <div className="review-section">
            <div className="review-section-header">
                <h3 className="review-section-title">Ratings & Reviews</h3>
            </div>

            {/* Aggregate Rating Summary */}
            <RatingSummary aggregate={aggregate} averageRating={averageRating} />

            {/* Error */}
            {error && <div className="review-error">{error}</div>}

            {/* Write/Edit Review Button */}
            {!showForm && (
                <button
                    className={`write-review-btn ${userReview ? 'edit-mode' : ''}`}
                    onClick={handleOpenForm}
                    disabled={checkingUser}
                >
                    {checkingUser ? 'Loading...' : userReview ? 'Edit Your Review' : 'Write a Review'}
                </button>
            )}

            {/* Review Form */}
            {showForm && (
                <div className="review-form">
                    {needsNickname ? (
                        /* Direct user to Live Chat for account setup */
                        <div className="review-nickname-setup">
                            <p>You need a chat profile to write reviews.</p>
                            <p style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.45)', marginTop: '4px' }}>
                                Open <strong style={{ color: '#FFC107' }}>Streamflix Live Chat</strong> from the bottom-right corner to set up your nickname, then come back here.
                            </p>
                            <button className="review-cancel-btn" onClick={handleCloseForm} style={{ marginTop: '10px' }}>
                                Got it
                            </button>
                        </div>
                    ) : (
                        /* Review Form Content */
                        <>
                            <h4 className="review-form-title">
                                {userReview ? 'Edit your review' : 'What did you think?'}
                            </h4>

                            <StarPicker value={rating} onChange={setRating} />

                            <textarea
                                className="review-textarea"
                                placeholder="Share your thoughts (optional)..."
                                value={text}
                                onChange={(e) => setText(e.target.value.slice(0, 500))}
                                maxLength={500}
                            />

                            <div className="review-form-footer">
                                <span className={`review-char-count ${text.length > 450 ? 'near-limit' : ''}`}>
                                    {text.length}/500
                                </span>
                                <div className="review-form-actions">
                                    <button className="review-cancel-btn" onClick={handleCloseForm}>
                                        Cancel
                                    </button>
                                    <button
                                        className="review-submit-btn"
                                        onClick={handleSubmit}
                                        disabled={rating === 0 || submitting}
                                    >
                                        {submitting ? 'Submitting...' : userReview ? 'Update' : 'Submit'}
                                    </button>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* Reviews List */}
            {reviews.length > 0 ? (
                <div className="reviews-list">
                    {reviews.map(review => (
                        <ReviewCard
                            key={review.id}
                            review={review}
                            onLike={toggleLike}
                            onDelete={handleDelete}
                        />
                    ))}
                </div>
            ) : (
                <div className="reviews-empty">
                    <div className="reviews-empty-icon">💬</div>
                    Be the first to review!
                </div>
            )}
        </div>
    );
});

ReviewSection.displayName = 'ReviewSection';

export default ReviewSection;
