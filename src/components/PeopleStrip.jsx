import React from 'react';
import { cardPoster } from '../utils/images';
import './PeopleStrip.css';

const PeopleStrip = ({ people, onSelect }) => {
  if (!people || people.length === 0) return null;

  return (
    <section className="people-strip" aria-label="People matching your search">
      <h2 className="people-strip-title">People</h2>
      <div className="people-strip-row">
        {people.map(person => {
          // cardPoster handles null safely — returns null when no photo
          const photo = cardPoster(person.profile_path);
          return (
            <button
              key={`person-${person.id}`}
              className="people-strip-card"
              onClick={() => onSelect(person)}
              aria-label={`View ${person.name}`}
            >
              {photo ? (
                <img
                  src={photo}
                  alt={`${person.name} photo`}
                  loading="lazy"
                  draggable="false"
                />
              ) : (
                <div className="people-strip-avatar" aria-hidden="true">★</div>
              )}
              <span className="people-strip-name">{person.name}</span>
              <span className="people-strip-dept">
                {person.known_for_department || 'Actor'}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
};

export default PeopleStrip;
