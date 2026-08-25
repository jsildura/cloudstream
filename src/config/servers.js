/**
 * Server Configuration for StreamFlix Video Player
 * 
 * This file contains all streaming server configurations.
 * To add, remove, or modify servers, edit the serverConfig array below.
 *
 * Set `disabled: true` on an entry to hide it from the server picker without
 * removing it. Entries stay in the array so the indices persisted in
 * localStorage (`server-<tmdbId>`) keep pointing at the same server.
 *
 * Set `isAdsFree: true` on an entry to restrict it to signed-in users with
 * an active Ad-Free entitlement.
 *
 * Set `mayRequireHevc: true` on an entry whose embed serves an HEVC/H.265-only
 * quality ladder for some titles. Browsers without an HEVC decoder get every
 * video rendition filtered out by the embed's own player and play audio with a
 * blank picture, so the Watch page warns before that happens.
 *
 * URL PATTERNS:
 * - 'default'    : {baseUrl}{type}/{id}/{season}/{episode}{suffix}
 * - 'movie-only' : {baseUrl}{id}{suffix} (returns null for TV)
 * - 'query-id'   : {baseUrl}{id}{suffix} (returns null for TV)
 * - 'tmdb-prefix': {baseUrl}{id}{suffix} (returns null for TV)
 * - 'primesrc'   : {baseUrl}{type}?tmdb={id}&season={s}&episode={e}
 * - 'vidsrc-xyz' : movie/{id} or tv?tmdb={id}&season={s}&episode={e}
 * - 'ythd'       : {baseUrl}{id}/ for movie, {baseUrl}{id}/{season}-{episode}/ for TV
 * - 'cinesrc'    : {baseUrl}movie/{id} for movie, {baseUrl}tv/{id}?s={s}&e={e} for TV
 */

