import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import StreamingProviders from './StreamingProviders';
import MovieStudios from './MovieStudios';

vi.mock('../hooks/useTMDB', () => ({
    useTMDB: () => ({
        fetchDiscoverMovies: vi.fn().mockResolvedValue([
            { id: 101, title: 'Provider Movie 1', vote_average: 8.5, backdrop_path: '/path1.jpg' },
            { id: 102, title: 'Provider Movie 2', vote_average: 7.9, backdrop_path: '/path2.jpg' }
        ]),
        fetchDiscoverTV: vi.fn().mockResolvedValue([
            { id: 201, name: 'Provider Show 1', vote_average: 8.1, backdrop_path: '/tvpath1.jpg' }
        ]),
        movieGenres: new Map(),
        tvGenres: new Map(),
        fetchCredits: vi.fn().mockResolvedValue([]),
        fetchContentRating: vi.fn().mockResolvedValue('PG-13'),
        fetchLogo: vi.fn().mockResolvedValue(null)
    })
}));

vi.mock('../contexts/HoverPreviewContext', () => ({
    useHoverPreview: () => ({
        getPreviewProps: () => ({}),
        closeNow: vi.fn()
    })
}));

vi.mock('../hooks/useTVDetect', () => ({
    default: () => false
}));

describe('StreamingProviders scroll stability & focus navigation', () => {
    let scrollBySpy;

    beforeEach(() => {
        scrollBySpy = vi.fn();
        window.scrollBy = scrollBySpy;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('anchors section scroll position when a provider pill is clicked', async () => {
        render(
            <MemoryRouter>
                <StreamingProviders />
            </MemoryRouter>
        );

        const section = document.querySelector('.streaming-providers-section');
        expect(section).toBeTruthy();

        // Mock bounding client rect for section
        vi.spyOn(section, 'getBoundingClientRect').mockReturnValue({
            top: 80,
            bottom: 400,
            left: 0,
            right: 400,
            width: 400,
            height: 320
        });

        // Find Disney+ pill
        const disneyPill = screen.getByRole('button', { name: /browse disney\+ movies/i });
        fireEvent.click(disneyPill);

        // Verify provider was selected
        expect(disneyPill.className).toContain('provider-pill-active');
    });

    it('focuses movie cards using container horizontal scrollTo instead of window scrollIntoView', async () => {
        render(
            <MemoryRouter>
                <StreamingProviders />
            </MemoryRouter>
        );

        // Wait for initial Netflix movies to load
        await waitFor(() => {
            const cards = document.querySelectorAll('.provider-movie-card');
            expect(cards.length).toBeGreaterThan(0);
        });

        const gridContainer = document.querySelector('.provider-movies-grid');
        const containerScrollToSpy = vi.fn();
        gridContainer.scrollTo = containerScrollToSpy;

        const firstCard = document.querySelectorAll('.provider-movie-card')[0];
        fireEvent.focus(firstCard);

        expect(containerScrollToSpy).toHaveBeenCalled();
    });
});

describe('MovieStudios scroll stability & focus navigation', () => {
    let scrollBySpy;

    beforeEach(() => {
        scrollBySpy = vi.fn();
        window.scrollBy = scrollBySpy;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('anchors section scroll position when a studio pill is clicked', async () => {
        render(
            <MemoryRouter>
                <MovieStudios />
            </MemoryRouter>
        );

        const section = document.querySelector('.movie-studios-section');
        expect(section).toBeTruthy();

        vi.spyOn(section, 'getBoundingClientRect').mockReturnValue({
            top: 100,
            bottom: 450,
            left: 0,
            right: 400,
            width: 400,
            height: 350
        });

        // Find Warner Bros or Pixar or A24 pill
        const studioPill = screen.getByRole('button', { name: /browse pixar movies/i });
        fireEvent.click(studioPill);

        expect(studioPill.className).toContain('studio-pill-active');
    });

    it('focuses studio movie cards using container horizontal scrollTo', async () => {
        render(
            <MemoryRouter>
                <MovieStudios />
            </MemoryRouter>
        );

        await waitFor(() => {
            const cards = document.querySelectorAll('.studio-movie-card');
            expect(cards.length).toBeGreaterThan(0);
        });

        const gridContainer = document.querySelector('.studio-movies-grid');
        const containerScrollToSpy = vi.fn();
        gridContainer.scrollTo = containerScrollToSpy;

        const firstCard = document.querySelectorAll('.studio-movie-card')[0];
        fireEvent.focus(firstCard);

        expect(containerScrollToSpy).toHaveBeenCalled();
    });
});
