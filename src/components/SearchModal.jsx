import React, { useState, useRef, useEffect, useCallback } from 'react';
import './SearchModal.css';

const MAX_TRENDING = 5;

const SearchModal = ({ searchResults, onSearch, onClose, onItemClick, isSearching, trendingItems = [] }) => {
  const [query, setQuery] = useState('');
  const inputRef = useRef(null);
  const debounceTimer = useRef(null);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
    // Prevent body scroll when modal is open
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const debouncedSearch = useCallback((value) => {
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }
    debounceTimer.current = setTimeout(() => {
      onSearch(value);
    }, 300);
  }, [onSearch]);

  const handleInputChange = (e) => {
    const value = e.target.value;
    setQuery(value);
    debouncedSearch(value);
  };

  useEffect(() => {
    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, []);

  const handleItemSelect = (item) => {
    onItemClick(item);
    onClose();
  };

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const handleTrendingClick = (item) => {
    onItemClick(item);
    onClose();
  };

  // Get display trending (from props or use placeholder)
  const displayTrending = trendingItems.slice(0, MAX_TRENDING);

  return (
    <div className="search-modal-overlay" onClick={handleBackdropClick}>
      <div className="search-modal-container">
        {/* Search Input Bar */}
        <div className="search-modal-input-wrapper">
          <svg
            className="search-modal-input-icon"
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            placeholder="What do you want to watch?"
            value={query}
            onChange={handleInputChange}
            className="search-modal-input"
            autoComplete="off"
          />
          <span className="search-modal-esc-hint">ESC</span>
        </div>

        {/* Content Card */}
        <div className="search-modal-content">
          {/* Search Results (when query exists) */}
          {query && (
            <div className="search-modal-results">
              {isSearching ? (
                <div className="search-modal-loading">
                  <span>Searching...</span>
                </div>
              ) : searchResults && searchResults.length > 0 ? (
                <div className="search-modal-results-list">
                  {searchResults.slice(0, 8).map((item, index) => (
                    <div
                      key={`${item.id}-${item.media_type}`}
                      className="search-modal-result-item"
                      onClick={() => handleItemSelect(item)}
                    >
                      <span className="search-modal-result-rank">{index + 1}</span>
                      <span className="search-modal-result-title">{item.title || item.name}</span>
                      <span className="search-modal-result-type">
                        {item.media_type === 'movie' ? 'MOVIE' : 'TV'}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="search-modal-no-results">
                  <span>No results found for "{query}"</span>
                </div>
              )}
            </div>
          )}

          {/* Default State (no query) */}
          {!query && (
            <>
              {/* Trending Section */}
              {displayTrending.length > 0 && (
                <div className="search-modal-section">
                  <div className="search-modal-section-header">
                    <img alt="Trending" width="16" height="16" src="/icons/trend.svg" style={{ filter: 'brightness(0) invert(1) opacity(0.4)' }} />
                    <span>Trending Search</span>
                  </div>
                  <div className="search-modal-trending-list">
                    {displayTrending.map((item, index) => (
                      <div
                        key={`trending-${item.id}`}
                        className="search-modal-trending-item"
                        onClick={() => handleTrendingClick(item)}
                      >
                        <span className="search-modal-trending-rank">{index + 1}</span>
                        <span className="search-modal-trending-title">{item.title || item.name}</span>
                        <span className="search-modal-trending-type">
                          {item.media_type === 'movie' ? 'MOVIE' : 'TV'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default SearchModal;