import { describe, it, expect } from 'vitest';
import {
    ADMIN_BADGES,
    ADMIN_BADGE_IDS,
    DEFAULT_ADMIN_BADGE_ID,
    ADMIN_NAME_MAX_LENGTH,
    FALLBACK_AVATAR,
    RESERVED_DISPLAY_NAME,
    isValidBadgeId,
    getAdminBadge,
    isValidAdminPhotoURL,
    validateAdminName,
    normalizeAdminOverrides,
    resolveSenderIdentity
} from './globalChatAdminIdentity';

describe('ADMIN_BADGES', () => {
    it('exposes exactly the ids the database rules allowlist', () => {
        // Must stay in sync with the adminBadge .validate allowlist in
        // database.rules.json / database.rules.transitional.json.
        expect(ADMIN_BADGE_IDS).toEqual(['crown', 'shield', 'star', 'verified', 'bolt', 'wrench']);
        expect(ADMIN_BADGES.map(b => b.id)).toEqual(ADMIN_BADGE_IDS);
    });

    it('gives every badge a label and drawable SVG geometry', () => {
        for (const badge of ADMIN_BADGES) {
            expect(badge.label).toBeTruthy();
            expect(badge.viewBox).toMatch(/^[\d\s.-]+$/);
            expect(Array.isArray(badge.paths)).toBe(true);
            expect(badge.paths.length).toBeGreaterThan(0);
            badge.paths.forEach(d => expect(typeof d).toBe('string'));
        }
    });

    it('contains no emoji or markup in any label or path', () => {
        const emoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u;
        for (const badge of ADMIN_BADGES) {
            expect(badge.label).not.toMatch(emoji);
            expect(badge.label).not.toMatch(/[<>]/);
            badge.paths.forEach(d => {
                expect(d).not.toMatch(emoji);
                expect(d).not.toMatch(/[<>]/);
            });
        }
    });

    it('defaults to crown', () => {
        expect(DEFAULT_ADMIN_BADGE_ID).toBe('crown');
    });
});

describe('isValidBadgeId', () => {
    it('accepts every allowlisted id', () => {
        ADMIN_BADGE_IDS.forEach(id => expect(isValidBadgeId(id)).toBe(true));
    });

    it('rejects unknown ids, wrong case, markup, emoji, and non-strings', () => {
        ['emperor', 'CROWN', 'crown ', '', '👑', '<svg onload=alert(1)>'].forEach(id => {
            expect(isValidBadgeId(id)).toBe(false);
        });
        [null, undefined, 0, {}, []].forEach(id => expect(isValidBadgeId(id)).toBe(false));
    });
});

describe('getAdminBadge', () => {
    it('returns the requested badge', () => {
        expect(getAdminBadge('shield').id).toBe('shield');
    });

    it('falls back to the default badge for anything invalid', () => {
        ['emperor', '', null, undefined, '<svg>'].forEach(id => {
            expect(getAdminBadge(id).id).toBe(DEFAULT_ADMIN_BADGE_ID);
        });
    });
});

describe('validateAdminName', () => {
    it('accepts a normal name and both length boundaries', () => {
        expect(validateAdminName('Nightwatch')).toEqual({ ok: true, error: null });
        expect(validateAdminName('AB').ok).toBe(true);
        expect(validateAdminName('A'.repeat(ADMIN_NAME_MAX_LENGTH)).ok).toBe(true);
    });

    it('accepts interior spaces', () => {
        expect(validateAdminName('Night Watch').ok).toBe(true);
    });

    // Each case below mirrors a conjunct of the adminName .validate rule, so a
    // value accepted here can never be rejected by the server.
    it('rejects too short and too long', () => {
        expect(validateAdminName('A').ok).toBe(false);
        expect(validateAdminName('A'.repeat(ADMIN_NAME_MAX_LENGTH + 1)).ok).toBe(false);
    });

    it('rejects leading or trailing whitespace', () => {
        expect(validateAdminName(' Nightwatch').ok).toBe(false);
        expect(validateAdminName('Nightwatch ').ok).toBe(false);
    });

    it('rejects an @ so a name can never read as an email or @everyone', () => {
        expect(validateAdminName('admin@streamflix.com').ok).toBe(false);
        expect(validateAdminName('@everyone').ok).toBe(false);
    });

    it('rejects the reserved fallback identity', () => {
        expect(validateAdminName(RESERVED_DISPLAY_NAME).ok).toBe(false);
    });

    it('rejects non-strings and empty input', () => {
        [null, undefined, 42, {}, ''].forEach(v => expect(validateAdminName(v).ok).toBe(false));
    });

    it('always returns a human-readable error when it rejects', () => {
        const result = validateAdminName('A');
        expect(result.ok).toBe(false);
        expect(typeof result.error).toBe('string');
        expect(result.error.length).toBeGreaterThan(0);
    });
});

describe('isValidAdminPhotoURL', () => {
    it('accepts the lh3 Drive shape formatDriveUrl produces', () => {
        expect(isValidAdminPhotoURL('https://lh3.googleusercontent.com/d/1AbC_dEf-GhIj')).toBe(true);
    });

    it('rejects wrong scheme, wrong host, host-prefix tricks, and query strings', () => {
        [
            'http://lh3.googleusercontent.com/d/1AbC',
            'https://evil.example.com/d/1AbC',
            'https://lh3.googleusercontent.com.evil.com/d/1AbC',
            'https://img.test/alice.jpg',
            'javascript:alert(1)',
            'data:image/png;base64,AAAA',
            'https://lh3.googleusercontent.com/d/',
            'https://lh3.googleusercontent.com/d/1AbC?tracking=1',
            null,
            undefined,
            42
        ].forEach(url => expect(isValidAdminPhotoURL(url)).toBe(false));
    });
});