export const serverConfig = [
    {
        name: 'Direct Play',
        description: 'StreamFlix Default',
        baseUrl: 'https://zxcstream.xyz/player/',
        suffix: '/en?autoplay=true',
        isRecommended: true,
        sandboxSupport: false,
        hasAds: false,
        pattern: 'default',
        directPlayer: true,
        // Temporarily hidden: the direct resolver keeps breaking. Remove this
        // line (or set it to false) to bring Direct Play back.
        disabled: true,
    },
    {
        name: 'Server 1',
        description: 'Server 1',
        baseUrl: 'https://zxcstream.xyz/player/',
        suffix: '/en?autoplay=true',
        isRecommended: true,
        sandboxSupport: false,
        hasAds: true,
        pattern: 'default',
        // Some titles resolve to an HEVC-only ladder here — audio plays, the
        // picture stays blank on browsers that can't decode it.
        mayRequireHevc: true,
    },
    {
        name: 'Server 2',
        description: 'Backup Server',
        baseUrl: 'https://cinesrc.st/embed/',
        suffix: '?autoplay=true&autonext=true',
        isRecommended: true,
        sandboxSupport: true,
        hasAds: false,
        pattern: 'cinesrc',
    },
    {
        name: 'Server 3',
        description: 'Backup Server',
        baseUrl: 'https://1embed.cc/embed/',
        suffix: '?autoplay=1',
        isRecommended: true,
        sandboxSupport: false,
        hasAds: true,
        pattern: 'default',
    },

    {
        name: 'Server 4',
        description: 'Reliable Server',
        baseUrl: 'https://www.vidking.net/embed/',
        suffix: '?autoPlay=true',
        isRecommended: true,
        sandboxSupport: false,
        hasAds: true,
        pattern: 'default',
    },
    {
        name: 'Server 5',
        description: 'Reliable Server',
        baseUrl: 'https://mapple.uk/watch/',
        suffix: '',
        isRecommended: true,
        sandboxSupport: false,
        hasAds: true,
        pattern: 'default',
    },
    {
        name: 'Server 6',
        description: 'Backup Server',
        baseUrl: 'https://embed.filmu.in/embed/',
        suffix: '',
        isRecommended: true,
        sandboxSupport: false,
        hasAds: true,
        pattern: 'default',
    },
    {
        name: 'Server 7',
        description: 'Premium Server',
        baseUrl: 'https://api.cineby.homes/embed/',
        suffix: '',
        isAdsFree: true,
        isRecommended: true,
        sandboxSupport: false,
        hasAds: false,
        pattern: 'default',
    },
    {
        name: 'Server 8',
        description: 'Premium Server',
        baseUrl: 'https://ythd.org/embed/',
        suffix: '',
        isAdsFree: true,
        isRecommended: true,
        sandboxSupport: false,
        hasAds: false,
        pattern: 'ythd',
    },
    {
        name: 'Server 9',
        description: 'Premium Server',
        baseUrl: 'https://vaplayer.ru/embed/',
        suffix: '?autoplay=1&skin=cinematic&allowfullscreen=true',
        isAdsFree: true,
        isRecommended: true,
        sandboxSupport: false,
        hasAds: false,
        pattern: 'default',
    },
    {
        name: 'Server 10',
        description: 'Premium Server',
        baseUrl: 'https://web.nxsha.app/embed/',
        suffix: '',
        isAdsFree: true,
        isRecommended: true,
        sandboxSupport: true,
        hasAds: false,
        pattern: 'default',
    },

    {
        name: 'Server 11',
        description: 'Premium Server',
        baseUrl: 'https://player.videasy.net/',
        suffix: '',
        isAdsFree: true,
        isRecommended: true,
        sandboxSupport: false,
        hasAds: true,
        pattern: 'default',
    },
    {
        name: 'Server 12',
        description: 'Premium Server',
        baseUrl: 'https://player.vidlove.cc/embed/',
        suffix: '?autoplay=true&poster=true&chromecast=true&servericon=true&setting=true&pip=true&font=Roboto&fontcolor=ffffff&fontsize=20&opacity=0.5&secondarycolor=ffffff&server=Dark',
        isAdsFree: true,
        isRecommended: true,
        sandboxSupport: false,
        hasAds: true,
        pattern: 'default',
    },
    {
        name: 'Server 13',
        description: 'Premium Server',
        baseUrl: 'https://player.cinezo.live/embed/',
        suffix: '?autoplay=true&poster=true&chromecast=true&servericon=true&setting=true&pip=true&font=Roboto&fontcolor=6f63ff&fontsize=20&opacity=0.5&primarycolor=e8b86d&secondarycolor=0a0a12&iconcolor=ffffff',
        isAdsFree: true,
        isRecommended: true,
        sandboxSupport: false,
        hasAds: true,
        pattern: 'default',
    },
    {
        name: 'Server 14',
        description: 'Backup Server',
        baseUrl: 'https://vidsrc-embed.ru/embed/',
        suffix: '',
        isRecommended: false,
        sandboxSupport: false,
        hasAds: true,
        pattern: 'vidsrc-xyz',
    },
    {
        name: 'Server 15',
        description: 'Backup Server',
        baseUrl: 'https://primesrc.me/embed/',
        suffix: '',
        isRecommended: false,
        sandboxSupport: false,
        hasAds: true,
        pattern: 'primesrc',
    },
    {
        name: 'Server 16',
        description: 'Backup Server',
        baseUrl: 'https://vidfast.pro/',
        suffix: '?autoplay=true&autoNext=true',
        isRecommended: false,
        sandboxSupport: false,
        hasAds: true,
        pattern: 'default',
    },
    {
        name: 'Server 17',
        description: 'Backup Server',
        baseUrl: 'https://vidnest.fun/',
        suffix: '',
        isRecommended: false,
        sandboxSupport: false,
        hasAds: true,
        pattern: 'default',
    },
    {
        name: 'Server 18',
        description: 'Backup Server',
        baseUrl: 'https://embedmaster.link/',
        suffix: '',
        isRecommended: false,
        sandboxSupport: false,
        hasAds: true,
        pattern: 'default',
    }
];

