import React from 'react';
import MovieCard from './MovieCard';

const MovieRow = ({ title, items, onItemClick, headerAction, maxItems }) => {
  // Only apply slice if maxItems is explicitly provided
  const displayItems = maxItems ? items.slice(0, maxItems) : items;

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
            onClick={() => onItemClick(item)}
          />
        ))}
      </div>
    </div>
  );
};

export default MovieRow;