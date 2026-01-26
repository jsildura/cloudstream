import React from 'react';
import { useNavigate } from 'react-router-dom';
import SearchInterface from '../../components/music/SearchInterface';
import MusicHomeSkeleton from '../../components/music/skeletons/MusicHomeSkeleton';
import './MusicHome.css';

/**
 * MusicHome - Home page for /music route
 * 
 * Ported from tidal-ui/src/routes/+page.svelte
 * Contains:
 * - Hero section with branding
 * - SearchInterface component
 */

const APP_VERSION = '1.0.0';

const MusicHome = () => {
    const navigate = useNavigate();

    const handleNavigate = (path) => {
        navigate(path);
    };

    // No artificial delay - render immediately
    // SearchInterface handles its own loading states for search operations

    return (
        <div className="music-home">
            {/* Hero Section */}
            <section className="music-home__hero">
                <div className="music-home__hero-content">
                    <div className="music-home__title-wrapper">
                        <h1 className="music-home__title">Streamflix Music</h1>
                        <span className="music-home__version">{APP_VERSION}</span>
                    </div>
                    <p className="music-home__slogan">
                        Stream and download lossless music in Hi-Res, CD quality, and more
                    </p>
                </div>
            </section>

            {/* Search Interface */}
            <section className="music-home__search">
                <SearchInterface onNavigate={handleNavigate} />
            </section>
        </div>
    );
};

export default MusicHome;
