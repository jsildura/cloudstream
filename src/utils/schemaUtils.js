/**
 * Schema.org Structured Data Utilities for StreamFlix
 * Generates JSON-LD schemas for movies, TV shows, and videos
 */

const SITE_URL = 'https://streamflix.stream';
const POSTER_BASE = 'https://image.tmdb.org/t/p/w500';
const BACKDROP_BASE = 'https://image.tmdb.org/t/p/w1280';

/**
 * Convert runtime in minutes to ISO 8601 duration format
 * @param {number} minutes - Runtime in minutes
 * @returns {string} ISO 8601 duration (e.g., "PT2H28M")
 */
const formatDuration = (minutes) => {
  if (!minutes || typeof minutes !== 'number') return null;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours > 0 && mins > 0) return `PT${hours}H${mins}M`;
  if (hours > 0) return `PT${hours}H`;
  if (mins > 0) return `PT${mins}M`;
  return null;
};

/**
 * Parse cast string into array of Person schema objects
 * @param {string} castString - Comma-separated cast names
 * @returns {Array} Array of Person schema objects
 */
const parseCastToActors = (castString) => {
  if (!castString || castString === 'N/A') return [];
  return castString.split(',').map(name => ({
    '@type': 'Person',
    name: name.trim()
  })).slice(0, 5); // Limit to top 5 actors
};

/**
 * Generate Movie schema from TMDB item data
 * @param {Object} item - Movie data from TMDB
 * @returns {Object} Movie JSON-LD schema
 */
export const generateMovieSchema = (item) => {
  if (!item || !item.id) return null;

  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Movie',
    name: item.title || item.name,
    description: item.overview || '',
    url: `${SITE_URL}/watch?type=movie&id=${item.id}`,
  };

  // Image
  if (item.poster_path) {
    schema.image = `${POSTER_BASE}${item.poster_path}`;
  }

  // Thumbnail
  if (item.backdrop_path) {
    schema.thumbnailUrl = `${BACKDROP_BASE}${item.backdrop_path}`;
  }

  // Release date
  if (item.release_date) {
    schema.datePublished = item.release_date;
  }

  // Duration
  const duration = formatDuration(item.runtime);
  if (duration) {
    schema.duration = duration;
  }

  // Genres
  if (item.genres && Array.isArray(item.genres) && item.genres.length > 0) {
    schema.genre = item.genres;
  }

  // Content rating
  if (item.contentRating) {
    schema.contentRating = item.contentRating;
  }

  // Aggregate rating
  if (item.vote_average && item.vote_count) {
    schema.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: item.vote_average.toFixed(1),
      bestRating: '10',
      worstRating: '1',
      ratingCount: item.vote_count
    };
  }

  // Cast/Actors
  const actors = parseCastToActors(item.cast);
  if (actors.length > 0) {
    schema.actor = actors;
  }

  // Watch action
  schema.potentialAction = {
    '@type': 'WatchAction',
    target: `${SITE_URL}/watch?type=movie&id=${item.id}`
  };

  return schema;
};

/**
 * Generate TVSeries schema from TMDB item data
 * @param {Object} item - TV show data from TMDB
 * @returns {Object} TVSeries JSON-LD schema
 */
export const generateTVSeriesSchema = (item) => {
  if (!item || !item.id) return null;

  const schema = {
    '@context': 'https://schema.org',
    '@type': 'TVSeries',
    name: item.title || item.name,
    description: item.overview || '',
    url: `${SITE_URL}/watch?type=tv&id=${item.id}`,
  };

  // Image
  if (item.poster_path) {
    schema.image = `${POSTER_BASE}${item.poster_path}`;
  }

  // Thumbnail
  if (item.backdrop_path) {
    schema.thumbnailUrl = `${BACKDROP_BASE}${item.backdrop_path}`;
  }

  // First air date
  if (item.first_air_date) {
    schema.datePublished = item.first_air_date;
  }

  // Genres
  if (item.genres && Array.isArray(item.genres) && item.genres.length > 0) {
    schema.genre = item.genres;
  }

  // Content rating
  if (item.contentRating) {
    schema.contentRating = item.contentRating;
  }

  // Aggregate rating
  if (item.vote_average && item.vote_count) {
    schema.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: item.vote_average.toFixed(1),
      bestRating: '10',
      worstRating: '1',
      ratingCount: item.vote_count
    };
  }

  // Cast/Actors
  const actors = parseCastToActors(item.cast);
  if (actors.length > 0) {
    schema.actor = actors;
  }

  // Number of seasons (if available)
  if (item.number_of_seasons) {
    schema.numberOfSeasons = item.number_of_seasons;
  }

  // Number of episodes (if available)
  if (item.number_of_episodes) {
    schema.numberOfEpisodes = item.number_of_episodes;
  }

  // Watch action
  schema.potentialAction = {
    '@type': 'WatchAction',
    target: `${SITE_URL}/watch?type=tv&id=${item.id}`
  };

  return schema;
};

/**
 * Generate VideoObject schema for watch pages
 * @param {Object} item - Content data from TMDB
 * @param {string} type - 'movie' or 'tv'
 * @param {number} season - Season number (for TV)
 * @param {number} episode - Episode number (for TV)
 * @returns {Object} VideoObject JSON-LD schema
 */
export const generateVideoObjectSchema = (item, type, season = null, episode = null) => {
  if (!item || !item.id) return null;

  // Build watch URL
  let watchUrl = `${SITE_URL}/watch?type=${type}&id=${item.id}`;
  if (type === 'tv' && season && episode) {
    watchUrl += `&season=${season}&episode=${episode}`;
  }

  const schema = {
    '@context': 'https://schema.org',
    '@type': 'VideoObject',
    name: item.title || item.name,
    description: item.overview || '',
    url: watchUrl,
    embedUrl: watchUrl,
  };

  // Thumbnail
  if (item.backdrop_path) {
    schema.thumbnailUrl = `${BACKDROP_BASE}${item.backdrop_path}`;
  } else if (item.poster_path) {
    schema.thumbnailUrl = `${POSTER_BASE}${item.poster_path}`;
  }

  // Upload/publish date
  const dateField = type === 'movie' ? item.release_date : item.first_air_date;
  if (dateField) {
    schema.uploadDate = dateField;
  }

  // Duration (for movies)
  if (type === 'movie') {
    const duration = formatDuration(item.runtime);
    if (duration) {
      schema.duration = duration;
    }
  }

  // Content rating
  if (item.contentRating) {
    schema.contentRating = item.contentRating;
  }

  // Watch action
  schema.potentialAction = {
    '@type': 'WatchAction',
    target: watchUrl
  };

  return schema;
};

/**
 * Generate BreadcrumbList schema for navigation
 * @param {Array} items - Array of {name, url} objects
 * @returns {Object} BreadcrumbList JSON-LD schema
 */
export const generateBreadcrumbSchema = (items) => {
  if (!items || !Array.isArray(items) || items.length === 0) return null;

  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url.startsWith('http') ? item.url : `${SITE_URL}${item.url}`
    }))
  };
};
