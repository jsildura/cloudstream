/**
 * Chat Slash Commands — Registry, Parser & Static Content
 *
 * Defines the available slash commands, filtering/matching helpers, and static
 * content builders for /help and /rules. The /faq command is dynamic — its
 * content is fetched from Firebase and passed in at execution time.
 *
 * This module is pure logic (no React) so it can be unit-tested in isolation.
 */

// ─── Command Registry ───────────────────────────────────────────────────────

export const CHAT_COMMANDS = [
    {
        command: '/faq',
        label: 'Frequently Asked Questions',
        description: 'View common questions and answers about StreamFlix',
        icon: '❔',
        type: 'dynamic'
    },
    {
        command: '/help',
        label: 'Show available commands',
        description: 'List all slash commands you can use',
        icon: '💡',
        type: 'static'
    },
    {
        command: '/rules',
        label: 'Chat rules',
        description: 'View the community chat guidelines',
        icon: '📝',
        type: 'static'
    },
    {
        command: '/spoiler',
        label: 'Hide message',
        description: 'Hide content until a recipient replies',
        icon: '🔒',
        type: 'insert'
    }
];

// ─── Parser Helpers ─────────────────────────────────────────────────────────

/**
 * Returns true when the input text looks like a slash-command in progress
 * (starts with `/` and contains no whitespace after the slash).
 */
export function isCommandInput(text) {
    if (!text || typeof text !== 'string') return false;
    return /^\/[a-z]*$/i.test(text.trim());
}

/**
 * Find a slash-command token at caret position (e.g. "/spoiler" in mid-message).
 * Scans backward to whitespace or string start and forward to whitespace or string end.
 *
 * @param {string} text
 * @param {number} caretPos
 * @returns {{ token: string, start: number, end: number, isWholeInput: boolean } | null}
 */
export function findCommandToken(text, caretPos) {
    if (!text || typeof text !== 'string') return null;
    const pos = typeof caretPos === 'number' ? caretPos : text.length;
    if (pos < 0 || pos > text.length) return null;

    // Scan backward to previous whitespace/newline or start of string
    let start = pos;
    while (start > 0 && !/\s/.test(text[start - 1])) {
        start--;
    }

    // Scan forward from pos to whitespace or end of string
    let end = pos;
    while (end < text.length && !/\s/.test(text[end])) {
        end++;
    }

    const token = text.slice(start, end);
    if (!/^\/[a-z]*$/i.test(token)) {
        return null;
    }

    const isWholeInput = text.trim() === token;
    return { token, start, end, isWholeInput };
}

/**
 * Filter the command registry by a partial input string.
 * Input may or may not include the leading `/`.
 * When allowRunnable is false, returns only 'insert' commands.
 *
 *   filterCommands('/f')   → [ { command: '/faq', … } ]
 *   filterCommands('he')   → [ { command: '/help', … } ]
 *   filterCommands('')     → all commands
 *
 * @param {string} input
 * @param {{ allowRunnable?: boolean }} [options={}]
 * @returns {Array}
 */
export function filterCommands(input, { allowRunnable = true } = {}) {
    const raw = (input || '').trim().toLowerCase();
    const query = raw.startsWith('/') ? raw : `/${raw}`;

    let commands = CHAT_COMMANDS;
    if (!allowRunnable) {
        commands = commands.filter(cmd => cmd.type === 'insert');
    }

    if (query === '/') return commands;

    return commands.filter(cmd =>
        cmd.command.startsWith(query)
    );
}

/**
 * Check if text is an exact slash-command match (e.g. "/faq").
 * Returns the matching command object, or null.
 *
 * @param {string} text
 * @returns {Object|null}
 */
export function matchCommand(text) {
    if (!text || typeof text !== 'string') return null;
    const trimmed = text.trim().toLowerCase();
    return CHAT_COMMANDS.find(cmd => cmd.command === trimmed) || null;
}

// ─── Static Content Builders ────────────────────────────────────────────────

/**
 * Build the /help response — auto-generated from the command registry.
 */
export function buildHelpContent() {
    return {
        type: 'help',
        icon: '💡',
        title: 'Available Commands',
        items: CHAT_COMMANDS.map(cmd => ({
            label: cmd.command,
            text: cmd.description
        })),
        timestamp: Date.now()
    };
}

/**
 * Build the /rules response — community guidelines.
 */
export function buildRulesContent() {
    return {
        type: 'rules',
        icon: '📝',
        title: 'Community Chat Rules',
        items: [
            { label: 'Be respectful', text: 'No hate speech, slurs, or personal attacks.' },
            { label: 'No spam', text: 'Don\'t send repeated or meaningless messages.' },
            { label: 'Privacy', text: 'Don\'t share anyone\'s personal information.' },
            { label: 'No NSFW', text: 'Keep all content appropriate for a general audience.' },
            { label: 'No advertising', text: 'Don\'t promote other services or websites.' },
            { label: 'Report issues properly', text: 'Use the Report button (+ menu) — don\'t post bug reports in the chat.' }
        ],
        timestamp: Date.now()
    };
}

/**
 * Build the /faq response from dynamic Firebase data.
 *
 * @param {Array<{question: string, answer: string, order: number}>} faqItems
 * @returns {Object}
 */
export function buildFaqContent(faqItems) {
    const items = (faqItems || [])
        .slice()
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        .map(item => ({
            label: item.question,
            text: item.answer
        }));

    return {
        type: 'faq',
        icon: '❔',
        title: 'Frequently Asked Questions',
        items,
        empty: items.length === 0,
        timestamp: Date.now()
    };
}
