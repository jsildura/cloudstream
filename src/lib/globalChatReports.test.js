import { describe, it, expect } from 'vitest';
import {
    REPORT_STATUSES,
    REPORT_FILTERS,
    reportStatus,
    filterReports,
    summarizeUA
} from './globalChatReports';

describe('reportStatus', () => {
    it('passes through the three states the rules validate', () => {
        expect(REPORT_STATUSES).toEqual(['pending', 'resolved', 'dismissed']);
        REPORT_STATUSES.forEach(s => expect(reportStatus({ status: s })).toBe(s));
    });

    // A report written before the status field existed is still awaiting triage.
    it('treats a missing or unknown status as pending', () => {
        [{}, { status: null }, { status: 'archived' }, { status: 42 }, null, undefined, 'nope']
            .forEach(r => expect(reportStatus(r)).toBe('pending'));
    });
});

describe('filterReports', () => {
    const a = { id: 'a', timestamp: 3000 };
    const b = { id: 'b', timestamp: 1000, status: 'resolved' };
    const c = { id: 'c', timestamp: 2000, status: 'dismissed' };
    const all = [b, a, c];

    it('offers All alongside the three statuses', () => {
        expect(REPORT_FILTERS).toEqual(['pending', 'resolved', 'dismissed', 'all']);
    });

    it('filters by status, counting a legacy report as pending', () => {
        expect(filterReports(all, 'pending').map(r => r.id)).toEqual(['a']);
        expect(filterReports(all, 'resolved').map(r => r.id)).toEqual(['b']);
        expect(filterReports(all, 'dismissed').map(r => r.id)).toEqual(['c']);
    });

    it('returns everything newest-first under the All filter', () => {
        expect(filterReports(all, 'all').map(r => r.id)).toEqual(['a', 'c', 'b']);
    });

    it('falls back to createdAt when there is no timestamp', () => {
        const list = [{ id: 'x', createdAt: 1 }, { id: 'y', createdAt: 9 }];
        expect(filterReports(list, 'all').map(r => r.id)).toEqual(['y', 'x']);
    });

    it('does not mutate the input array', () => {
        const input = [b, a, c];
        filterReports(input, 'all');
        expect(input.map(r => r.id)).toEqual(['b', 'a', 'c']);
    });

    it('tolerates a missing or non-array input', () => {
        [null, undefined, 'nope', 42].forEach(v => expect(filterReports(v, 'all')).toEqual([]));
    });
});

describe('summarizeUA', () => {
    it('names browser and OS', () => {
        expect(summarizeUA('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'))
            .toBe('Chrome on Windows');
        expect(summarizeUA('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'))
            .toBe('Safari on Mac OS X');
    });

    it('falls back to Unknown for both parts and returns empty for no input', () => {
        expect(summarizeUA('SomeWeirdAgent/1.0')).toBe('Unknown browser on Unknown OS');
        expect(summarizeUA('')).toBe('');
    });
});
