/**
 * Music API Configuration
 * 
 * Ported from tidal-ui/src/lib/config.ts
 * Provides:
 * - API endpoint targets with weighted load balancing
 * - Region-based target selection
 * - CORS-handling fetch wrapper
 * - Proxy URL generation
 */

const APP_VERSION = '1.0.0';

// V2 API Targets with weights for load distribution
const V2_API_TARGETS = [
    {
        name: 'squid-api',
        baseUrl: 'https://triton.squid.wtf',
        weight: 30,
        requiresProxy: false,
        category: 'auto-only'
    },
    {
        name: 'spotisaver-1',
        baseUrl: 'https://hifi-one.spotisaver.net',
        weight: 20,
        requiresProxy: false,
        category: 'auto-only'
    },
    {
        name: 'spotisaver-2',
        baseUrl: 'https://hifi-two.spotisaver.net',
        weight: 20,
        requiresProxy: false,
        category: 'auto-only'
    },
    {
        name: 'kinoplus',
        baseUrl: 'https://tidal.kinoplus.online',
        weight: 20,
        requiresProxy: false,
        category: 'auto-only'
    },
    {
        name: 'binimum',
        baseUrl: 'https://tidal-api.binimum.org',
        weight: 10,
        requiresProxy: false,
        category: 'auto-only'
    },
    {
        name: 'hund',
        baseUrl: 'https://hund.qqdl.site',
        weight: 15,
        requiresProxy: false,
        category: 'auto-only'
    },
    {
        name: 'katze',
        baseUrl: 'https://katze.qqdl.site',
        weight: 15,
        requiresProxy: false,
        category: 'auto-only'
    },
    {
        name: 'maus',
        baseUrl: 'https://maus.qqdl.site',
        weight: 15,
        requiresProxy: false,
        category: 'auto-only'
    },
    {
        name: 'vogel',
        baseUrl: 'https://vogel.qqdl.site',
        weight: 15,
        requiresProxy: false,
        category: 'auto-only'
    },
    {
        name: 'wolf',
        baseUrl: 'https://wolf.qqdl.site',
        weight: 15,
        requiresProxy: false,
        category: 'auto-only'
    }
];

const ALL_API_TARGETS = [...V2_API_TARGETS];
const US_API_TARGETS = [];

const TARGET_COLLECTIONS = {
    auto: [...ALL_API_TARGETS],
    eu: [],
    us: [...US_API_TARGETS]
};

const TARGETS = TARGET_COLLECTIONS.auto;

/**
 * API Configuration
 */
export const API_CONFIG = {
    targets: TARGETS,
    baseUrl: TARGETS[0]?.baseUrl ?? 'https://tidal.401658.xyz',
    useProxy: true,
    proxyUrl: '/api/proxy'
};

// Cached weighted targets
let v1WeightedTargets = null;
let v2WeightedTargets = null;

/**
 * Build weighted targets array with cumulative weights
 */
function buildWeightedTargets(targets) {
    const validTargets = targets.filter((target) => {
        if (!target?.baseUrl || typeof target.baseUrl !== 'string') {
            return false;
        }
        if (target.weight <= 0) {
            return false;
        }
        try {
            new URL(target.baseUrl);
            return true;
        } catch (error) {
            console.error(`Invalid API target URL for ${target.name}:`, error);
            return false;
        }
    });

    if (validTargets.length === 0) {
        throw new Error('No valid API targets configured');
    }

    let cumulative = 0;
    const collected = [];
    for (const target of validTargets) {
        cumulative += target.weight;
        collected.push({ ...target, cumulativeWeight: cumulative });
    }
    return collected;
}

/**
 * Get or create weighted targets cache
 */
function ensureWeightedTargets(apiVersion = 'v2') {
    if (apiVersion === 'v2') {
        if (!v2WeightedTargets) {
            v2WeightedTargets = buildWeightedTargets(V2_API_TARGETS);
        }
        return v2WeightedTargets;
    } else {
        if (!v1WeightedTargets) {
            const v2Fallback = V2_API_TARGETS.map((t) => ({ ...t, weight: 1 }));
            v1WeightedTargets = buildWeightedTargets([...ALL_API_TARGETS, ...v2Fallback]);
        }
        return v1WeightedTargets;
    }
}

