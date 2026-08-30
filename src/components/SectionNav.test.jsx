import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import SectionNav from './SectionNav';

describe('SectionNav component', () => {
    let scrollToSpy;

    beforeEach(() => {
        scrollToSpy = vi.fn();
        window.scrollTo = scrollToSpy;
        window.scrollY = 0;
        window.innerHeight = 800;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('renders all 8 section buttons with correct aria labels', () => {
        render(<SectionNav />);

        const buttons = screen.getAllByRole('button');
        expect(buttons).toHaveLength(8);

        const expectedLabels = [
            'Scroll to Popular on Streamflix',
            'Scroll to Trending Movies Today',
            'Scroll to Trending Movies This Week',
            'Scroll to Trending Anime',
            'Scroll to Top 10',
            'Scroll to Popular Collections',
            'Scroll to Movie Studios',
            'Scroll to Streaming Providers'
        ];

        expectedLabels.forEach(label => {
            expect(screen.getByLabelText(label)).toBeInTheDocument();
        });
    });

    it('starts with hidden state (not visible) when scrollY is 0 (at banner top)', () => {
        window.scrollY = 0;
        const { container } = render(<SectionNav />);
        const nav = container.querySelector('.section-nav');
        expect(nav).not.toHaveClass('visible');
    });

    it('shows when user starts to view div.content-rows and hides when above it', () => {
        const contentRows = document.createElement('div');
        contentRows.className = 'content-rows';
        // Initially positioned below the viewport (e.g. 1000px down)
        let rectTop = 1000;
        vi.spyOn(contentRows, 'getBoundingClientRect').mockImplementation(() => ({
            top: rectTop,
            bottom: rectTop + 1500,
            left: 0,
            right: 1200,
            width: 1200,
            height: 1500
        }));
        document.body.appendChild(contentRows);

        const { container } = render(<SectionNav />);
        const nav = container.querySelector('.section-nav');

        // Above content-rows (in banner / continue-watching)
        window.scrollY = 50;
        rectTop = 950;
        fireEvent.scroll(window);
        expect(nav).not.toHaveClass('visible');

        // User scrolls down and starts to view div.content-rows (top enters viewport <= 800)
        window.scrollY = 300;
        rectTop = 700;
        fireEvent.scroll(window);
        expect(nav).toHaveClass('visible');

        // User scrolls back to top
        window.scrollY = 0;
        rectTop = 1000;
        fireEvent.scroll(window);
        expect(nav).not.toHaveClass('visible');

        document.body.removeChild(contentRows);
    });

    it('smooth scrolls to the targeted element when button is clicked', () => {
        const targetDiv = document.createElement('div');
        targetDiv.setAttribute('data-nav-section', 'popular');
        vi.spyOn(targetDiv, 'getBoundingClientRect').mockReturnValue({
            top: 500,
            bottom: 800,
            left: 0,
            right: 1000,
            width: 1000,
            height: 300
        });
        document.body.appendChild(targetDiv);

        render(<SectionNav />);
        const popularBtn = screen.getByLabelText('Scroll to Popular on Streamflix');

        fireEvent.click(popularBtn);

        expect(scrollToSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                top: expect.any(Number),
                behavior: 'smooth'
            })
        );

        document.body.removeChild(targetDiv);
    });
});
