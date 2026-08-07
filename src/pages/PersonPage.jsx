import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import MetaTags from '../components/MetaTags';
import Modal from '../components/Modal';
import { useTMDB } from '../hooks/useTMDB';
import { cardPoster, cardBackdrop, posterAsBackdrop } from '../utils/images';
import './PersonPage.css';

const MAX_FILMOGRAPHY = 60;

const PersonPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { movieGenres, tvGenres } = useTMDB();

  const [person, setPerson] = useState(null);
  const [credits, setCredits] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [selectedItem, setSelectedItem] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [bioExpanded, setBioExpanded] = useState(false);

  // Fetch person details + credits in parallel
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setPerson(null);
    setCredits(null);

    Promise.all([
      fetch(`/api/person/${id}`).then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      }),
      fetch(`/api/person/${id}/combined_credits`).then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
    ])
      .then(([personData, creditsData]) => {
        if (cancelled) return;
        setPerson(personData);
        setCredits(creditsData);
      })
      .catch(err => {
        if (cancelled) return;
        console.error('Person fetch failed:', err);
        setError('Could not load this person. Please try again.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [id]);

  // Build deduplicated, sorted filmography
  const filmography = useMemo(() => {
    if (!credits) return [];

    const seen = new Map(); // "media_type-id" → item

    // Process cast first (preferred), then crew
    for (const item of (credits.cast || [])) {
      const type = item.media_type || 'movie';
      const key = `${type}-${item.id}`;
      if (!seen.has(key)) {
        seen.set(key, {
          ...item,
          media_type: type,
          _sortDate: item.release_date || item.first_air_date || '',
          _role: item.character || ''
        });
      }
    }
    for (const item of (credits.crew || [])) {
      const type = item.media_type || 'movie';
      const key = `${type}-${item.id}`;
      if (!seen.has(key)) {
        seen.set(key, {
          ...item,
          media_type: type,
          _sortDate: item.release_date || item.first_air_date || '',
          _role: item.job || ''
        });
      }
    }

    return [...seen.values()]
      .sort((a, b) => {
        // Items with dates sort before items without
        if (a._sortDate && !b._sortDate) return -1;
        if (!a._sortDate && b._sortDate) return 1;
        // Newer first
        return b._sortDate.localeCompare(a._sortDate);
      })
      .slice(0, MAX_FILMOGRAPHY);
  }, [credits]);

  const handleCreditsClick = useCallback((item) => {
    const type = item.media_type === 'movie' ? 'movie' : 'tv';
    const genreMap = type === 'movie' ? movieGenres : tvGenres;
    const genreNames = item.genre_ids?.map(gid => genreMap.get(gid)).filter(Boolean) || [];

    setSelectedItem({ ...item, type, media_type: type, genres: genreNames });
    setIsModalOpen(true);
  }, [movieGenres, tvGenres]);

  const closeModal = () => {
    setIsModalOpen(false);
    setSelectedItem(null);
  };

  // Loading state — skeleton placeholders matching the app's shimmer style
  // (same gradient/animation as .trending-card-skeleton), so the hero and the
  // filmography grid hold their shape while the data fetches.
  if (loading) {
    return (
      <div className="person-page">
        <div className="person-hero" aria-busy="true">
          <div className="person-hero-photo">
            <div className="person-skeleton person-hero-photo-skeleton" />
          </div>
          <div className="person-hero-info">
            <div className="person-skeleton person-hero-name-skeleton" />
            <div className="person-skeleton person-hero-line-skeleton" />
            <div className="person-skeleton person-hero-line-skeleton short" />
            <div className="person-skeleton person-hero-bio-skeleton" />
          </div>
        </div>

        <section className="person-filmography" aria-busy="true">
          <h2 className="person-filmography-title">Filmography</h2>
          <div className="person-filmography-grid">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={`skeleton-${i}`} className="person-skeleton person-film-skeleton" />
            ))}
          </div>
        </section>
      </div>
    );
  }

  // Error state
  if (error || !person) {
    return (
      <div className="person-page">
        <div className="person-page-error">
          <p>{error || 'Person not found.'}</p>
          <button onClick={() => navigate(-1)}>Go Back</button>
        </div>
      </div>
    );
  }

  const photo = cardPoster(person.profile_path);
  const birthYear = person.birthday ? person.birthday.substring(0, 4) : null;
  const deathYear = person.deathday ? person.deathday.substring(0, 4) : null;
  const lifeSpan = birthYear
    ? deathYear ? `${birthYear}–${deathYear}` : `Born ${birthYear}`
    : null;

  const bio = person.biography || '';
  const bioIsLong = bio.length > 400;
  const displayBio = bioExpanded || !bioIsLong ? bio : bio.slice(0, 400) + '…';

  return (
    <div className="person-page">
      <MetaTags
        title={`${person.name} — Person | StreamFlix`}
        description={bio.slice(0, 160) || `${person.name} filmography on StreamFlix.`}
      />

      {/* Hero section */}
      <div className="person-hero">
        <div className="person-hero-photo">
          {photo ? (
            <img src={photo} alt={`${person.name} photo`} draggable="false" />
          ) : (
            <div className="person-hero-avatar" aria-hidden="true">
              <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </div>
          )}
        </div>

        <div className="person-hero-info">
          <span className="person-hero-department">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect width="18" height="18" x="3" y="3" rx="2" />
              <path d="M7 3v18" />
              <path d="M3 7.5h4" />
              <path d="M3 12h18" />
              <path d="M17 3v18" />
              <path d="M16.5 7.5H21" />
            </svg>
            {person.known_for_department || 'Actor'}
          </span>

          <h1 className="person-hero-name">{person.name}</h1>

          <div className="person-hero-meta">
            {lifeSpan && (
              <span className="person-hero-meta-chip">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect width="18" height="18" x="3" y="4" rx="2" />
                  <path d="M16 2v4" />
                  <path d="M8 2v4" />
                  <path d="M3 10h18" />
                </svg>
                {lifeSpan}
              </span>
            )}

            {person.place_of_birth && (
              <span className="person-hero-meta-chip">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
                {person.place_of_birth}
              </span>
            )}
          </div>

          {bio && (
            <div className="person-hero-bio">
              <p>{displayBio}</p>
              {bioIsLong && (
                <button
                  className="person-bio-toggle"
                  onClick={() => setBioExpanded(prev => !prev)}
                >
                  {bioExpanded ? 'Show Less' : 'Read More'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Filmography */}
      {filmography.length > 0 && (
        <section className="person-filmography">
          <h2 className="person-filmography-title">Filmography</h2>
          <div className="person-filmography-grid">
            {filmography.map(item => {
              const title = item.title || item.name || 'Untitled';
              const year = (item.release_date || item.first_air_date || '').substring(0, 4);
              // Horizontal 16:9 card — prefer the real backdrop, then a poster
              // crop, then the decorative placeholder art when TMDB has neither.
              const backdrop = cardBackdrop(item.backdrop_path)
                ?? posterAsBackdrop(item.poster_path)
                ?? '/icons/placeholder.svg';
              // The placeholder SVG is decorative — render it letterboxed
              // (contain) on the dark ground, not stretched full-bleed.
              const isPlaceholder = backdrop === '/icons/placeholder.svg';

              return (
                <button
                  key={`${item.media_type}-${item.id}`}
                  className="person-film-card"
                  onClick={() => handleCreditsClick(item)}
                  aria-label={`View ${title}`}
                >
                  <div className="person-film-poster">
                    <img
                      src={backdrop}
                      alt={title}
                      loading="lazy"
                      draggable="false"
                      className={isPlaceholder ? 'person-film-placeholder-img' : undefined}
                    />
                  </div>
                  <span className="person-film-title">{title}</span>
                  {year && <span className="person-film-year">{year}</span>}
                  {item._role && (
                    <span className="person-film-role">{item._role}</span>
                  )}
                </button>
              );
            })}
          </div>
        </section>
      )}

      {isModalOpen && selectedItem && (
        <Modal item={selectedItem} onClose={closeModal} />
      )}
    </div>
  );
};

export default PersonPage;
