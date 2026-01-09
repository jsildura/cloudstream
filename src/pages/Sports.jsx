import React, { useState, useEffect, useRef, useCallback } from 'react';
import MatchCard from '../components/MatchCard';
import './Sports.css';

/**
 * Sports Page Component
 * Displays live sports matches from streami.su API
 * Sections: Live Now, Today's Matches, Popular, Category-specific
 */
const Sports = () => {
    // API Configuration
    const API_BASE = 'https://streami.su/api';

    // State
    const [sports, setSports] = useState([]);
    const [liveMatches, setLiveMatches] = useState([]);
    const [todayMatches, setTodayMatches] = useState([]);
    const [popularMatches, setPopularMatches] = useState([]);
    const [categoryMatches, setCategoryMatches] = useState({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Carousel refs for scroll functionality
    const carouselRefs = useRef({});

    // Fetch helper with error handling
    const fetchApi = useCallback(async (endpoint) => {
        try {
            const response = await fetch(`${API_BASE}${endpoint}`);
            if (!response.ok) {
                throw new Error(`API Error: ${response.status}`);
            }
            return await response.json();
        } catch (err) {
            console.error(`Failed to fetch ${endpoint}:`, err);
            return [];
        }
    }, []);

    // Load all data on mount
    useEffect(() => {
        const loadData = async () => {
            setLoading(true);
            setError(null);

            try {
                // Fetch sports categories first
                const sportsData = await fetchApi('/sports');
                setSports(sportsData || []);

                // Fetch main sections in parallel
                const [live, today, popular] = await Promise.all([
                    fetchApi('/matches/live'),
                    fetchApi('/matches/all-today'),
                    fetchApi('/matches/all/popular')
                ]);

                setLiveMatches(live || []);
                setTodayMatches(today || []);
                setPopularMatches(popular || []);

                // Fetch category-specific matches for top sports
                const topCategories = ['football', 'basketball', 'hockey', 'american-football', 'baseball', 'tennis'];
                const categoryData = {};

                await Promise.all(
                    topCategories.map(async (category) => {
                        const matches = await fetchApi(`/matches/${category}`);
                        if (matches && matches.length > 0) {
                            categoryData[category] = matches;
                        }
                    })
                );

                setCategoryMatches(categoryData);
            } catch (err) {
                console.error('Failed to load sports data:', err);
                setError('Failed to load sports data. Please try again.');
            } finally {
                setLoading(false);
            }
        };

        loadData();
    }, [fetchApi]);

    // Carousel scroll handlers
    const scrollCarousel = (sectionId, direction) => {
        const container = carouselRefs.current[sectionId];
        if (!container) return;

        const scrollAmount = container.clientWidth * 0.8;
        container.scrollBy({
            left: direction === 'left' ? -scrollAmount : scrollAmount,
            behavior: 'smooth'
        });
    };

    // Format category name for display
    const formatCategoryName = (category) => {
        return category
            .split('-')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
    };

    // Render a match section with carousel
    const renderSection = (title, matches, sectionId) => {
        if (!matches || matches.length === 0) return null;

        return (
            <section className="sports-section" key={sectionId}>
                <div className="section-header">
                    <div className="section-title-wrapper">
                        <h2 className="section-title">{title}</h2>
                        <span className="section-count">{matches.length}</span>
                    </div>
                    <div className="section-nav">
                        <span className="section-page">
                            1 / {Math.ceil(matches.length / 5)}
                        </span>
                        <button
                            className="nav-btn"
                            onClick={() => scrollCarousel(sectionId, 'left')}
                            aria-label="Scroll left"
                        >
                            ←
                        </button>
                        <button
                            className="nav-btn"
                            onClick={() => scrollCarousel(sectionId, 'right')}
                            aria-label="Scroll right"
                        >
                            →
                        </button>
                    </div>
                </div>
                <div
                    className="matches-carousel"
                    ref={el => carouselRefs.current[sectionId] = el}
                >
                    {matches.map((match) => (
                        <MatchCard key={match.id} match={match} />
                    ))}
                </div>
            </section>
        );
    };


    // Loading state
    if (loading) {
        return (
            <div className="sports-page">
                <div className="sports-loading">
                    <div className="loading-spinner" />
                    <p>Loading sports matches...</p>
                </div>
            </div>
        );
    }

    // Error state
    if (error) {
        return (
            <div className="sports-page">
                <div className="sports-error">
                    <p>{error}</p>
                    <button onClick={() => window.location.reload()}>
                        Retry
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="sports-page">
            {/* Page Header */}
            <header className="sports-header">
                <div className="sports-header-content">
                    <div className="header-text">
                        <h1>Sports Matches</h1>
                        <p>Stream global sports, matches, and tournaments in real-time. Your front-row seat to every game, anywhere in the world.</p>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="sports-content">
                {/* Live Now Section */}
                {renderSection('Live Now', liveMatches, 'live')}

                {/* Today's Matches Section */}
                {renderSection("Today's Matches", todayMatches, 'today')}

                {/* Popular Matches Section */}
                {renderSection('Popular Matches', popularMatches, 'popular')}

                {/* Category-specific Sections */}
                {Object.entries(categoryMatches).map(([category, matches]) => (
                    renderSection(
                        `${formatCategoryName(category)} Matches`,
                        matches,
                        category
                    )
                ))}
            </main>
        </div>
    );
};

export default Sports;
