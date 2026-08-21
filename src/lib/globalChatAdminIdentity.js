/**
 * GlobalChat admin identity overrides — shared allowlist, validation, and the
 * render-time overlay that resolves a message's displayed sender identity.
 *
 * Admins may override their chat name, avatar, and badge. Those overrides live
 * in new fields on `globalChat/v2/profiles/$uid` that only a holder of the
 * `globalChatAdmin` custom claim can write; the existing token-bound
 * `displayName`/`photoURL`/`senderName`/`senderPhotoURL` validations are
 * untouched, so regular-user anti-spoofing is unaffected and message sender
 * snapshots stay immutable. Overrides are therefore applied at render time
 * rather than being baked into the message.
 *
 * Every validator here mirrors a `.validate` conjunct in database.rules.json,
 * so anything this module accepts the server also accepts. The rules remain the
 * real boundary — this is defence in depth and immediate user feedback.
 */

/**
 * Allowlisted badge ids.
 *
 * MUST stay in sync with the `adminBadge` .validate allowlist in BOTH
 * database.rules.json and database.rules.transitional.json.
 */
export const ADMIN_BADGE_IDS = ['crown', 'shield', 'star', 'verified', 'bolt', 'wrench'];

export const DEFAULT_ADMIN_BADGE_ID = 'crown';

/** Local asset, so a broken avatar never triggers a remote request or an onError loop. */
export const FALLBACK_AVATAR = '/logo/streamflix.png';

/** The identity shown when a token carries no name; may not be claimed as an override. */
export const RESERVED_DISPLAY_NAME = 'Google User';

export const ADMIN_NAME_MIN_LENGTH = 2;
export const ADMIN_NAME_MAX_LENGTH = 32;

/**
 * The exact shape formatDriveUrl produces. Deliberately not a general https
 * match: pinning the host blocks tracking pixels and arbitrary third parties.
 */
export const ADMIN_PHOTO_URL_PATTERN = /^https:\/\/lh3\.googleusercontent\.com\/d\/[A-Za-z0-9_-]+$/;

/**
 * Inline SVG geometry for each badge. Paths are static literals — no badge
 * markup ever originates from the database, only an allowlisted id does.
 */
export const ADMIN_BADGES = [
    {
        id: 'crown',
        label: 'Crown',
        viewBox: '0 0 24 24',
        paths: ['M3 7l4.5 3.5L12 4l4.5 6.5L21 7l-1.8 11H4.8L3 7zm3.4 9h11.2l.9-5.6-3.6 2.8L12 7.4l-2.9 5.8-3.6-2.8L6.4 16z']
    },
    {
        id: 'shield',
        label: 'Shield',
        viewBox: '0 0 24 24',
        paths: ['M12 2l8 3v6c0 5-3.4 9.3-8 11-4.6-1.7-8-6-8-11V5l8-3zm0 2.2L6 6.4V11c0 4 2.5 7.5 6 9 3.5-1.5 6-5 6-9V6.4l-6-2.2z']
    },
    {
        id: 'star',
        label: 'Star',
        viewBox: '0 0 24 24',
        paths: ['M12 2l3 6.6 7 .9-5.1 4.8 1.3 7L12 18l-6.2 3.3 1.3-7L2 9.5l7-.9L12 2z']
    },
    {
        id: 'verified',
        label: 'Verified',
        viewBox: '0 0 24 24',
        paths: [
            'M12 1.6l2.5 2.2 3.3-.4 1.2 3.1 2.9 1.6-1 3.2 1 3.2-2.9 1.6-1.2 3.1-3.3-.4L12 22.4l-2.5-2.2-3.3.4-1.2-3.1L2.1 16l1-3.2-1-3.2 2.9-1.6 1.2-3.1 3.3.4L12 1.6z',
            'M10.9 15.4l-3.2-3.2 1.4-1.4 1.8 1.8 4.2-4.2 1.4 1.4-5.6 5.6z'
        ]
    },
    {
        id: 'bolt',
        label: 'Bolt',
        viewBox: '0 0 24 24',
        paths: ['M13 2L4.5 13.5H10l-1 8.5L19.5 10H14l-1 -8z']
    },
    {
        id: 'wrench',
        label: 'Wrench',
        viewBox: '0 0 24 24',
        paths: ['M20.6 3.4a5.5 5.5 0 0 1-7.1 7.1L5.9 18.1a2 2 0 1 1-2.8-2.8l7.6-7.6a5.5 5.5 0 0 1 7.1-7.1L15 4.4l.9 3.7 3.7.9 1-5.6z']
    }
];

