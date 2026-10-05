import React, { Suspense } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { lazyRetry } from './lazyRetry';

describe('lazyRetry', () => {
    beforeEach(() => {
        sessionStorage.clear();
        vi.clearAllTimers();
    });

    it('loads successfully on the first attempt', async () => {
        const MockComp = () => <div>Lazy Loaded First Time</div>;
        const loader = vi.fn().mockResolvedValue({ default: MockComp });
        const LazyComp = lazyRetry(loader);

        render(
            <Suspense fallback={<div>Loading...</div>}>
                <LazyComp />
            </Suspense>
        );

        expect(screen.getByText('Loading...')).toBeInTheDocument();
        await waitFor(() => {
            expect(screen.getByText('Lazy Loaded First Time')).toBeInTheDocument();
        });
        expect(loader).toHaveBeenCalledTimes(1);
    });

    it('retries once when first load fails and succeeds on retry', async () => {
        const MockComp = () => <div>Loaded After Retry</div>;
        let attempts = 0;
        const loader = vi.fn().mockImplementation(() => {
            attempts++;
            if (attempts === 1) {
                return Promise.reject(new Error('Network hitch'));
            }
            return Promise.resolve({ default: MockComp });
        });

        const LazyComp = lazyRetry(loader);

        render(
            <Suspense fallback={<div>Loading...</div>}>
                <LazyComp />
            </Suspense>
        );

        await waitFor(() => {
            expect(screen.getByText('Loaded After Retry')).toBeInTheDocument();
        }, { timeout: 3000 });

        expect(loader).toHaveBeenCalledTimes(2);
    });

    it('triggers window.reload on persistent failure if not yet reloaded', async () => {
        const originalLocation = window.location;
        const reloadMock = vi.fn();
        delete window.location;
        window.location = {
            pathname: '/test-route',
            reload: reloadMock
        };

        const loader = vi.fn().mockRejectedValue(new Error('Chunk missing (404)'));
        const LazyComp = lazyRetry(loader);

        render(
            <Suspense fallback={<div>Loading...</div>}>
                <LazyComp />
            </Suspense>
        );

        await waitFor(() => {
            expect(reloadMock).toHaveBeenCalledTimes(1);
        }, { timeout: 3000 });

        expect(sessionStorage.getItem('chunk_reload_/test-route')).toBe('1');
        window.location = originalLocation;
    });
});