describe('normalizeAdminOverrides', () => {
    it('returns all-null for a profile with no overrides', () => {
        expect(normalizeAdminOverrides({ uid: 'u1', displayName: 'Alice' })).toEqual({
            adminName: null,
            adminPhotoURL: null,
            adminBadge: null
        });
    });

    it('passes through valid overrides', () => {
        expect(normalizeAdminOverrides({
            adminName: 'Nightwatch',
            adminPhotoURL: 'https://lh3.googleusercontent.com/d/1AbC',
            adminBadge: 'shield'
        })).toEqual({
            adminName: 'Nightwatch',
            adminPhotoURL: 'https://lh3.googleusercontent.com/d/1AbC',
            adminBadge: 'shield'
        });
    });

    // Defence in depth: the rules already reject these, but a value written
    // before a rules deploy must never reach the DOM.
    it('drops hostile or malformed values field by field', () => {
        expect(normalizeAdminOverrides({
            adminName: '   ',
            adminPhotoURL: 'javascript:alert(1)',
            adminBadge: '<svg onload=alert(1)>'
        })).toEqual({ adminName: null, adminPhotoURL: null, adminBadge: null });
    });

    it('keeps the valid fields when only some are bad', () => {
        expect(normalizeAdminOverrides({
            adminName: 'Nightwatch',
            adminPhotoURL: 'http://insecure.example/p.png',
            adminBadge: 'emperor'
        })).toEqual({ adminName: 'Nightwatch', adminPhotoURL: null, adminBadge: null });
    });

    it('tolerates null, undefined, and non-object input', () => {
        [null, undefined, 'nope', 42].forEach(v => {
            expect(normalizeAdminOverrides(v)).toEqual({
                adminName: null,
                adminPhotoURL: null,
                adminBadge: null
            });
        });
    });
});

describe('resolveSenderIdentity', () => {
    const override = {
        adminName: 'Nightwatch',
        adminPhotoURL: 'https://lh3.googleusercontent.com/d/1AbC',
        adminBadge: 'shield'
    };
    const adminMsg = {
        senderIsAdmin: true,
        senderName: 'Alice Real',
        senderPhotoURL: 'https://lh3.googleusercontent.com/a/alice'
    };

    it('applies the override for an admin sender', () => {
        expect(resolveSenderIdentity({ msg: adminMsg, override })).toEqual({
            displayName: 'Nightwatch',
            photoURL: 'https://lh3.googleusercontent.com/d/1AbC',
            badgeId: 'shield'
        });
    });

    it('falls back to the immutable snapshot for an admin with no overrides', () => {
        expect(resolveSenderIdentity({ msg: adminMsg, override: null })).toEqual({
            displayName: 'Alice Real',
            photoURL: 'https://lh3.googleusercontent.com/a/alice',
            badgeId: DEFAULT_ADMIN_BADGE_ID
        });
    });

    // The senderIsAdmin gate is what makes an override self-expire: it is
    // validated against the live claim at write time, so a revoked admin's new
    // messages carry false and render plain Google identity.
    it('ignores the override entirely when senderIsAdmin is false', () => {
        const msg = { ...adminMsg, senderIsAdmin: false };
        expect(resolveSenderIdentity({ msg, override })).toEqual({
            displayName: 'Alice Real',
            photoURL: 'https://lh3.googleusercontent.com/a/alice',
            badgeId: null
        });
    });

    it('never awards a badge to a non-admin sender', () => {
        const msg = { senderIsAdmin: false, senderName: 'Bob' };
        expect(resolveSenderIdentity({ msg, override: null }).badgeId).toBeNull();
    });

    it('treats a missing or non-true senderIsAdmin as non-admin', () => {
        [undefined, null, 'true', 1].forEach(senderIsAdmin => {
            const result = resolveSenderIdentity({ msg: { senderIsAdmin, senderName: 'Bob' }, override });
            expect(result.displayName).toBe('Bob');
            expect(result.badgeId).toBeNull();
        });
    });

    it('falls back through legacy snapshot fields then to the reserved name', () => {
        expect(resolveSenderIdentity({ msg: { displayName: 'Legacy' } }).displayName).toBe('Legacy');
        expect(resolveSenderIdentity({ msg: {} }).displayName).toBe(RESERVED_DISPLAY_NAME);
        expect(resolveSenderIdentity({ msg: null }).displayName).toBe(RESERVED_DISPLAY_NAME);
    });

    it('falls back to the local Streamflix logo, never a remote avatar service', () => {
        expect(resolveSenderIdentity({ msg: {} }).photoURL).toBe(FALLBACK_AVATAR);
        expect(FALLBACK_AVATAR).toBe('/logo/streamflix.png');
    });

    it('ignores an override whose fields are individually absent', () => {
        const partial = { adminName: null, adminPhotoURL: null, adminBadge: 'star' };
        expect(resolveSenderIdentity({ msg: adminMsg, override: partial })).toEqual({
            displayName: 'Alice Real',
            photoURL: 'https://lh3.googleusercontent.com/a/alice',
            badgeId: 'star'
        });
    });
});
