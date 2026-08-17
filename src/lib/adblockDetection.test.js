import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { BAITS, createBaitElements, isBaitHidden, runAdblockBaitTest } from './adblockDetection';

// happy-dom has no layout engine, so offsetWidth/offsetHeight always read 0 —
// which would make every element look "hidden". Simulate a real browser where
// a 1x1px block is laid out (offset = 1) unless it is actually collapsed.
const patchRealLayout = () => {
    const proto = HTMLElement.prototype;
    const w = Object.getOwnPropertyDescriptor(proto, 'offsetWidth');
    const h = Object.getOwnPropertyDescriptor(proto, 'offsetHeight');
    Object.defineProperty(proto, 'offsetWidth', { configurable: true, get: () => 1 });
    Object.defineProperty(proto, 'offsetHeight', { configurable: true, get: () => 1 });
    return () => {
        Object.defineProperty(proto, 'offsetWidth', w ?? { configurable: true, value: 0 });
        Object.defineProperty(proto, 'offsetHeight', h ?? { configurable: true, value: 0 });
    };
};

const addStyle = (css) => {
    const style = document.createElement('style');
    style.dataset.testStyle = '1';
    style.textContent = css;
    document.head.appendChild(style);
};

afterEach(() => {
    document.body.innerHTML = '';
    document.head.querySelectorAll('style[data-test-style]').forEach(s => s.remove());
});

describe('createBaitElements', () => {
    it('builds one element per bait spec with the exact selectors blockers target', () => {
        const container = createBaitElements();
        expect(container.querySelectorAll('*').length).toBe(BAITS.length);
        expect(container.querySelector('.ad-unit[data-ad-slot="1234567890"]')).toBeTruthy();
        expect(container.querySelector('.ad-container.ad-wrapper')).toBeTruthy();
        expect(container.querySelector('#ad-banner.ad')).toBeTruthy();
        expect(container.querySelector('.sponsor-ad.sponsored-content')).toBeTruthy();
        expect(container.querySelector('iframe.ad-frame[src="about:blank"]')).toBeTruthy();
    });
});

describe('runAdblockBaitTest — no false positives', () => {
    it('clean environment (no ad blocker): NOT blocked', async () => {
        const restore = patchRealLayout();
        try {
            const blocked = await runAdblockBaitTest({ settleDelayMs: 0 });
            expect(blocked).toBe(false);
        } finally {
            restore();
        }
    });

    it('offscreen container placement does not trigger detection', async () => {
        // The container is intentionally positioned at -9999px; layout size is
        // unaffected, so this must stay "not blocked".
        const restore = patchRealLayout();
        try {
            const blocked = await runAdblockBaitTest({ settleDelayMs: 0 });
            expect(blocked).toBe(false);
        } finally {
            restore();
        }
    });

    it('ancestor opacity:0 (page fade-in) does not cascade to baits', async () => {
        const restore = patchRealLayout();
        try {
            document.body.style.opacity = '0';
            const blocked = await runAdblockBaitTest({ settleDelayMs: 0 });
            expect(blocked).toBe(false);
        } finally {
            restore();
        }
    });

    it('unrelated CSS rules do not trigger detection', async () => {
        const restore = patchRealLayout();
        try {
            addStyle('.hero-banner { display: none; } [data-testid="x"] { opacity: 0; }');
            const blocked = await runAdblockBaitTest({ settleDelayMs: 0 });
            expect(blocked).toBe(false);
        } finally {
            restore();
        }
    });

    it('cleanup removes the baits after the test', async () => {
        await runAdblockBaitTest({ settleDelayMs: 0 });
        expect(document.querySelector('.ad-unit')).toBeNull();
        expect(document.querySelector('iframe.ad-frame')).toBeNull();
    });
});

describe('runAdblockBaitTest — true positives (blocker behaviors)', () => {
    it('uBlock-style cosmetic filter (display:none on .ad-unit) → blocked', async () => {
        const restore = patchRealLayout();
        try {
            addStyle('.ad-unit { display: none !important; }');
            expect(await runAdblockBaitTest({ settleDelayMs: 0 })).toBe(true);
        } finally {
            restore();
        }
    });

    it('AdGuard-style cosmetic filter (visibility:hidden on .ad-container) → blocked', async () => {
        const restore = patchRealLayout();
        try {
            addStyle('.ad-container { visibility: hidden !important; }');
            expect(await runAdblockBaitTest({ settleDelayMs: 0 })).toBe(true);
        } finally {
            restore();
        }
    });

    it('opacity:0 cosmetic filter (sponsored-content) → blocked', async () => {
        const restore = patchRealLayout();
        try {
            addStyle('.sponsored-content { opacity: 0 !important; }');
            expect(await runAdblockBaitTest({ settleDelayMs: 0 })).toBe(true);
        } finally {
            restore();
        }
    });

    it('HTML filtering (blocker removes the bait element) → blocked', async () => {
        const restore = patchRealLayout();
        try {
            // Simulate a blocker that removes iframe bait shortly after insert.
            setTimeout(() => {
                document.querySelector('iframe.ad-frame')?.remove();
            }, 0);
            expect(await runAdblockBaitTest({ settleDelayMs: 5 })).toBe(true);
        } finally {
            restore();
        }
    });

    it('element collapse (ancestor display:none, offsets zeroed) → blocked', () => {
        const container = createBaitElements();
        document.body.appendChild(container);
        container.style.display = 'none';
        for (const bait of container.querySelectorAll('*')) {
            Object.defineProperty(bait, 'offsetWidth', { configurable: true, value: 0 });
            Object.defineProperty(bait, 'offsetHeight', { configurable: true, value: 0 });
        }
        expect(isBaitHidden(container.querySelector('#ad-banner'))).toBe(true);
    });
});

describe('runAdblockBaitTest — error handling', () => {
    it('propagates environment errors so the caller can default to "no adblock"', async () => {
        const brokenDoc = {
            createElement: () => { throw new Error('boom'); },
            body: {},
        };
        await expect(runAdblockBaitTest({ doc: brokenDoc })).rejects.toThrow('boom');
    });
});

describe('regression guard — site CSS must not hide the baits', () => {
    // The baits use real ad-selector class names on purpose, so a future site
    // CSS rule targeting any of them (e.g. "hide empty ad slots") would hide
    // the baits and lock out EVERY visitor. Scan the app's own stylesheets.
    const BAIT_SELECTOR_PATTERNS = [
        /\.ad-unit\b/, /\.ad-container\b/, /\.ad-wrapper\b/,
        /#ad-banner\b/, /\.sponsor-ad\b/, /\.sponsored-content\b/,
        /\.ad-frame\b/, /\.ad\s*[,{]/,
    ];

    const listCssFiles = (dir, out = []) => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            const full = join(dir, entry.name);
            if (entry.isDirectory()) {
                if (entry.name === 'node_modules') continue;
                listCssFiles(full, out);
            } else if (entry.name.endsWith('.css')) {
                out.push(full);
            }
        }
        return out;
    };

    it('no stylesheet contains a rule that matches a bait selector', () => {
        const offenders = [];
        // Directory of this test file is src/lib — the app styles live in src/.
        const srcDir = join(import.meta.dirname, '..');
        for (const file of listCssFiles(srcDir)) {
            const css = readFileSync(file, 'utf8');
            for (const pattern of BAIT_SELECTOR_PATTERNS) {
                const match = css.match(pattern);
                if (match) {
                    offenders.push(`${file}: "${match[0]}"`);
                }
            }
        }
        expect(offenders).toEqual([]);
    });
});
