/**
 * Meta Tag Utilities for StreamFlix
 * Provides functions to dynamically update document head meta tags
 */

const SITE_NAME = 'StreamFlix';
const DEFAULT_TITLE = 'StreamFlix - Watch Movies & TV Shows Online | Free Streaming';
const DEFAULT_DESCRIPTION = 'StreamFlix - Your favorite destination for movies and TV shows. Stream the latest blockbusters, popular TV series, and anime all in one place.';
const DEFAULT_IMAGE = 'https://streamflix.stream/img/landingpage.webp';
const SITE_URL = 'https://streamflix.stream';
const POSTER_BASE = 'https://image.tmdb.org/t/p/w500';
const BACKDROP_BASE = 'https://image.tmdb.org/t/p/w1280';

/**
 * Update or create a meta tag
 * @param {string} nameOrProperty - The name or property attribute value
 * @param {string} content - The content value
 * @param {boolean} isProperty - If true, uses property attribute (for OG/Twitter), else uses name
 */
export const setMetaTag = (nameOrProperty, content, isProperty = false) => {
    if (!content) return;

    const attribute = isProperty ? 'property' : 'name';
    let element = document.querySelector(`meta[${attribute}="${nameOrProperty}"]`);

    if (element) {
        element.setAttribute('content', content);
    } else {
        element = document.createElement('meta');
        element.setAttribute(attribute, nameOrProperty);
        element.setAttribute('content', content);
        document.head.appendChild(element);
    }
};

/**
 * Update the document title
 * @param {string} title - The new title
 */
export const setDocumentTitle = (title) => {
    document.title = title || DEFAULT_TITLE;
};

/**
 * Update the canonical URL
 * @param {string} url - The canonical URL
 */
export const setCanonicalUrl = (url) => {
    let canonical = document.querySelector('link[rel="canonical"]');
    if (canonical) {
        canonical.setAttribute('href', url);
    }
};

/**
 * Set all meta tags for a page
 * @param {Object} options - Meta tag options
 * @param {string} options.title - Page title
 * @param {string} options.description - Page description
 * @param {string} options.image - OG/Twitter image URL
 * @param {string} options.url - Canonical/OG URL
 * @param {string} options.type - OG type (website, video.movie, video.tv_show)
 */
export const setPageMeta = ({ title, description, image, url, type = 'website' }) => {
    // Update document title
    setDocumentTitle(title);

    // Update meta description
    setMetaTag('description', description);

    // Update Open Graph tags
    setMetaTag('og:title', title, true);
    setMetaTag('og:description', description, true);
    setMetaTag('og:image', image || DEFAULT_IMAGE, true);
    setMetaTag('og:url', url || SITE_URL, true);
    setMetaTag('og:type', type, true);
    setMetaTag('og:site_name', SITE_NAME, true);

    // Update Twitter Card tags
    setMetaTag('twitter:title', title, true);
    setMetaTag('twitter:description', description, true);
    setMetaTag('twitter:image', image || DEFAULT_IMAGE, true);

    // Update canonical URL if provided
    if (url) {
        setCanonicalUrl(url);
    }
};

/**
 * Reset meta tags to default values
 */
export const resetToDefaultMeta = () => {
    setPageMeta({
        title: DEFAULT_TITLE,
        description: DEFAULT_DESCRIPTION,
        image: DEFAULT_IMAGE,
        url: SITE_URL,
        type: 'website'
    });
};

/**
 * Generate meta tags for movie/TV content
 * @param {Object} item - Content data from TMDB
 * @param {string} type - 'movie' or 'tv'
 * @param {number} season - Season number (for TV)
 * @param {number} episode - Episode number (for TV)
 * @returns {Object} Meta tag configuration
 */
export const generateContentMeta = (item, type, season = null, episode = null) => {
    if (!item) {
        return {
            title: DEFAULT_TITLE,
            description: DEFAULT_DESCRIPTION,
            image: DEFAULT_IMAGE,
            url: SITE_URL
        };
    }

    const name = item.title || item.name || 'Unknown';
    const year = (item.release_date || item.first_air_date || '').substring(0, 4);

    // Build title based on content type
    let title;
    if (type === 'tv' && season && episode) {
        title = `${name} S${season} E${episode} | Watch Free on ${SITE_NAME}`;
    } else if (year) {
        title = `${name} (${year}) | Watch Free on ${SITE_NAME}`;
    } else {
        title = `${name} | Watch Free on ${SITE_NAME}`;
    }

    // Truncate description to ~155 characters for SEO
    let description = item.overview || `Watch ${name} for free on ${SITE_NAME}`;
    if (description.length > 155) {
        description = description.substring(0, 152) + '...';
    }

    // Use backdrop for OG image (better aspect ratio for social sharing)
    const image = item.backdrop_path
        ? `${BACKDROP_BASE}${item.backdrop_path}`
        : item.poster_path
            ? `${POSTER_BASE}${item.poster_path}`
            : DEFAULT_IMAGE;

    // Build URL
    let url = `${SITE_URL}/watch?type=${type}&id=${item.id}`;
    if (type === 'tv' && season && episode) {
        url += `&season=${season}&episode=${episode}`;
    }

    return {
        title,
        description,
        image,
        url,
        type: type === 'movie' ? 'video.movie' : 'video.tv_show'
    };
};

// Export defaults for use elsewhere
export { DEFAULT_TITLE, DEFAULT_DESCRIPTION, DEFAULT_IMAGE, SITE_URL, SITE_NAME };
