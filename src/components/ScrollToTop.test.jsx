import { render } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import ScrollToTop from './ScrollToTop';

describe('ScrollToTop component', () => {
    let scrollToSpy;

    beforeEach(() => {
        scrollToSpy = vi.fn();
        window.scrollTo = scrollToSpy;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('resets window scroll to (0, 0) on standard navigation without scrollToSection', () => {
        render(
            <MemoryRouter initialEntries={['/discover']}>
                <ScrollToTop />
            </MemoryRouter>
        );

        expect(scrollToSpy).toHaveBeenCalledWith(0, 0);
    });

    it('skips resetting window scroll to (0, 0) when scrollToSection is in location.state', () => {
        render(
            <MemoryRouter initialEntries={[{ pathname: '/', state: { scrollToSection: 'studios' } }]}>
                <ScrollToTop />
            </MemoryRouter>
        );

        expect(scrollToSpy).not.toHaveBeenCalledWith(0, 0);
    });

    it('skips resetting window scroll to (0, 0) when navigating back from collections', () => {
        render(
            <MemoryRouter initialEntries={[{ pathname: '/', state: { scrollToSection: 'collections' } }]}>
                <ScrollToTop />
            </MemoryRouter>
        );

        expect(scrollToSpy).not.toHaveBeenCalledWith(0, 0);
    });
});
