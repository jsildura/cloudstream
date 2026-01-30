import React from 'react';

/**
 * MediaTypeToggle - A toggle button group for switching between Movies and TV Shows
 * @param {string} activeType - Current active type: 'movie' or 'tv'
 * @param {function} onToggle - Callback when type changes, receives 'movie' or 'tv'
 */
const MediaTypeToggle = ({ activeType, onToggle }) => {
    return (
        <div className="media-type-toggle">
            <button
                className={`media-type-btn ${activeType === 'movie' ? 'active' : ''}`}
                onClick={() => onToggle('movie')}
                aria-pressed={activeType === 'movie'}
            >
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"></rect>
                    <line x1="7" y1="2" x2="7" y2="22"></line>
                    <line x1="17" y1="2" x2="17" y2="22"></line>
                    <line x1="2" y1="12" x2="22" y2="12"></line>
                    <line x1="2" y1="7" x2="7" y2="7"></line>
                    <line x1="2" y1="17" x2="7" y2="17"></line>
                    <line x1="17" y1="7" x2="22" y2="7"></line>
                    <line x1="17" y1="17" x2="22" y2="17"></line>
                </svg>
                <span className="media-label">Movies</span>
            </button>
            <button
                className={`media-type-btn ${activeType === 'tv' ? 'active' : ''}`}
                onClick={() => onToggle('tv')}
                aria-pressed={activeType === 'tv'}
            >
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="7" width="20" height="15" rx="2" ry="2"></rect>
                    <polyline points="17 2 12 7 7 2"></polyline>
                </svg>
                <span className="media-label">TV Shows</span>
            </button>
        </div>
    );
};

export default MediaTypeToggle;
