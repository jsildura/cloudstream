/**
 * Codec capability detection.
 *
 * HEVC/H.265 support is a platform capability (browser + OS + GPU), not
 * something a web page can install or polyfill. Some embeds hand us an
 * HEVC-only quality ladder; on a browser that can't decode it, the embed's
 * own player filters out every video rendition and plays the audio track
 * alone — sound, blank picture. Detecting that up front lets us warn instead
 * of leaving the viewer staring at a black screen.
 */

// Representative HEVC Main-profile strings. `hev1` and `hvc1` are the same
// codec in different sample-entry flavors — browsers disagree on which they
// advertise and Apple platforms only accept `hvc1`, so both are probed.
// Levels 3.0 (L90, 720p), 4.0 (L120, 1080p) and 5.0 (L150, 4K) mirror the
// ladder the affected servers actually serve.
const HEVC_TYPES = [
    'video/mp4; codecs="hev1.1.6.L90.90"',
    'video/mp4; codecs="hev1.1.6.L120.90"',
    'video/mp4; codecs="hev1.1.6.L150.90"',
    'video/mp4; codecs="hvc1.1.6.L90.90"',
    'video/mp4; codecs="hvc1.1.6.L120.90"',
    'video/mp4; codecs="hvc1.1.6.L150.90"',
];

/**
 * Probes this browser for HEVC/H.265 decode support.
 *
 * `MediaSource.isTypeSupported` is checked first because it is the exact call
 * embedded MSE players (Shaka, dash.js, hls.js) use to filter renditions —
 * matching it means we predict what they will do. `canPlayType` is the
 * fallback for browsers that decode HEVC natively but not through MSE
 * (Safari's native HLS path).
 *
 * Returns `true` when support can't be determined (SSR, no MediaSource, no
 * `<video>`). An unknown answer must never produce a warning — staying
 * silent beats crying wolf on a browser that plays fine.
 *
 * @returns {boolean} True if HEVC is supported, or if support is unknown.
 */
export function detectHevcSupport() {
    if (typeof window === 'undefined') return true;

    // A negative is only trustworthy once a probe has actually answered;
    // a probe that throws leaves this false so we fall back to "unknown".
    let probed = false;

    const mediaSource = window.MediaSource;
    if (typeof mediaSource?.isTypeSupported === 'function') {
        try {
            if (HEVC_TYPES.some((type) => mediaSource.isTypeSupported(type))) return true;
            probed = true;
        } catch { /* unusable probe — leave `probed` false */ }
    }

    try {
        const video = document.createElement('video');
        if (typeof video.canPlayType === 'function') {
            // 'probably' only: 'maybe' means the browser is guessing from the
            // container alone, and it guesses wrong about HEVC routinely.
            if (HEVC_TYPES.some((type) => video.canPlayType(type) === 'probably')) return true;
            probed = true;
        }
    } catch { /* unusable probe — leave `probed` false */ }

    return !probed;
}

let cached = null;

/**
 * Memoized {@link detectHevcSupport}. Decode support can't change during a
 * session, and the probe is called from render-driven effects, so the answer
 * is computed once.
 *
 * @returns {boolean} True if HEVC is supported, or if support is unknown.
 */
export function isHevcSupported() {
    if (cached === null) cached = detectHevcSupport();
    return cached;
}

/** Clears the memoized answer. Test-only. */
export function resetHevcSupportCache() {
    cached = null;
}
