import React from 'react';
import { useNavigate } from 'react-router-dom';
import './CollectionCard.css';

const CollectionCard = ({ collection }) => {
    const navigate = useNavigate();

    const handleClick = () => {
        // Navigate to collection details page (can be implemented later)
        navigate(`/collection/${collection.id}`);
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleClick();
        }
    };

    return (
        <div
            className="collection-card"
            onClick={handleClick}
            onKeyDown={handleKeyDown}
            tabIndex={0}
            role="button"
            aria-label={`View ${collection.name} collection`}
        >
            {/* Background image with gradient overlay */}
            <div className="collection-card-background">
                <div className="collection-card-gradient"></div>
                <img
                    src={collection.backdrop}
                    alt={collection.name}
                    className="collection-card-image"
                    loading="lazy"
                />
            </div>

            {/* Content */}
            <div className="collection-card-content">
                <h3 className="collection-card-title">{collection.name}</h3>
                <p className="collection-card-count">{collection.movieCount} Movies</p>

                {/* Play button (appears on hover) */}
                <div className="collection-card-play-btn">
                    <button className="play-button">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polygon points="6 3 20 12 6 21 6 3"></polygon>
                        </svg>
                    </button>
                </div>
            </div>
        </div>
    );
};

export default CollectionCard;
