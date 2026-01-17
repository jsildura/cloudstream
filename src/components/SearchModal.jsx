import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import './SearchModal.css';

const MAX_TRENDING = 5;

const SearchModal = ({ searchResults, onSearch, onClose, onItemClick, isSearching, trendingItems = [] }) => {
  const [query, setQuery] = useState('');
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const inputRef = useRef(null);
  const debounceTimer = useRef(null);
  const resultsContainerRef = useRef(null);

  // Get display trending (from props or use placeholder)
  const displayTrending = trendingItems.slice(0, MAX_TRENDING);

  // Determine which list is currently active for navigation
  const activeItems = useMemo(() => {
    if (query && searchResults && searchResults.length > 0) {
      return searchResults.slice(0, 8);
    } else if (!query && displayTrending.length > 0) {
      return displayTrending;
    }
    return [];
  }, [query, searchResults, displayTrending]);

  // Reset focused index when results change
  useEffect(() => {
    setFocusedIndex(-1);
  }, [query, searchResults]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
    // Prevent body scroll when modal is open
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  // Scroll focused item into view
  useEffect(() => {
    if (focusedIndex >= 0 && resultsContainerRef.current) {
      const focusedElement = resultsContainerRef.current.querySelector(`[data-index="${focusedIndex}"]`);
      if (focusedElement) {
        focusedElement.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }, [focusedIndex]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }

      if (activeItems.length === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setFocusedIndex(prev =>
          prev < activeItems.length - 1 ? prev + 1 : 0
        );
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setFocusedIndex(prev =>
          prev > 0 ? prev - 1 : activeItems.length - 1
        );
      } else if (e.key === 'Enter' && focusedIndex >= 0) {
        e.preventDefault();
        const selectedItem = activeItems[focusedIndex];
        if (selectedItem) {
          onItemClick(selectedItem);
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, activeItems, focusedIndex, onItemClick]);

  // Context-aware hint text
  const getHintContent = useCallback(() => {
    if (focusedIndex >= 0) {
      return { text: '↵', title: 'Press Enter to select' };
    }
    if (activeItems.length > 0) {
      return { text: '↑↓', title: 'Use arrow keys to navigate' };
    }
    return { text: 'ESC', title: 'Press ESC to close' };
  }, [focusedIndex, activeItems.length]);

  const hintContent = getHintContent();

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
          <span
            className="search-modal-esc-hint"
            onClick={onClose}
            title={hintContent.title}
          >
            {hintContent.text}
          </span>
        </div>

        {/* Content Card */}
        <div className="search-modal-content" ref={resultsContainerRef}>
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
                      className={`search-modal-result-item ${focusedIndex === index ? 'focused' : ''}`}
                      data-index={index}
                      onClick={() => handleItemSelect(item)}
                    >
                      <span className="search-modal-result-rank">{index + 1}</span>
                      <div className="search-modal-result-poster">
                        {item.poster_path ? (
                          <img
                            src={`https://image.tmdb.org/t/p/w92${item.poster_path}`}
                            alt={item.title || item.name}
                            loading="lazy"
                          />
                        ) : (
                          <div className="search-modal-result-poster-placeholder">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                              <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
                              <circle cx="9" cy="9" r="2" />
                              <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
                            </svg>
                          </div>
                        )}
                      </div>
                      <span className="search-modal-result-title">
                        {item.title || item.name}
                        {(item.release_date || item.first_air_date) && (
                          <span className="search-modal-result-year">
                            ({(item.release_date || item.first_air_date)?.substring(0, 4)})
                          </span>
                        )}
                      </span>
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
                        className={`search-modal-trending-item ${focusedIndex === index ? 'focused' : ''}`}
                        data-index={index}
                        onClick={() => handleTrendingClick(item)}
                      >
                        <span className="search-modal-trending-rank">{index + 1}</span>
                        <div className="search-modal-trending-poster">
                          {item.poster_path ? (
                            <img
                              src={`https://image.tmdb.org/t/p/w92${item.poster_path}`}
                              alt={item.title || item.name}
                              loading="lazy"
                            />
                          ) : (
                            <div className="search-modal-trending-poster-placeholder">
                              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
                                <circle cx="9" cy="9" r="2" />
                                <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
                              </svg>
                            </div>
                          )}
                        </div>
                        <span className="search-modal-trending-title">
                          {item.title || item.name}
                          {(item.release_date || item.first_air_date) && (
                            <span className="search-modal-trending-year">
                              ({(item.release_date || item.first_air_date)?.substring(0, 4)})
                            </span>
                          )}
                        </span>
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