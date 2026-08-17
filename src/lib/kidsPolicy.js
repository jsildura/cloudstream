/**
 * Streamflix Kids Rating Policy
 * 
 * Strict US-only rating inspection:
 * - Movies: G, PG
 * - TV: TV-Y, TV-Y7, TV-Y7-FV, TV-G, TV-PG
 * - International-only, missing, unrated, or unapproved ratings are strictly rejected.
 */

export const ALLOWED_KIDS_MOVIE_RATINGS = Object.freeze(['G', 'PG']);
export const ALLOWED_KIDS_TV_RATINGS = Object.freeze(['TV-Y', 'TV-Y7', 'TV-Y7-FV', 'TV-G', 'TV-PG']);

/**
 * Extracts strictly US movie certification from TMDB release_dates response.
 * Never falls back to international releases.
 * 
 * @param {Object} releaseDatesPayload - TMDB /movie/{id}/release_dates response
 * @returns {string | null} Uppercase US certification or null
 */
export function extractUsMovieCertification(releaseDatesPayload) {
  if (!releaseDatesPayload || !Array.isArray(releaseDatesPayload.results)) {
    return null;
  }

  const usEntry = releaseDatesPayload.results.find(
    (entry) => entry && (entry.iso_3166_1 === 'US' || entry.country === 'US')
  );

  if (!usEntry || !Array.isArray(usEntry.release_dates)) {
    return null;
  }

  for (const release of usEntry.release_dates) {
    if (release && typeof release.certification === 'string') {
      const cert = release.certification.trim().toUpperCase();
      if (cert.length > 0) {
        return cert;
      }
    }
  }

  return null;
}

/**
 * Extracts strictly US TV content rating from TMDB content_ratings response.
 * Never falls back to international ratings.
 * 
 * @param {Object} contentRatingsPayload - TMDB /tv/{id}/content_ratings response
 * @returns {string | null} Uppercase US content rating or null
 */
export function extractUsTvRating(contentRatingsPayload) {
  if (!contentRatingsPayload || !Array.isArray(contentRatingsPayload.results)) {
    return null;
  }

  const usEntry = contentRatingsPayload.results.find(
    (entry) => entry && (entry.iso_3166_1 === 'US' || entry.country === 'US')
  );

  if (!usEntry || typeof usEntry.rating !== 'string') {
    return null;
  }

  const rating = usEntry.rating.trim().toUpperCase();
  return rating.length > 0 ? rating : null;
}

/**
 * Checks if a movie certification meets Kids policy (G, PG).
 * @param {string | null | undefined} cert
 * @returns {boolean}
 */
export function isMovieRatingAllowed(cert) {
  if (typeof cert !== 'string') return false;
  const normalized = cert.trim().toUpperCase();
  return ALLOWED_KIDS_MOVIE_RATINGS.includes(normalized);
}

/**
 * Checks if a TV rating meets Kids policy (TV-Y, TV-Y7, TV-Y7-FV, TV-G, TV-PG).
 * @param {string | null | undefined} rating
 * @returns {boolean}
 */
export function isTvRatingAllowed(rating) {
  if (typeof rating !== 'string') return false;
  const normalized = rating.trim().toUpperCase();
  return ALLOWED_KIDS_TV_RATINGS.includes(normalized);
}

/**
 * Checks if a rating is approved for Kids mode based on media type.
 * @param {'movie' | 'tv' | string} type
 * @param {string | null | undefined} rating
 * @returns {boolean}
 */
export function isRatingApproved(type, rating) {
  if (!type || !rating) return false;
  const normType = type.toLowerCase();
  if (normType === 'movie') {
    return isMovieRatingAllowed(rating);
  }
  if (normType === 'tv') {
    return isTvRatingAllowed(rating);
  }
  return false;
}
