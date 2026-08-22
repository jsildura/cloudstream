/**
 * GlobalChat v2 Model & Path Centralization
 * 
 * Defines versioned RTDB paths, client data caps, and deterministic payload builders
 * for Google-authenticated user profiles, chat messages, and tickets.
 */

export const GLOBAL_CHAT_ROOT = 'globalChat/v2';

export const MAX_NAME_LENGTH = 80;
export const MAX_TEXT_LENGTH = 2000;
export const MAX_REC_NOTE_LENGTH = 1000;
export const MAX_REC_TITLE_LENGTH = 200;
export const MAX_MOVIES_COUNT = 10;
export const MAX_REPLY_PREVIEW_LENGTH = 50;

// Slash-command FAQ limits
export const MAX_FAQ_QUESTION_LENGTH = 200;
export const MAX_FAQ_ANSWER_LENGTH = 500;
export const MAX_FAQ_ITEMS = 20;

/**
 * Returns the versioned database path for a given subpath or root.
 * 
 * @param {...string} segments
 * @returns {string}
 */
export function chatPath(...segments) {
    const clean = segments
        .filter(Boolean)
        .map(s => String(s).replace(/^\/+|\/+$/g, ''))
        .filter(Boolean)
        .join('/');
    return clean ? `${GLOBAL_CHAT_ROOT}/${clean}` : GLOBAL_CHAT_ROOT;
}

/**
 * Builds a v2 profile payload from Google token identity.
 * 
 * @param {{ uid: string, displayName?: string, photoURL?: string|null }} identity
 * @param {number} timestamp
 * @param {number} [existingJoinedAt]
 * @returns {Object}
 */
export function buildChatProfile(identity, timestamp, existingJoinedAt) {
    if (!identity || !identity.uid || typeof identity.uid !== 'string' || identity.uid.trim().length === 0) {
        throw new Error('Valid identity with uid is required to build a chat profile');
    }

    const rawName = typeof identity.displayName === 'string' ? identity.displayName.trim() : '';
    const displayName = rawName.length > 0 ? rawName.slice(0, MAX_NAME_LENGTH) : 'Google User';

    const joinedAt = (typeof existingJoinedAt === 'number' && Number.isFinite(existingJoinedAt) && existingJoinedAt > 0)
        ? existingJoinedAt
        : timestamp;

    const profile = {
        uid: identity.uid,
        displayName,
        joinedAt,
        updatedAt: timestamp
    };

    if (typeof identity.photoURL === 'string' && /^https:\/\//i.test(identity.photoURL)) {
        profile.photoURL = identity.photoURL;
    }

    return profile;
}

/**
 * Builds a deterministic v2 chat message payload.
 * 
 * @param {Object} input
 * @returns {Object}
 */
export function buildChatMessage(input = {}) {
    const {
        identity,
        isAdmin = false,
        text = '',
        timestamp,
        movies,
        recTitle,
        recText,
        mediaUrl,
        mediaType,
        replyTo
    } = input;

    if (!identity || !identity.uid || typeof identity.uid !== 'string' || identity.uid.trim().length === 0) {
        throw new Error('Valid identity is required to build a chat message');
    }

    const rawText = typeof text === 'string' ? text.trim() : '';
    const messageText = rawText.slice(0, MAX_TEXT_LENGTH);
    const hasMovies = Array.isArray(movies) && movies.length > 0;
    const hasRec = (typeof recTitle === 'string' && recTitle.trim().length > 0) ||
        (typeof recText === 'string' && recText.trim().length > 0);
    const hasMedia = typeof mediaUrl === 'string' && mediaUrl.trim().length > 0;

    if (messageText.length === 0 && !hasMovies && !hasRec && !hasMedia) {
        throw new Error('Chat message must contain valid content (text, media, recommendation, or movies)');
    }

    const rawName = typeof identity.displayName === 'string' ? identity.displayName.trim() : '';
    const senderName = rawName.length > 0 ? rawName.slice(0, MAX_NAME_LENGTH) : 'Google User';
    const senderIsAdmin = Boolean(isAdmin);
    const broadcast = Boolean(senderIsAdmin && messageText.includes('@everyone'));

    const msg = {
        uid: identity.uid,
        senderName,
        senderIsAdmin,
        text: messageText,
        broadcast,
        createdAt: timestamp,
        deletedForAll: false
    };

    if (typeof identity.photoURL === 'string' && /^https:\/\//i.test(identity.photoURL)) {
        msg.senderPhotoURL = identity.photoURL;
    }

    if (hasMovies) {
        msg.movies = movies.slice(0, MAX_MOVIES_COUNT);
    }

    if (typeof recTitle === 'string' && recTitle.trim().length > 0) {
        msg.recTitle = recTitle.trim().slice(0, MAX_REC_TITLE_LENGTH);
    }

    if (typeof recText === 'string' && recText.trim().length > 0) {
        msg.recText = recText.trim().slice(0, MAX_REC_NOTE_LENGTH);
    }

    if (hasMedia) {
        msg.mediaUrl = mediaUrl.trim();
        if (typeof mediaType === 'string' && mediaType.trim().length > 0) {
            msg.mediaType = mediaType.trim();
        }
    }

    if (replyTo && typeof replyTo === 'object') {
        const rawReplySender = typeof replyTo.senderName === 'string'
            ? replyTo.senderName
            : (typeof replyTo.nickname === 'string' ? replyTo.nickname : 'Google User');
        const replySenderName = rawReplySender.trim().slice(0, MAX_NAME_LENGTH) || 'Google User';

        const rawReplyText = typeof replyTo.text === 'string'
            ? replyTo.text
            : (typeof replyTo.recTitle === 'string' ? replyTo.recTitle : '');
        const replyText = rawReplyText.slice(0, MAX_REPLY_PREVIEW_LENGTH);

        msg.replyTo = {
            messageId: String(replyTo.messageId || ''),
            senderName: replySenderName,
            text: replyText
        };
    }

    return msg;
}

/**
 * Builds a deterministic v2 ticket message payload.
 * 
 * @param {Object} input
 * @returns {Object}
 */
export function buildTicketMessage(input = {}) {
    const { identity, timestamp, ticketNo, category } = input;

    if (!identity || !identity.uid || typeof identity.uid !== 'string' || identity.uid.trim().length === 0) {
        throw new Error('Valid identity is required to build a ticket message');
    }

    if (!ticketNo || typeof ticketNo !== 'string' || ticketNo.trim().length === 0) {
        throw new Error('Valid ticketNo is required to build a ticket message');
    }

    if (!category || typeof category !== 'string' || category.trim().length === 0) {
        throw new Error('Valid category is required to build a ticket message');
    }

    const rawName = typeof identity.displayName === 'string' ? identity.displayName.trim() : '';
    const senderName = rawName.length > 0 ? rawName.slice(0, MAX_NAME_LENGTH) : 'Google User';

    const ticket = {
        uid: identity.uid,
        senderName,
        senderIsAdmin: false,
        text: '',
        broadcast: false,
        createdAt: timestamp,
        deletedForAll: false,
        type: 'ticket',
        ticketAction: 'created',
        ticketStatus: 'open',
        ticketNo: ticketNo.trim(),
        category: category.trim(),
        reporterUid: identity.uid
    };

    if (typeof identity.photoURL === 'string' && /^https:\/\//i.test(identity.photoURL)) {
        ticket.senderPhotoURL = identity.photoURL;
    }

    return ticket;
}
