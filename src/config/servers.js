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
        hasAds: false,
        pattern: 'default',
        // Some titles resolve to an HEVC-only ladder here — audio plays, the
        // picture stays blank on browsers that can't decode it.
        mayRequireHevc: true,
    },
    {
        name: 'Server 2',
        description: 'Reliable Server',
        baseUrl: 'https://api.cineby.homes/embed/',
        suffix: '',
        isRecommended: true,
        sandboxSupport: false,
        hasAds: false,
        pattern: 'default',
    },
    {
        name: 'Server 3',
        description: 'Reliable Server',
        baseUrl: 'https://anyembed.xyz/embed/',
        suffix: '',
        isRecommended: true,
        sandboxSupport: true,
        hasAds: false,
        pattern: 'anyembed',
    },
    {
        name: 'Server 4',
        description: 'Reliable Server',
        baseUrl: 'https://vaplayer.ru/embed/',
        suffix: '',
        isRecommended: true,
        sandboxSupport: false,
        hasAds: false,
        pattern: 'default',
    },
    {
        name: 'Server 5',
        description: 'Reliable Server',
        baseUrl: 'https://www.vidking.net/embed/',
        suffix: '?autoPlay=true',
        isRecommended: true,
        sandboxSupport: false,
        hasAds: false,
        pattern: 'default',
    },
    {
        name: 'Server 6',
        description: 'Reliable Server',
        baseUrl: 'https://web.nxsha.app/embed/',
        suffix: '',
        isRecommended: true,
        sandboxSupport: true,
        hasAds: true,
        pattern: 'default',
    },
    {
        name: 'Server 7',
        description: 'Reliable Server',
        baseUrl: 'https://vidsync.xyz/embed/',
        suffix: '',
        isRecommended: true,
        sandboxSupport: false,
        hasAds: true,
        pattern: 'default',
    },
    {
        name: 'Server 8',
        description: 'Reliable Server',
        baseUrl: 'https://mapple.uk/watch/',
        suffix: '',
        isRecommended: true,
        sandboxSupport: false,
        hasAds: true,
        pattern: 'default',
    },
    {
        name: 'Server 9',
        description: 'Backup Server',
        baseUrl: 'https://vidsrc-embed.ru/embed/',
        suffix: '',
        isRecommended: false,
        sandboxSupport: false,
        hasAds: false,
        pattern: 'vidsrc-xyz',
    },
    {
        name: 'Server 10',
        description: 'Backup Server',
        baseUrl: 'https://primesrc.me/embed/',
        suffix: '',
        isRecommended: false,
        sandboxSupport: false,
        hasAds: true,
        pattern: 'primesrc',
    },
    {
        name: 'Server 11',
        description: 'Backup Server',
        baseUrl: 'https://vidlink.pro/',
        suffix: '',
        isRecommended: false,
        sandboxSupport: false,
        hasAds: true,
        pattern: 'default',
    },
    {
        name: 'Server 12',
        description: 'Backup Server',
        baseUrl: 'https://vidfast.pro/',
        suffix: '?autoplay=true&autoNext=true',
        isRecommended: false,
        sandboxSupport: false,
        hasAds: true,
        pattern: 'default',
    },
    {
        name: 'Server 13',
        description: 'Backup Server',
        baseUrl: 'https://vixsrc.to/',
        suffix: '',
        isRecommended: false,
        sandboxSupport: false,
        hasAds: true,
        pattern: 'default',
    },
    {
        name: 'Server 14',
        description: 'Backup Server',
        baseUrl: 'https://player.videasy.net/',
        suffix: '',
        isRecommended: false,
        sandboxSupport: false,
        hasAds: true,
        pattern: 'default',
    },
    {
        name: 'Server 15',
        description: 'Backup Server',
        baseUrl: 'https://www.zxcstream.xyz/embed/',
        suffix: '?autoPlay=true',
        isRecommended: false,
        sandboxSupport: false,
        hasAds: false,
        pattern: 'default',
    },
    {
        name: 'Server 16',
        description: 'Backup Server',
        baseUrl: 'https://vidfast.vc/',
        suffix: '',
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
        baseUrl: 'https://vidsrc.to/embed/',
        suffix: '?autoPlay=1',
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

        case 'default':
        default:
            // Standard: {base}{type}/{id}{tvPath}{suffix}
            return `${baseUrl}${type}/${id}${tvPath}${suffix}`;
    }
}

/**
 * Whether a server index exists and is currently offered to viewers.
 * @param {number} index - Index into serverConfig
 * @returns {boolean}
 */
export function isServerEnabled(index) {
    const server = serverConfig[index];
    return Boolean(server) && !server.disabled;
}

/**
 * Index of the first server still offered to viewers. Used as the default
 * pick when nothing is saved, or when a saved pick points at a disabled one.
 * @returns {number}
 */
export function getFirstEnabledServerIndex() {
    const index = serverConfig.findIndex(server => !server.disabled);
    return index === -1 ? 0 : index;
}

/**
 * Gets the total number of configured servers.
 * @returns {number}
 */
export function getServerCount() {
    return serverConfig.length;
}