/**
 * Select a random target based on weights
 */
function selectFromWeightedTargets(weighted) {
    if (weighted.length === 0) {
        throw new Error('No weighted targets available for selection');
    }

    const totalWeight = weighted[weighted.length - 1]?.cumulativeWeight ?? 0;
    if (totalWeight <= 0) {
        return weighted[0];
    }

    const random = Math.random() * totalWeight;
    for (const target of weighted) {
        if (random < target.cumulativeWeight) {
            return target;
        }
    }

    return weighted[0];
}

/**
 * Select an API target using weighted random selection
 */
export function selectApiTarget(apiVersion = 'v2') {
    const targets = ensureWeightedTargets(apiVersion);
    return selectFromWeightedTargets(targets);
}

/**
 * Get the primary (first) target
 */
export function getPrimaryTarget(apiVersion = 'v2') {
    return ensureWeightedTargets(apiVersion)[0];
}

/**
 * Get targets for a specific region
 */
export function getTargetsForRegion(region = 'auto') {
    const targets = TARGET_COLLECTIONS[region];
    return Array.isArray(targets) ? targets : [];
}

/**
 * Select a target for a specific region
 */
export function selectApiTargetForRegion(region) {
    if (region === 'auto') {
        return selectApiTarget();
    }

    const targets = getTargetsForRegion(region);
    if (targets.length === 0) {
        return selectApiTarget();
    }

    const weighted = buildWeightedTargets(targets);
    return selectFromWeightedTargets(weighted);
}

/**
 * Check if region has available targets
 */
export function hasRegionTargets(region) {
    if (region === 'auto') {
        return TARGET_COLLECTIONS.auto.length > 0;
    }
    return getTargetsForRegion(region).length > 0;
}

/**
 * Parse target base URL
 */
function parseTargetBase(target) {
    try {
        return new URL(target.baseUrl);
    } catch (error) {
        console.error(`Invalid API target base URL for ${target.name}:`, error);
        return null;
    }
}

/**
 * Get base API URL
 */
function getBaseApiUrl(target) {
    const chosen = target ?? getPrimaryTarget();
    return parseTargetBase(chosen);
}

/**
 * Strip trailing slash from path
 */
function stripTrailingSlash(path) {
    if (path === '/') return path;
    return path.replace(/\/+$/, '') || '/';
}

/**
 * Combine base path with relative path
 */
function combinePaths(basePath, relativePath) {
    const trimmedBase = stripTrailingSlash(basePath || '/');
    const normalizedRelative = relativePath.startsWith('/') ? relativePath : `/${relativePath}`;
    if (trimmedBase === '/' || trimmedBase === '') {
        return normalizedRelative;
    }
    if (normalizedRelative === '/') {
        return `${trimmedBase}/`;
    }
    return `${trimmedBase}${normalizedRelative}`;
}

/**
 * Get relative path from URL
 */
function getRelativePath(url, targetBase) {
    const basePath = stripTrailingSlash(targetBase.pathname || '/');
    const currentPath = url.pathname || '/';
    if (basePath === '/' || basePath === '') {
        return currentPath.startsWith('/') ? currentPath : `/${currentPath}`;
    }
    if (!currentPath.startsWith(basePath)) {
        return currentPath;
    }
    const relative = currentPath.slice(basePath.length);
    if (!relative) {
        return '/';
    }
    return relative.startsWith('/') ? relative : `/${relative}`;
}

/**
 * Check if URL matches a target
 */
function matchesTarget(url, target) {
    const base = parseTargetBase(target);
    if (!base) {
        return false;
    }

    if (url.origin !== base.origin) {
        return false;
    }

    const basePath = stripTrailingSlash(base.pathname || '/');
    if (basePath === '/' || basePath === '') {
        return true;
    }

    const targetPath = stripTrailingSlash(url.pathname || '/');
    return targetPath === basePath || targetPath.startsWith(`${basePath}/`);
}

/**
 * Find target for a URL
 */
