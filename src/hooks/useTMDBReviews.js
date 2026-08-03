/**
 * useTMDBReviews — fetches real audience reviews from TMDB.
 *
 * Endpoint: /movie/{id}/reviews  or  /tv/{id}/reviews
 * Proxied locally via vite.config.js  /api → https://api.themoviedb.org/3
 */
import { useState, useEffect } from 'react';

const TMDB_AVATAR_BASE = 'https://image.tmdb.org/t/p/w64_and_h64_face';
const GRAVATAR_BASE = 'https://secure.gravatar.com/avatar/';

/**
 * Resolve an authorDetails.avatar_path to a usable URL.
 * TMDB sometimes embeds a full Gravatar URL with a leading slash.
 */
export const resolveAvatar = (avatarPath) => {
    if (!avatarPath) return null;
    // Gravatar paths start with /https://  — strip the leading slash
    if (avatarPath.startsWith('/https://') || avatarPath.startsWith('/http://')) {
        return avatarPath.slice(1);
    }
    // Gravatar hash paths start with /
    if (avatarPath.startsWith('/')) {
        const hash = avatarPath.slice(1);
        return `${GRAVATAR_BASE}${hash}?s=64&d=retro`;
    }
    return `${TMDB_AVATAR_BASE}${avatarPath}`;
};

const useTMDBReviews = (contentId, type = 'movie') => {
    const [reviews, setReviews] = useState([]);
    const [totalResults, setTotalResults] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!contentId) {
            setLoading(false);
            return;
        }

        let cancelled = false;
        setLoading(true);
        setError(null);

        (async () => {
            try {
                const res = await fetch(`/api/${type}/${contentId}/reviews?language=en-US&page=1`);
                if (!res.ok) throw new Error(`TMDB reviews fetch failed: ${res.status}`);
                const data = await res.json();
                if (cancelled) return;

                const normalized = (data.results || []).map((r) => ({
                    id: r.id,
                    author: r.author,
                    username: r.author_details?.username || r.author,
                    avatarUrl: resolveAvatar(r.author_details?.avatar_path),
                    // TMDB rating is out of 10; convert to 5-star scale
                    rating: r.author_details?.rating != null
                        ? Math.round((r.author_details.rating / 2) * 2) / 2 // round to nearest 0.5
                        : null,
                    ratingOutOf10: r.author_details?.rating ?? null,
                    content: r.content || '',
                    createdAt: r.created_at,
                    url: r.url,
                }));

                setReviews(normalized);
                setTotalResults(data.total_results ?? normalized.length);
            } catch (err) {
                if (!cancelled) setError('Could not load reviews.');
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();

        return () => { cancelled = true; };
    }, [contentId, type]);

    return { reviews, totalResults, loading, error };
};

export default useTMDBReviews;
