import React from 'react';
import './MusicHomeSkeleton.css';

const MusicHomeSkeleton = () => {
    return (
        <div className="music-home-skeleton">
            {/* Hero Skeleton */}
            <section className="music-home-skeleton__hero">
                <div className="music-home-skeleton__content">
                    <div className="music-home-skeleton__title-wrapper">
                        <div className="skeleton-pulse music-home-skeleton__title"></div>
                        <div className="skeleton-pulse music-home-skeleton__version"></div>
                    </div>
                    <div className="skeleton-pulse music-home-skeleton__slogan"></div>
                </div>
            </section>

            {/* Search Interface Skeleton */}
            <section className="music-home-skeleton__search">
                <div className="music-home-skeleton__input-wrapper">
                    <div className="skeleton-pulse music-home-skeleton__input"></div>
                    <div className="skeleton-pulse music-home-skeleton__settings"></div>
                </div>

                <div className="music-home-skeleton__tabs">
                    <div className="skeleton-pulse music-home-skeleton__tab"></div>
                    <div className="skeleton-pulse music-home-skeleton__tab"></div>
                    <div className="skeleton-pulse music-home-skeleton__tab"></div>
                    <div className="skeleton-pulse music-home-skeleton__tab"></div>
                </div>
            </section>
        </div>
    );
};

export default MusicHomeSkeleton;
