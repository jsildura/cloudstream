import { useState, useEffect, useCallback } from 'react';
import './SectionNav.css';

const SECTIONS = [
    {
        id: 'popular',
        label: 'Popular on Streamflix',
        selector: '[data-nav-section="popular"], .popular-streamflix-section'
    },
    {
        id: 'trending-today',
        label: 'Trending Movies Today',
        selector: '[data-nav-section="trending-today"], .trending-section[data-time-window="day"]'
    },
    {
        id: 'trending-week',
        label: 'Trending Movies This Week',
        selector: '[data-nav-section="trending-week"], .trending-section[data-time-window="week"]'
    },
    {
        id: 'trending-anime',
        label: 'Trending Anime',
        selector: '[data-nav-section="trending-anime"]'
    },
    {
        id: 'top-ten',
        label: 'Top 10',
        selector: '[data-nav-section="top-ten"], .top-ten-section'
    },
    {
        id: 'collections',
        label: 'Popular Collections',
        selector: '[data-nav-section="collections"], .popular-collections'
    },
    {
        id: 'studios',
        label: 'Movie Studios',
        selector: '[data-nav-section="studios"], .movie-studios-section'
    },
    {
        id: 'streaming-providers',
        label: 'Streaming Providers',
        selector: '[data-nav-section="streaming-providers"], .streaming-providers-section'
    }
];

const SectionNav = () => {
    const [isVisible, setIsVisible] = useState(false);
    const [activeSection, setActiveSection] = useState('');

    // Handle visibility: show when user starts to view div.content-rows, hide when above it
    // (exact same behavior as button.scroll-to-top-btn.visible)
    useEffect(() => {
        const handleScroll = () => {
            const contentRows = document.querySelector('.content-rows');
            if (contentRows) {
                const rect = contentRows.getBoundingClientRect();
                // Show when user starts to view div.content-rows
                setIsVisible(rect.top <= window.innerHeight && window.scrollY > 0);
            } else {
                setIsVisible(window.scrollY > 150);
            }
        };

        window.addEventListener('scroll', handleScroll, { passive: true });
        window.addEventListener('resize', handleScroll, { passive: true });
        handleScroll();

        return () => {
            window.removeEventListener('scroll', handleScroll);
            window.removeEventListener('resize', handleScroll);
        };
    }, []);

    // Track active section based on current scroll position
    useEffect(() => {
        let ticking = false;

        const updateActiveSection = () => {
            const navbarOffset = 80;
            const scrollBottom = window.innerHeight + window.scrollY;
            const docHeight = document.documentElement.scrollHeight;

            // When scrolled to the bottom of the page, activate the last available section
            if (scrollBottom >= docHeight - 80) {
                for (let i = SECTIONS.length - 1; i >= 0; i--) {
                    const el = document.querySelector(SECTIONS[i].selector);
                    if (el) {
                        setActiveSection(SECTIONS[i].id);
                        return;
                    }
                }
            }

            // Focal line at 35% of viewport height
            const focalPoint = window.innerHeight * 0.35;
            let candidateId = '';
            let minDistance = Infinity;

            for (const section of SECTIONS) {
                const el = document.querySelector(section.selector);
                if (!el) continue;

                const rect = el.getBoundingClientRect();

                // Section covers or is currently intersecting the focal line
                if (rect.top <= focalPoint && rect.bottom >= navbarOffset) {
                    candidateId = section.id;
                } else if (!candidateId && rect.top > navbarOffset && rect.top < window.innerHeight * 0.75) {
                    const dist = Math.abs(rect.top - focalPoint);
                    if (dist < minDistance) {
                        minDistance = dist;
                        candidateId = section.id;
                    }
                }
            }

            if (candidateId) {
                setActiveSection(candidateId);
            }
        };

        const onScroll = () => {
            if (!ticking) {
                window.requestAnimationFrame(() => {
                    updateActiveSection();
                    ticking = false;
                });
                ticking = true;
            }
        };

        window.addEventListener('scroll', onScroll, { passive: true });
        updateActiveSection();

        return () => window.removeEventListener('scroll', onScroll);
    }, []);

    const scrollToSection = useCallback((e, selector) => {
        e.preventDefault();
        const el = document.querySelector(selector);
        if (!el) return;

        const navbarOffset = 70;
        const elementPosition = el.getBoundingClientRect().top;
        const offsetPosition = elementPosition + window.scrollY - navbarOffset;

        window.scrollTo({
            top: Math.max(0, offsetPosition),
            behavior: 'smooth'
        });
    }, []);

    return (
        <nav
            className={`section-indicators section-nav ${isVisible ? 'visible' : ''}`}
            aria-label="Section navigation shortcuts"
        >
            {SECTIONS.map((section) => {
                const isActive = activeSection === section.id;
                return (
                    <button
                        key={section.id}
                        className={`section-indicator ${isActive ? 'active' : ''}`}
                        onClick={(e) => scrollToSection(e, section.selector)}
                        aria-label={`Scroll to ${section.label}`}
                        aria-current={isActive ? 'true' : undefined}
                    >
                        <span className="section-indicator-tooltip" role="tooltip">
                            {section.label}
                        </span>
                    </button>
                );
            })}
        </nav>
    );
};

export default SectionNav;
