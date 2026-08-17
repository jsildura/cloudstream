/**
 * Anti-adblock bait detection — pure DOM logic with no React dependency so it
 * can be unit-tested directly.
 *
 * How it works: we create small "bait" elements whose class names / ids match
 * selectors that ad blockers (uBlock Origin, AdGuard, Adblock Plus, Brave
 * Shields, ...) hide through cosmetic/HTML filtering, append them offscreen,
 * give the blocker a moment to act, then report whether any bait was removed
 * or hidden.
 *
 * False-positive guards (why each choice was made):
 *  - No network requests are made (fetch/HEAD probes to ad domains were
 *    removed because CORS, proxies, and flaky connectivity caused false
 *    positives). Detection is purely DOM-based.
 *  - The baits are 1x1px so a zero offset size is only possible when the
 *    element (or an ancestor) is genuinely display:none/hidden — the exact
 *    thing a cosmetic filter does — never because the bait is offscreen.
 *  - Computed `opacity` is per-element, so an ancestor fade-in (e.g. a site
 *    that fades the page in) does not cascade to the baits.
 *  - On any error the caller treats it as "no adblock" (see AdblockModal).
 *
 * Known limits (acceptable trade-offs):
 *  - Only DOM-hiding blockers are caught. Network-only blockers (DNS-level,
 *    Pi-hole, some corporate firewalls) do not touch the DOM and are not
 *    detected — by design, since they are indistinguishable from connectivity
 *    issues.
 *  - Detection is one-shot shortly after mount. A blocker whose filter lists
 *    load slowly can miss the window (a false negative, not a false positive).
 */

/** Bait elements an ad blocker's filter lists commonly target. */
export const BAITS = [
    { tag: 'div', attrs: { class: 'ad-unit', 'data-ad-slot': '1234567890' } },
    { tag: 'div', attrs: { class: 'ad-container ad-wrapper' } },
    { tag: 'div', attrs: { id: 'ad-banner', class: 'ad' } },
    { tag: 'div', attrs: { class: 'sponsor-ad sponsored-content' } },
    { tag: 'iframe', attrs: { src: 'about:blank', class: 'ad-frame' } },
];

/** How long to wait after inserting baits for a blocker's filters to act. */
export const BAIT_SETTLE_DELAY_MS = 500;

/**
 * Build the offscreen bait container. Positioned at -9999px so real users
 * never see it; offset sizes are unaffected by offscreen placement.
 */
export const createBaitElements = ({ doc = document } = {}) => {
    const container = doc.createElement('div');
    container.style.cssText = 'position: absolute; top: -9999px; left: -9999px;';

    for (const { tag, attrs } of BAITS) {
        const el = doc.createElement(tag);
        for (const [key, value] of Object.entries(attrs)) {
            el.setAttribute(key, value);
        }
        el.style.cssText = 'width: 1px; height: 1px; display: block;';
        el.innerHTML = '&nbsp;';
        container.appendChild(el);
    }

    return container;
};

/**
 * True when a single bait element was removed or hidden by an ad blocker.
 */
export const isBaitHidden = (bait, { win = window } = {}) => {
    // HTML filtering: blocker removed the element from the DOM.
    if (!win.document.body.contains(bait)) return true;

    // Cosmetic filtering: blocker hides the element via CSS.
    const style = win.getComputedStyle(bait);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
        return true;
    }

    // Element (or an ancestor) is not laid out at all — display:none or an
    // equivalent. With the fixed 1x1px inline size this cannot be caused by
    // normal rendering, only by hiding.
    if (bait.offsetHeight === 0 || bait.offsetWidth === 0) return true;

    return false;
};

/**
 * Run the full bait test. Resolves true when an ad blocker removed or hid any
 * bait, false otherwise. Throws on environment errors — callers decide how to
 * handle them (AdblockModal treats errors as "no adblock").
 */
export const runAdblockBaitTest = async ({
    doc = document,
    win = window,
    settleDelayMs = BAIT_SETTLE_DELAY_MS,
} = {}) => {
    const container = createBaitElements({ doc });
    doc.body.appendChild(container);

    // Snapshot the baits BEFORE waiting. querySelectorAll returns a static
    // list, so a blocker that REMOVES a bait (HTML filtering) while we wait
    // only stays visible to the contains() check if it is in this snapshot.
    const baits = container.querySelectorAll('*');
    try {
        // Give the blocker's cosmetic/HTML filters time to act on the baits.
        await new Promise(resolve => setTimeout(resolve, settleDelayMs));

        for (const bait of baits) {
            if (isBaitHidden(bait, { win })) return true;
        }
        return false;
    } finally {
        // Always remove the baits, even on unexpected errors.
        if (container.parentNode) container.parentNode.removeChild(container);
    }
};