/**
 * Builds the streaming URL for a given server configuration.
 * 
 * @param {Object} server - Server configuration object from serverConfig
 * @param {string} type - Content type: 'movie' or 'tv'
 * @param {string|number} id - TMDB ID of the content
 * @param {number} season - Season number (for TV shows)
 * @param {number} episode - Episode number (for TV shows)
 * @returns {string|null} The constructed URL, or null if server doesn't support the content type
 */
export function buildServerUrl(server, type, id, season, episode) {
    const { baseUrl, suffix, pattern } = server;
    const tvPath = type === 'tv' ? `/${season}/${episode}` : '';

    switch (pattern) {
        case 'movie-only':
            // e.g., /embed/movie/{id}
            return type === 'movie' ? `${baseUrl}${id}${suffix}` : null;

        case 'query-id':
            // e.g., ?id={id}
            return type === 'movie' ? `${baseUrl}${id}${suffix}` : null;

        case 'tmdb-prefix':
            // e.g., tmdb-movie-{id}
            return type === 'movie' ? `${baseUrl}${id}${suffix}` : null;

        case 'primesrc':
            // e.g., {base}{type}?tmdb={id}&season={s}&episode={e}
            if (type === 'tv') {
                return `${baseUrl}${type}?tmdb=${id}&season=${season}&episode=${episode}`;
            }
            return `${baseUrl}${type}?tmdb=${id}`;

        case 'anyembed':
            // e.g., tmdb-movie-{id} or tmdb-tv-{id}-{season}-{episode}
            if (type === 'tv') {
                return `${baseUrl}tmdb-tv-${id}-${season}-${episode}${suffix}`;
            }
            return `${baseUrl}tmdb-movie-${id}${suffix}`;

        case 'vidsrc-xyz':
            // movie/{id} or tv?tmdb={id}&season=&episode=
            if (type === 'tv') {
                return `${baseUrl}tv?tmdb=${id}&season=${season}&episode=${episode}`;
            }
            return `${baseUrl}movie/${id}`;

        case 'ythd':
            // e.g., {baseUrl}{id}/ for movie, {baseUrl}{id}/{season}-{episode}/ for TV
            if (type === 'tv') {
                return `${baseUrl}${id}/${season}-${episode}/${suffix}`;
            }
            return `${baseUrl}${id}/${suffix}`;

        case 'cinesrc':
            // movie/{id} or tv/{id}?s={season}&e={episode}
            if (type === 'tv') {
                const extra = suffix ? (suffix.startsWith('?') ? '&' + suffix.slice(1) : (suffix.startsWith('&') ? suffix : '&' + suffix)) : '';
                return `${baseUrl}tv/${id}?s=${season}&e=${episode}${extra}`;
            }
            return `${baseUrl}movie/${id}${suffix}`;

        case 'default':
        default:
            // Standard: {base}{type}/{id}{tvPath}{suffix}
            return `${baseUrl}${type}/${id}${tvPath}${suffix}`;
    }
}

/**
 * Whether a server index exists and is currently offered to viewers.
 * When isAdFree is false, servers flagged with isAdsFree: true (or Premium Server) are not offered.
 * @param {number} index - Index into serverConfig
 * @param {boolean} [isAdFree=false] - Whether the viewer has an active ad-free entitlement
 * @returns {boolean}
 */
export function isServerEnabled(index, isAdFree = false) {
    const server = serverConfig[index];
    if (!server || server.disabled) return false;
    if ((server.isAdsFree || server.description === 'Premium Server') && !isAdFree) return false;
    return true;
}

/**
 * Index of the first server still offered to viewers. Used as the default
 * pick when nothing is saved, or when a saved pick points at a disabled/inaccessible one.
 * @param {boolean} [isAdFree=false] - Whether the viewer has an active ad-free entitlement
 * @returns {number}
 */
export function getFirstEnabledServerIndex(isAdFree = false) {
    const index = serverConfig.findIndex(server => !server.disabled && (!server.isAdsFree && server.description !== 'Premium Server' || isAdFree));
    return index === -1 ? 0 : index;
}

/**
 * Gets the total number of configured servers.
 * @returns {number}
 */
export function getServerCount() {
    return serverConfig.length;
}
