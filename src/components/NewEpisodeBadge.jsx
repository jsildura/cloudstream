import React, { memo } from 'react';
import './NewEpisodeBadge.css';

/**
 * Dual-toned "New Episode | Watch Now" badge for TV show cards.
 * Attached to the top of cards for series with recently released episodes.
 */
const NewEpisodeBadge = memo(({ className = '', style }) => {
  return (
    <div
      className={`new-episode-badge ${className}`.trim()}
      style={style}
      aria-label="New Episode - Watch Now"
    >
      <span className="new-episode-pill new-episode-tag">New Episode</span>
      <span className="new-episode-pill watch-now-tag">Watch Now</span>
    </div>
  );
});

NewEpisodeBadge.displayName = 'NewEpisodeBadge';

export default NewEpisodeBadge;
