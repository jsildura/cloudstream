import React from 'react';
import { cardPoster } from '../utils/images';
import './MovieRecRow.css';

// Horizontal row of movie/show poster cards, used inside message bubbles for
// recommendation lists. `movies` items are snapshots stored on the message:
// { type, id, title, year, poster }. Clicking a card opens the content modal
// via `onOpen` — the same handler /watch chat links use.
const MovieRecRow = ({ movies = [], onOpen }) => {
    if (!movies.length) return null;
    return (
        <div className="gc-rec-row" onClick={(e) => e.stopPropagation()}>
            {movies.map((m) => (
                <button
                    key={`${m.type}-${m.id}`}
                    className="gc-rec-card"
                    title={m.title}
                    onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onOpen?.(e, m);
                    }}
                >
                    {m.poster ? (
                        <img
                            src={cardPoster(m.poster)}
                            alt={m.title}
                            loading="lazy"
                            draggable="false"
                            className="gc-rec-card-img"
                        />
                    ) : (
                        <div className="gc-rec-card-img gc-rec-card-fallback">🎬</div>
                    )}
                    <span className="gc-rec-card-title">{m.title}</span>
                </button>
            ))}
        </div>
    );
};

export default MovieRecRow;
