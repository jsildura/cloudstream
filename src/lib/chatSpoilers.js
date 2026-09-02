/**
 * Chat Spoilers — Parser, Payload Builder & Token Helpers
 *
 * Handles reply-gated spoiler tags [spoiler]...[/spoiler] in Global Chat.
 * Secrets are stripped at send time, placed into a read-gated node, and
 * replaced with [[spoiler:N]] tokens in the public message text.
 *
 * Pure logic — no React, no Firebase.
 */

export const SPOILER_OPEN = '[spoiler]';
export const SPOILER_CLOSE = '[/spoiler]';
export const MAX_SPOILERS_PER_MESSAGE = 5;
export const MAX_SPOILER_LENGTH = 500; // must match the .validate cap in the rules

/**
 * Extract [spoiler]...[/spoiler] blocks from raw message text.
 * Returns public text with tokens and an object of items keyed by index string.
 *
 * @param {string} rawText
 * @returns {{ text: string, items: Record<string, string> }}
 */
export function extractSpoilers(rawText) {
    if (typeof rawText !== 'string' || !rawText) {
        return { text: '', items: {} };
    }

    // Step A — escape pre-existing tokens so manual typing cannot spoof lock chips
    const escaped = rawText.replace(/\[\[spoiler:/gi, '[ [spoiler:');

    const items = {};
    let count = 0;

    // Step B — parse spoiler tags
    const spoilerRegex = /\[spoiler\]([\s\S]*?)\[\/spoiler\]/gi;
    const text = escaped.replace(spoilerRegex, (match, inner) => {
        const trimmed = inner.trim();
        if (!trimmed) {
            // Empty / whitespace only -> drop entirely
            return '';
        }
        if (count >= MAX_SPOILERS_PER_MESSAGE) {
            // Cap exceeded -> leave as literal text
            return match;
        }
        count++;
        const capped = trimmed.slice(0, MAX_SPOILER_LENGTH);
        items[String(count)] = capped;
        return `[[spoiler:${count}]]`;
    });

    return { text, items };
}

/**
 * Split text with [[spoiler:N]] tokens into an array of string and { spoilerIndex } parts.
 *
 * @param {string} text
 * @returns {Array<string | { spoilerIndex: number }>}
 */
export function splitSpoilerParts(text) {
    if (typeof text !== 'string' || !text) return [];
    const parts = [];
    const regex = /\[\[spoiler:(\d{1,2})\]\]/g;
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(text)) !== null) {
        if (match.index > lastIndex) {
            parts.push(text.slice(lastIndex, match.index));
        }
        const spoilerIndex = parseInt(match[1], 10);
        parts.push({ spoilerIndex });
        lastIndex = regex.lastIndex;
    }

    if (lastIndex < text.length) {
        parts.push(text.slice(lastIndex));
    }

    return parts;
}

/**
 * Check if text contains any [[spoiler:N]] token.
 *
 * @param {string} text
 * @returns {boolean}
 */
export function hasSpoilerTokens(text) {
    if (typeof text !== 'string' || !text) return false;
    return /\[\[spoiler:\d{1,2}\]\]/.test(text);
}

/**
 * Replace all [[spoiler:N]] tokens with replacement string.
 *
 * @param {string} text
 * @param {string} [replacement='🔒']
 * @returns {string}
 */
export function stripSpoilerTokens(text, replacement = '🔒') {
    if (typeof text !== 'string' || !text) return '';
    return text.replace(/\[\[spoiler:\d{1,2}\]\]/g, replacement);
}

/**
 * Build payload for globalChat/v2/spoilers/$msgId.
 *
 * @param {{ items: Record<string, string>, authorUid: string, timestamp?: number }} params
 * @returns {{ authorUid: string, createdAt: number, items: Record<string, string> }}
 */
export function buildSpoilerPayload({ items, authorUid, timestamp = Date.now() }) {
    if (!items || typeof items !== 'object' || Array.isArray(items) || Object.keys(items).length === 0) {
        throw new Error('buildSpoilerPayload: items must be a non-empty object');
    }
    if (!authorUid || typeof authorUid !== 'string') {
        throw new Error('buildSpoilerPayload: authorUid is required');
    }
    return {
        authorUid,
        createdAt: typeof timestamp === 'number' && timestamp > 0 ? timestamp : Date.now(),
        items
    };
}
