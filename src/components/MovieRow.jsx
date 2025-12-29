import React, { memo, useCallback } from 'react';
import MovieCard from './MovieCard';

const MovieRow = memo(({ title, items, onItemClick, headerAction, maxItems }) => {
  // Only apply slice if maxItems is explicitly provided
  const displayItems = maxItems ? items.slice(0, maxItems) : items;

  // Memoize item click handler factory
  const handleItemClick = useCallback((item) => {
    onItemClick(item);
  }, [onItemClick]);

  if (displayItems.length === 0) {
    return null;
  }

  return (
    <div className="row">
      <div className="row-header">
        <h2>{title}</h2>
        {headerAction && headerAction}
      </div>
      <div className="grid-container">
        {displayItems.map(item => (
          <MovieCard
            key={item.id}
            item={item}
            onClick={() => handleItemClick(item)}
          />
        ))}
      </div>
    </div>
  );
});

MovieRow.displayName = 'MovieRow';
export default MovieRow;