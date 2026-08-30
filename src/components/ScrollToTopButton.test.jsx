import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import ScrollToTopButton from './ScrollToTopButton';

describe('ScrollToTopButton component', () => {
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

    it('renders the scroll to top button', () => {
        render(<ScrollToTopButton />);
        const button = screen.getByRole('button', { name: /scroll to top/i });
        expect(button).toBeInTheDocument();
        expect(button).not.toHaveClass('visible');
    });

    it('shows when user starts to view div.content-rows and hides when scrolled above it', () => {
        const contentRows = document.createElement('div');
        contentRows.className = 'content-rows';
        let rectTop = 1100;
        vi.spyOn(contentRows, 'getBoundingClientRect').mockImplementation(() => ({
            top: rectTop,
            bottom: rectTop + 2000,
            left: 0,
            right: 1200,
            width: 1200,
            height: 2000
        }));
        document.body.appendChild(contentRows);

        render(<ScrollToTopButton />);
        const button = screen.getByRole('button', { name: /scroll to top/i });

        // Above content-rows (in banner / continue watching)
        window.scrollY = 80;
        rectTop = 1020;
        fireEvent.scroll(window);
        expect(button).not.toHaveClass('visible');

        // User starts to view div.content-rows (top enters viewport <= 800)
        window.scrollY = 350;
        rectTop = 750;
        fireEvent.scroll(window);
        expect(button).toHaveClass('visible');

        // User scrolls back to top
        window.scrollY = 0;
        rectTop = 1100;
        fireEvent.scroll(window);
        expect(button).not.toHaveClass('visible');

        document.body.removeChild(contentRows);
    });

    it('scrolls to top smoothly when clicked', () => {
        render(<ScrollToTopButton />);
        const button = screen.getByRole('button', { name: /scroll to top/i });

        fireEvent.click(button);

        expect(scrollToSpy).toHaveBeenCalledWith({
            top: 0,
            behavior: 'smooth'
        });
    });
});