const BADGE_BY_ID = new Map(ADMIN_BADGES.map(badge => [badge.id, badge]));

/**
 * @param {*} id
 * @returns {boolean} true when `id` is an allowlisted badge id
 */
export function isValidBadgeId(id) {
    return typeof id === 'string' && BADGE_BY_ID.has(id);
}

/**
 * Resolves a badge id to its geometry, falling back to the default badge so an
 * unknown or hostile value can never blank out or inject into the DOM.
 * @param {*} id
 * @returns {{id: string, label: string, viewBox: string, paths: string[]}}
 */
export function getAdminBadge(id) {
    return BADGE_BY_ID.get(id) || BADGE_BY_ID.get(DEFAULT_ADMIN_BADGE_ID);
}

/**
 * @param {*} url
 * @returns {boolean} true when `url` is a well-formed lh3 Drive avatar URL
 */
export function isValidAdminPhotoURL(url) {
    return typeof url === 'string' && url.length <= 300 && ADMIN_PHOTO_URL_PATTERN.test(url);
}

/**
 * Mirrors the `adminName` .validate conjuncts, in the same order, so the
 * message shown to the admin matches why the server would have refused.
 * @param {*} value
 * @returns {{ok: boolean, error: string|null}}
 */
export function validateAdminName(value) {
    if (typeof value !== 'string' || value.length === 0) {
        return { ok: false, error: 'Enter a display name.' };
    }
    if (value.length < ADMIN_NAME_MIN_LENGTH) {
        return { ok: false, error: `Use at least ${ADMIN_NAME_MIN_LENGTH} characters.` };
    }
    if (value.length > ADMIN_NAME_MAX_LENGTH) {
        return { ok: false, error: `Use at most ${ADMIN_NAME_MAX_LENGTH} characters.` };
    }
    if (value.startsWith(' ') || value.endsWith(' ')) {
        return { ok: false, error: 'Remove the leading or trailing space.' };
    }
    if (value.includes('@')) {
        return { ok: false, error: 'The @ character is not allowed in a chat name.' };
    }
    if (value === RESERVED_DISPLAY_NAME) {
        return { ok: false, error: `“${RESERVED_DISPLAY_NAME}” is reserved.` };
    }
    return { ok: true, error: null };
}

/**
 * Extracts the override fields from a raw profile snapshot, discarding anything
 * that fails the same checks the rules apply. Values written before a rules
 * deploy, or by a future rules regression, therefore never reach the DOM.
 * @param {*} profileVal raw value of globalChat/v2/profiles/$uid
 * @returns {{adminName: string|null, adminPhotoURL: string|null, adminBadge: string|null}}
 */
export function normalizeAdminOverrides(profileVal) {
    const source = profileVal && typeof profileVal === 'object' ? profileVal : {};
    return {
        adminName: validateAdminName(source.adminName).ok ? source.adminName : null,
        adminPhotoURL: isValidAdminPhotoURL(source.adminPhotoURL) ? source.adminPhotoURL : null,
        adminBadge: isValidBadgeId(source.adminBadge) ? source.adminBadge : null
    };
}

/**
 * Resolves the identity to display for one message.
 *
 * Overrides apply only when the message itself recorded `senderIsAdmin: true`.
 * That field is validated against the live claim at write time, so a revoked
 * admin's new messages fall back to plain Google identity automatically — the
 * override self-expires with no cleanup job. Their historical messages keep the
 * override until a current admin clears the profile fields.
 *
 * @param {{msg: object|null, override?: object|null}} args
 * @returns {{displayName: string, photoURL: string, badgeId: string|null}}
 */
export function resolveSenderIdentity({ msg, override } = {}) {
    const message = msg && typeof msg === 'object' ? msg : {};
    const isAdmin = message.senderIsAdmin === true;
    const overrides = normalizeAdminOverrides(isAdmin ? override : null);

    const snapshotName = message.senderName || message.displayName || RESERVED_DISPLAY_NAME;
    const snapshotPhoto = message.senderPhotoURL || message.photoURL || message.avatarUrl || FALLBACK_AVATAR;

    return {
        displayName: overrides.adminName || snapshotName,
        photoURL: overrides.adminPhotoURL || snapshotPhoto,
        badgeId: isAdmin ? (overrides.adminBadge || DEFAULT_ADMIN_BADGE_ID) : null
    };
}
