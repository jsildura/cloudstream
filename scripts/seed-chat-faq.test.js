import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DEFAULT_FAQ, parseArgs, validateFaqEntries, buildFaqUpdates, main } from './seed-chat-faq.mjs';
import { MAX_FAQ_QUESTION_LENGTH, MAX_FAQ_ANSWER_LENGTH, MAX_FAQ_ITEMS } from '../src/lib/globalChatModel.js';

const validEntry = (over = {}) => ({ question: 'Q?', answer: 'A.', order: 0, ...over });

describe('seed-chat-faq CLI helpers', () => {
    describe('parseArgs', () => {
        it('defaults to a dry run with no flags', () => {
            expect(parseArgs([])).toEqual({ confirm: null, force: false });
        });

        it('parses --confirm seed', () => {
            expect(parseArgs(['--confirm', 'seed'])).toEqual({ confirm: 'seed', force: false });
        });

        it('parses --force alongside --confirm', () => {
            expect(parseArgs(['--confirm', 'seed', '--force'])).toEqual({ confirm: 'seed', force: true });
        });

        it('throws on a mismatched confirmation token', () => {
            expect(() => parseArgs(['--confirm', 'yes'])).toThrow(/Confirmation must be/i);
        });

        it('throws on a missing --confirm value', () => {
            expect(() => parseArgs(['--confirm'])).toThrow('Missing value for --confirm');
            expect(() => parseArgs(['--confirm', '--force'])).toThrow('Missing value for --confirm');
        });

        it('throws on unknown or duplicate flags', () => {
            expect(() => parseArgs(['--wipe'])).toThrow(/Unknown flag/i);
            expect(() => parseArgs(['--force', '--force'])).toThrow(/Duplicate/i);
            expect(() => parseArgs(['--confirm', 'seed', '--confirm', 'seed'])).toThrow(/Duplicate/i);
        });
    });

    describe('DEFAULT_FAQ', () => {
        it('ships the 8 planned entries', () => {
            expect(DEFAULT_FAQ).toHaveLength(8);
        });

        it('passes its own validation', () => {
            expect(() => validateFaqEntries(DEFAULT_FAQ)).not.toThrow();
        });

        it('uses contiguous zero-based order values', () => {
            expect(DEFAULT_FAQ.map(e => e.order)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
        });
    });

    describe('validateFaqEntries', () => {
        it('rejects an empty or non-array input', () => {
            expect(() => validateFaqEntries([])).toThrow(/non-empty array/i);
            expect(() => validateFaqEntries(null)).toThrow(/non-empty array/i);
        });

        it('rejects more entries than the cap allows', () => {
            const tooMany = Array.from({ length: MAX_FAQ_ITEMS + 1 }, (_, i) => validEntry({ order: i }));
            expect(() => validateFaqEntries(tooMany)).toThrow(/Too many FAQ entries/i);
        });

        it('rejects a missing or blank question or answer', () => {
            expect(() => validateFaqEntries([validEntry({ question: '   ' })])).toThrow(/question is required/i);
            expect(() => validateFaqEntries([validEntry({ question: undefined })])).toThrow(/question is required/i);
            expect(() => validateFaqEntries([validEntry({ answer: '' })])).toThrow(/answer is required/i);
        });

        it('rejects question and answer overruns at the rule caps', () => {
            expect(() => validateFaqEntries([validEntry({ question: 'x'.repeat(MAX_FAQ_QUESTION_LENGTH + 1) })]))
                .toThrow(/question is \d+ chars/i);
            expect(() => validateFaqEntries([validEntry({ answer: 'x'.repeat(MAX_FAQ_ANSWER_LENGTH + 1) })]))
                .toThrow(/answer is \d+ chars/i);
        });

        it('accepts question and answer exactly at the caps', () => {
            expect(() => validateFaqEntries([validEntry({
                question: 'x'.repeat(MAX_FAQ_QUESTION_LENGTH),
                answer: 'y'.repeat(MAX_FAQ_ANSWER_LENGTH)
            })])).not.toThrow();
        });

        it('rejects a non-numeric, negative, or duplicated order', () => {
            expect(() => validateFaqEntries([validEntry({ order: '0' })])).toThrow(/order must be a number/i);
            expect(() => validateFaqEntries([validEntry({ order: -1 })])).toThrow(/order must be a number/i);
            expect(() => validateFaqEntries([validEntry({ order: 0 }), validEntry({ order: 0 })])).toThrow(/duplicate order/i);
        });

        it('rejects extra keys the RTDB rules would reject', () => {
            expect(() => validateFaqEntries([validEntry({ pinned: true })])).toThrow(/unexpected keys/i);
        });
    });

    describe('buildFaqUpdates', () => {
        it('maps each entry to a generated key, dropping nothing', () => {
            let n = 0;
            const updates = buildFaqUpdates(DEFAULT_FAQ, () => `key-${n++}`);
            expect(Object.keys(updates)).toHaveLength(DEFAULT_FAQ.length);
            expect(updates['key-0']).toEqual(DEFAULT_FAQ[0]);
            expect(updates['key-7']).toEqual(DEFAULT_FAQ[7]);
        });

        it('writes only the three rule-permitted fields', () => {
            const updates = buildFaqUpdates([validEntry()], () => 'k1');
            expect(Object.keys(updates.k1).sort()).toEqual(['answer', 'order', 'question']);
        });

        it('validates before building', () => {
            expect(() => buildFaqUpdates([validEntry({ answer: '' })], () => 'k1')).toThrow(/answer is required/i);
        });

        it('throws on an invalid or duplicate generated key', () => {
            expect(() => buildFaqUpdates([validEntry()], () => null)).toThrow(/invalid key/i);
            expect(() => buildFaqUpdates([validEntry({ order: 0 }), validEntry({ order: 1 })], () => 'same'))
                .toThrow(/duplicate key/i);
        });
    });

    describe('main write path', () => {
        /** Minimal stand-in for a firebase-admin RTDB ref. */
        const fakeRef = (initial = {}) => {
            let node = { ...initial };
            let pushed = 0;
            return {
                calls: [],
                read: () => node,
                push() { return { key: `-fakePushKey${String(pushed++).padStart(8, '0')}` }; },
                once() {
                    const keys = Object.keys(node);
                    return Promise.resolve({
                        exists: () => keys.length > 0,
                        numChildren: () => keys.length
                    });
                },
                update(obj) { this.calls.push(['update', obj]); node = { ...node, ...obj }; return Promise.resolve(); },
                set(obj) { this.calls.push(['set', obj]); node = { ...obj }; return Promise.resolve(); }
            };
        };

        beforeEach(() => vi.spyOn(console, 'log').mockImplementation(() => {}));
        afterEach(() => vi.restoreAllMocks());

        it('never connects on a dry run', async () => {
            const connect = vi.fn();
            const result = await main([], { connect });
            expect(connect).not.toHaveBeenCalled();
            expect(result).toEqual({ written: 0, replaced: 0, dryRun: true });
        });

        it('update()s all 8 entries into an empty node', async () => {
            const ref = fakeRef();
            const result = await main(['--confirm', 'seed'], { connect: async () => ref });

            expect(result).toEqual({ written: 8, replaced: 0, dryRun: false });
            expect(ref.calls).toHaveLength(1);
            const [op, payload] = ref.calls[0];
            expect(op).toBe('update');
            expect(Object.keys(payload)).toHaveLength(8);
            expect(Object.values(payload).map(e => e.order).sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
            expect(Object.values(payload).every(e => Object.keys(e).sort().join('|') === 'answer|order|question')).toBe(true);
        });

        it('refuses to touch a non-empty node without --force', async () => {
            const ref = fakeRef({ existing1: validEntry(), existing2: validEntry({ order: 1 }) });
            await expect(main(['--confirm', 'seed'], { connect: async () => ref }))
                .rejects.toThrow(/already has 2 entries.*--force/s);
            expect(ref.calls).toHaveLength(0);
        });

        it('set()s a replacement node with --force, leaving no stale entries', async () => {
            const ref = fakeRef({ stale: validEntry({ question: 'Old?' }) });
            const result = await main(['--confirm', 'seed', '--force'], { connect: async () => ref });

            expect(result).toEqual({ written: 8, replaced: 1, dryRun: false });
            const [op, payload] = ref.calls[0];
            expect(op).toBe('set');
            expect(Object.keys(ref.read())).toHaveLength(8);
            expect(Object.keys(payload)).not.toContain('stale');
            expect(Object.values(ref.read()).map(e => e.question)).not.toContain('Old?');
        });

        it('rejects a bad confirmation token before connecting', async () => {
            const connect = vi.fn();
            await expect(main(['--confirm', 'yes'], { connect })).rejects.toThrow(/Confirmation must be/i);
            expect(connect).not.toHaveBeenCalled();
        });
    });
});
