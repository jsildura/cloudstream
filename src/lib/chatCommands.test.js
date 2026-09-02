import { describe, it, expect } from 'vitest';
import {
    CHAT_COMMANDS,
    isCommandInput,
    findCommandToken,
    filterCommands,
    matchCommand,
    buildHelpContent,
    buildRulesContent,
    buildFaqContent
} from './chatCommands';

describe('chatCommands', () => {
    describe('CHAT_COMMANDS registry', () => {
        it('contains /faq, /help, /rules, and /spoiler', () => {
            const commands = CHAT_COMMANDS.map(c => c.command);
            expect(commands).toContain('/faq');
            expect(commands).toContain('/help');
            expect(commands).toContain('/rules');
            expect(commands).toContain('/spoiler');

            const spoiler = CHAT_COMMANDS.find(c => c.command === '/spoiler');
            expect(spoiler.type).toBe('insert');
            expect(spoiler.icon).toBe('🔒');
        });
    });

    describe('isCommandInput', () => {
        it('identifies slash-command input in progress', () => {
            expect(isCommandInput('/help')).toBe(true);
            expect(isCommandInput('/spoiler')).toBe(true);
            expect(isCommandInput('/f')).toBe(true);
            expect(isCommandInput('/')).toBe(true);
            expect(isCommandInput('hello /help')).toBe(false);
            expect(isCommandInput('/help extra')).toBe(false);
            expect(isCommandInput('')).toBe(false);
            expect(isCommandInput(null)).toBe(false);
        });
    });

    describe('findCommandToken', () => {
        it('finds whole input command token', () => {
            const token = findCommandToken('/spoiler', 8);
            expect(token).toEqual({
                token: '/spoiler',
                start: 0,
                end: 8,
                isWholeInput: true
            });
        });

        it('finds mid-message command token', () => {
            const text = 'Here is /spoi in text';
            const caret = 13; // after /spoi
            const token = findCommandToken(text, caret);
            expect(token).toEqual({
                token: '/spoi',
                start: 8,
                end: 13,
                isWholeInput: false
            });
        });

        it('returns null if token does not start with slash or contains spaces', () => {
            expect(findCommandToken('hello world', 5)).toBe(null);
            expect(findCommandToken('hello notslash', 10)).toBe(null);
            expect(findCommandToken('hello /spoiler', 14)).toEqual({
                token: '/spoiler',
                start: 6,
                end: 14,
                isWholeInput: false
            });
        });

        it('handles boundary and invalid inputs safely', () => {
            expect(findCommandToken('', 0)).toBe(null);
            expect(findCommandToken(null, 0)).toBe(null);
            expect(findCommandToken('/test', -1)).toBe(null);
            expect(findCommandToken('/test', 99)).toBe(null);
        });
    });

    describe('filterCommands', () => {
        it('filters all matching commands when allowRunnable is true', () => {
            const filtered = filterCommands('/f');
            expect(filtered.map(c => c.command)).toEqual(['/faq']);

            const all = filterCommands('/');
            expect(all.length).toBe(CHAT_COMMANDS.length);
        });

        it('filters only insert commands when allowRunnable is false', () => {
            const filteredAll = filterCommands('/', { allowRunnable: false });
            expect(filteredAll.map(c => c.command)).toEqual(['/spoiler']);

            const filteredFaq = filterCommands('/f', { allowRunnable: false });
            expect(filteredFaq).toEqual([]);

            const filteredSpoiler = filterCommands('/sp', { allowRunnable: false });
            expect(filteredSpoiler.map(c => c.command)).toEqual(['/spoiler']);
        });
    });

    describe('matchCommand', () => {
        it('matches exact command strings', () => {
            expect(matchCommand('/faq')?.command).toBe('/faq');
            expect(matchCommand('/spoiler')?.command).toBe('/spoiler');
            expect(matchCommand('/unknown')).toBe(null);
            expect(matchCommand('')).toBe(null);
        });
    });

    describe('content builders', () => {
        it('buildHelpContent returns help structure', () => {
            const help = buildHelpContent();
            expect(help.type).toBe('help');
            expect(help.items.length).toBe(CHAT_COMMANDS.length);
        });

        it('buildRulesContent returns rules structure', () => {
            const rules = buildRulesContent();
            expect(rules.type).toBe('rules');
            expect(rules.items.length).toBeGreaterThan(0);
        });

        it('buildFaqContent sorts items by order', () => {
            const faq = buildFaqContent([
                { question: 'Q2', answer: 'A2', order: 2 },
                { question: 'Q1', answer: 'A1', order: 1 }
            ]);
            expect(faq.items[0].label).toBe('Q1');
            expect(faq.items[1].label).toBe('Q2');
        });
    });
});