function findTargetForUrl(url) {
    for (const target of API_CONFIG.targets) {
        if (matchesTarget(url, target)) {
            return target;
        }
    }
    return null;
}

/**
 * Check if URL requires proxy
 */
export function isProxyTarget(url) {
    const target = findTargetForUrl(url);
    return target?.requiresProxy === true;
}

/**
 * Check if URL should prefer primary target
 */
function shouldPreferPrimaryTarget(url) {
    const path = url.pathname.toLowerCase();

    if (path.includes('/album/') || path.includes('/artist/') || path.includes('/playlist/')) {
        return true;
    }

    if (path.includes('/search/')) {
        const params = url.searchParams;
        if (params.has('a') || params.has('al') || params.has('p')) {
            return true;
        }
    }

    return false;
}

/**
 * Resolve URL string to URL object
 */
function resolveUrl(url) {
    try {
        return new URL(url);
    } catch {
        const baseApiUrl = getBaseApiUrl();
        if (!baseApiUrl) {
            return null;
        }

        try {
            return new URL(url, baseApiUrl);
        } catch {
            return null;
        }
    }
}

/**
 * Get proxied URL if needed
 */
export function getProxiedUrl(url) {
    if (!API_CONFIG.useProxy || !API_CONFIG.proxyUrl) {
        return url;
    }

    const targetUrl = resolveUrl(url);
    if (!targetUrl) {
        return url;
    }

    if (!isProxyTarget(targetUrl)) {
        return url;
    }

    return `${API_CONFIG.proxyUrl}?url=${encodeURIComponent(targetUrl.toString())}`;
}

/**
 * Check if entry is likely a proxy error
 */
function isLikelyProxyErrorEntry(entry) {
    if (!entry || typeof entry !== 'object') {
        return false;
    }

    const status = typeof entry.status === 'number' ? entry.status : undefined;
    const subStatus = typeof entry.subStatus === 'number' ? entry.subStatus : undefined;
    const userMessage = typeof entry.userMessage === 'string' ? entry.userMessage : undefined;
    const detail = typeof entry.detail === 'string' ? entry.detail : undefined;

    if (typeof status === 'number' && status >= 400) {
        return true;
    }

    if (typeof subStatus === 'number' && subStatus >= 400) {
        return true;
    }

    const tokenPattern = /(token|invalid|unauthorized)/i;
    if (userMessage && tokenPattern.test(userMessage)) {
        return true;
    }

    if (detail && tokenPattern.test(detail)) {
        return true;
    }

    return false;
}

/**
 * Check if payload is likely a proxy error
 */
function isLikelyProxyErrorPayload(payload) {
    if (Array.isArray(payload)) {
        return payload.some((entry) => isLikelyProxyErrorEntry(entry));
    }

    if (payload && typeof payload === 'object') {
        return isLikelyProxyErrorEntry(payload);
    }

    return false;
}

/**
 * Check for unexpected proxy response
 */
async function isUnexpectedProxyResponse(response) {
    if (!response.ok) {
        return false;
    }

    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.toLowerCase().includes('application/json')) {
        return false;
    }

    try {
        const payload = await response.clone().json();
        return isLikelyProxyErrorPayload(payload);
    } catch {
        return false;
    }
}

/**
 * Check if target is V2
 */
function isV2Target(target) {
    return V2_API_TARGETS.some((t) => t.name === target.name);
}

/**
 * Fetch with CORS handling and multi-target failover
 * 
 * @param {string} url - URL to fetch
 * @param {object} options - Fetch options plus:
 *   - apiVersion: 'v1' | 'v2'
 *   - preferredQuality: quality string to set on fallback
 *   - validateResponse: async function to validate response
 * @returns {Promise<Response>}
 */
