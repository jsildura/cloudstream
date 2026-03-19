/**
 * useReviews - Hook for managing user ratings & reviews via Firebase RTDB
 * 
 * Data structure:
 *   reviews/{type}_{contentId}/{uid} = { uid, nickname, avatarUrl, rating, text, createdAt, likes: {uid: true} }
 *   ratings/{type}_{contentId} = { totalRating, reviewCount, distribution: {1:n, 2:n, 3:n, 4:n, 5:n} }
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { initFirebase } from '../lib/firebase';

const useReviews = (contentId, type = 'movie') => {
    const [reviews, setReviews] = useState([]);
    const [aggregate, setAggregate] = useState(null);
    const [userReview, setUserReview] = useState(null);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState(null);
    const [db, setDb] = useState(null);

    const authRef = useRef(null);
    const currentUserRef = useRef(null);
    const listenersRef = useRef([]);

    const contentKey = `${type}_${contentId}`;

    // Initialize Firebase
    useEffect(() => {
        const firebase = initFirebase();
        if (firebase) {
            setDb(firebase.db);
            authRef.current = firebase.auth;

            // Listen for auth state
            const unsubscribe = authRef.current.onAuthStateChanged((user) => {
                if (user) {
                    currentUserRef.current = user;
                } else {
                    // Sign in anonymously if not signed in
                    authRef.current.signInAnonymously().catch(console.error);
                }
            });

            return () => unsubscribe();
        }
    }, []);

    // Fetch reviews and aggregate rating (real-time)
    useEffect(() => {
        if (!db || !contentId) {
            setLoading(false);
            return;
        }

        setLoading(true);

        // Listen for reviews
        const reviewsRef = db.ref(`reviews/${contentKey}`);
        const reviewsCallback = (snapshot) => {
            const data = snapshot.val();
            if (!data) {
                setReviews([]);
                setUserReview(null);
                setLoading(false);
                return;
            }

            const reviewsList = Object.entries(data).map(([uid, review]) => ({
                id: uid,
                ...review,
                likeCount: review.likes ? Object.keys(review.likes).length : 0,
                isLiked: review.likes && currentUserRef.current
                    ? !!review.likes[currentUserRef.current.uid]
                    : false,
                isOwn: currentUserRef.current ? uid === currentUserRef.current.uid : false
            }));

            // Sort by createdAt descending
            reviewsList.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

            setReviews(reviewsList);

            // Find current user's review
            if (currentUserRef.current) {
                const own = reviewsList.find(r => r.id === currentUserRef.current.uid);
                setUserReview(own || null);
            }

            setLoading(false);
        };

        reviewsRef.on('value', reviewsCallback);
        listenersRef.current.push(() => reviewsRef.off('value', reviewsCallback));

        // Listen for aggregate rating
        const ratingsRef = db.ref(`ratings/${contentKey}`);
        const ratingsCallback = (snapshot) => {
            if (snapshot.exists()) {
                setAggregate(snapshot.val());
            } else {
                setAggregate(null);
            }
        };

        ratingsRef.on('value', ratingsCallback);
        listenersRef.current.push(() => ratingsRef.off('value', ratingsCallback));

        return () => {
            listenersRef.current.forEach(unsub => unsub());
            listenersRef.current = [];
        };
    }, [db, contentId, type, contentKey]);

    /**
     * Submit or update a review
     */
    const submitReview = useCallback(async ({ rating, text, nickname, avatarUrl }) => {
        if (!db || !currentUserRef.current || !contentId) return;
        if (!rating || rating < 1 || rating > 5) {
            setError('Please select a rating (1-5 stars)');
            return;
        }

        setSubmitting(true);
        setError(null);

        const uid = currentUserRef.current.uid;
        const reviewPath = `reviews/${contentKey}/${uid}`;
        const ratingPath = `ratings/${contentKey}`;

        try {
            // Check if user already has a review (for aggregate update)
            const existingSnapshot = await db.ref(reviewPath).once('value');
            const existingReview = existingSnapshot.val();

            // Write the review
            await db.ref(reviewPath).set({
                uid,
                nickname: nickname || 'Anonymous',
                avatarUrl: avatarUrl || '',
                rating,
                text: (text || '').trim().substring(0, 500),
                createdAt: existingReview?.createdAt || window.firebase.database.ServerValue.TIMESTAMP,
                updatedAt: window.firebase.database.ServerValue.TIMESTAMP,
                likes: existingReview?.likes || {}
            });

            // Update aggregate rating using transaction
            await db.ref(ratingPath).transaction((current) => {
                if (!current) {
                    return {
                        totalRating: rating,
                        reviewCount: 1,
                        distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, [rating]: 1 }
                    };
                }

                const dist = current.distribution || { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

                if (existingReview) {
                    // Update: subtract old rating, add new
                    const oldRating = existingReview.rating;
                    dist[oldRating] = Math.max(0, (dist[oldRating] || 0) - 1);
                    dist[rating] = (dist[rating] || 0) + 1;
                    return {
                        totalRating: (current.totalRating || 0) - oldRating + rating,
                        reviewCount: current.reviewCount || 1,
                        distribution: dist
                    };
                } else {
                    // New review
                    dist[rating] = (dist[rating] || 0) + 1;
                    return {
                        totalRating: (current.totalRating || 0) + rating,
                        reviewCount: (current.reviewCount || 0) + 1,
                        distribution: dist
                    };
                }
            });
        } catch (err) {
            console.error('Failed to submit review:', err);
            setError('Failed to submit review. Please try again.');
        } finally {
            setSubmitting(false);
        }
    }, [db, contentId, contentKey]);

    /**
     * Delete user's own review
     */
    const deleteReview = useCallback(async () => {
        if (!db || !currentUserRef.current || !contentId) return;

        const uid = currentUserRef.current.uid;
        const reviewPath = `reviews/${contentKey}/${uid}`;
        const ratingPath = `ratings/${contentKey}`;

        try {
            // Get existing review for aggregate update
            const snapshot = await db.ref(reviewPath).once('value');
            const existingReview = snapshot.val();
            if (!existingReview) return;

            // Remove review
            await db.ref(reviewPath).remove();

            // Update aggregate
            await db.ref(ratingPath).transaction((current) => {
                if (!current || current.reviewCount <= 1) {
                    return null; // Remove aggregate if last review
                }

                const dist = current.distribution || {};
                const oldRating = existingReview.rating;
                dist[oldRating] = Math.max(0, (dist[oldRating] || 0) - 1);

                return {
                    totalRating: Math.max(0, (current.totalRating || 0) - oldRating),
                    reviewCount: current.reviewCount - 1,
                    distribution: dist
                };
            });

            setUserReview(null);
        } catch (err) {
            console.error('Failed to delete review:', err);
            setError('Failed to delete review.');
        }
    }, [db, contentId, contentKey]);

    /**
     * Toggle like on a review
     */
    const toggleLike = useCallback(async (reviewUid) => {
        if (!db || !currentUserRef.current) return;

        const uid = currentUserRef.current.uid;
        const likePath = `reviews/${contentKey}/${reviewUid}/likes/${uid}`;

        try {
            const snapshot = await db.ref(likePath).once('value');
            if (snapshot.exists()) {
                await db.ref(likePath).remove();
            } else {
                await db.ref(likePath).set(true);
            }
        } catch (err) {
            console.error('Failed to toggle like:', err);
        }
    }, [db, contentKey]);

    /**
     * Get current user info (for pre-filling review form)
     */
    const getUserInfo = useCallback(async () => {
        if (!db || !currentUserRef.current) return null;

        try {
            const snapshot = await db.ref(`users/${currentUserRef.current.uid}`).once('value');
            if (snapshot.exists()) {
                return snapshot.val();
            }
            return null;
        } catch {
            return null;
        }
    }, [db]);

    /**
     * Save user profile (for users who haven't set up chat yet)
     */
    const saveUserProfile = useCallback(async (nickname, avatarUrl) => {
        if (!db || !currentUserRef.current) return false;

        try {
            await db.ref(`users/${currentUserRef.current.uid}`).set({
                uid: currentUserRef.current.uid,
                nickname: nickname.trim(),
                avatarUrl,
                isAdmin: false,
                joinedAt: window.firebase.database.ServerValue.TIMESTAMP
            });
            return true;
        } catch (err) {
            console.error('Failed to save profile:', err);
            return false;
        }
    }, [db]);

    // Computed values
    const averageRating = aggregate
        ? (aggregate.totalRating / aggregate.reviewCount).toFixed(1)
        : null;

    return {
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
        getUserInfo,
        saveUserProfile
    };
};

export default useReviews;