export async function fetchWithCORS(url, options = {}) {
    const resolvedUrl = resolveUrl(url);
    if (!resolvedUrl) {
        throw new Error(`Unable to resolve URL: ${url}`);
    }

    const originTarget = findTargetForUrl(resolvedUrl);
    if (!originTarget) {
        return fetch(getProxiedUrl(resolvedUrl.toString()), {
            ...options
        });
    }

    const apiVersion = options.apiVersion ?? 'v2';
    const weightedTargets = ensureWeightedTargets(apiVersion);
    const attemptOrder = [];

    if (shouldPreferPrimaryTarget(resolvedUrl)) {
        const primary = getPrimaryTarget(apiVersion);
        if (!attemptOrder.some((candidate) => candidate.name === primary.name)) {
            attemptOrder.push(primary);
        }
    }

    const selected = selectApiTarget(apiVersion);
    if (!attemptOrder.some((candidate) => candidate.name === selected.name)) {
        attemptOrder.push(selected);
    }

    for (const target of weightedTargets) {
        if (!attemptOrder.some((candidate) => candidate.name === target.name)) {
            attemptOrder.push(target);
        }
    }

    let uniqueTargets = attemptOrder.filter(
        (target, index, array) => array.findIndex((entry) => entry.name === target.name) === index
    );

    if (uniqueTargets.length === 0) {
        uniqueTargets = [getPrimaryTarget(apiVersion)];
    }

    const originBase = parseTargetBase(originTarget);
    if (!originBase) {
        throw new Error('Invalid origin target configuration.');
    }

    const totalAttempts = Math.max(3, uniqueTargets.length);
    let lastError = null;
    let lastResponse = null;
    let lastUnexpectedResponse = null;
    let lastValidButRejectedResponse = null;

    for (let attempt = 0; attempt < totalAttempts; attempt += 1) {
        const target = uniqueTargets[attempt % uniqueTargets.length];
        const targetBase = parseTargetBase(target);
        if (!targetBase) {
            continue;
        }

        const relativePath = getRelativePath(resolvedUrl, originBase);
        const rewrittenPath = combinePaths(targetBase.pathname || '/', relativePath);
        const rewrittenUrl = new URL(
            rewrittenPath + resolvedUrl.search + resolvedUrl.hash,
            targetBase.origin
        );

        // Upgrade quality parameter if falling back to V2 target
        if (
            isV2Target(target) &&
            options.preferredQuality &&
            rewrittenUrl.searchParams.has('quality')
        ) {
            rewrittenUrl.searchParams.set('quality', options.preferredQuality);
        }

        const finalUrl = getProxiedUrl(rewrittenUrl.toString());

        const headers = new Headers(options.headers);
        const isCustom =
            V2_API_TARGETS.some((t) => t.name === target.name) &&
            !target.baseUrl.includes('tidal.com') &&
            !target.baseUrl.includes('api.tidal.com') &&
            !target.baseUrl.includes('monochrome.tf') &&
            !target.baseUrl.includes('qqdl.site');

        if (isCustom) {
            headers.set('X-Client', `StreamflixMusic/${APP_VERSION}`);
        }

        try {
            const response = await fetch(finalUrl, {
                ...options,
                headers
            });

            if (response.ok) {
                const unexpected = await isUnexpectedProxyResponse(response);
                if (!unexpected) {
                    if (options.validateResponse) {
                        const isValid = await options.validateResponse(response.clone());
                        if (!isValid) {
                            lastValidButRejectedResponse = response;
                            continue;
                        }
                    }
                    return response;
                }
                lastUnexpectedResponse = response;
                continue;
            }

            lastResponse = response;
        } catch (error) {
            lastError = error;
            if (error instanceof TypeError && error.message.includes('CORS')) {
                continue;
            }
        }
    }

    if (lastValidButRejectedResponse) {
        return lastValidButRejectedResponse;
    }

    if (lastUnexpectedResponse) {
        return lastUnexpectedResponse;
    }

    if (lastResponse) {
        return lastResponse;
    }

    if (lastError) {
        if (
            lastError instanceof TypeError &&
            typeof lastError.message === 'string' &&
            lastError.message.includes('CORS')
        ) {
            throw new Error(
                'CORS error detected. Please configure a proxy or enable CORS on the backend.'
            );
        }
        throw lastError;
    }

    throw new Error('All API targets failed without response.');
}

export default {
    API_CONFIG,
    selectApiTarget,
    getPrimaryTarget,
    getTargetsForRegion,
    selectApiTargetForRegion,
    hasRegionTargets,
    isProxyTarget,
    getProxiedUrl,
    fetchWithCORS
};
