import React, { useState, useEffect } from 'react';
import BannerSlider from '../components/BannerSlider';
import MovieRow from '../components/MovieRow';
import Modal from '../components/Modal';
import SearchModal from '../components/SearchModal';
import PopularCollections from '../components/PopularCollections';
import ContinueWatching from '../components/ContinueWatching';
import NetflixOriginals from '../components/NetflixOriginals';
import DisneyPlusPicks from '../components/DisneyPlusPicks';
import PrimeVideoPicks from '../components/PrimeVideoPicks';
import AppleTVPicks from '../components/AppleTVPicks';
import HBOPicks from '../components/HBOPicks';
import ViuPicks from '../components/ViuPicks';
import VisitorStats from '../components/VisitorStats';
import TopTenRow from '../components/TopTenRow';
import { useTMDB } from '../hooks/useTMDB';
import './Home.css';

// Timezone to country code mapping for popular regions
const timezoneToCountry = {
  'Asia/Manila': { code: 'PH', name: 'the Philippines' },
  'Asia/Tokyo': { code: 'JP', name: 'Japan' },
  'Asia/Seoul': { code: 'KR', name: 'South Korea' },
  'Asia/Shanghai': { code: 'CN', name: 'China' },
  'Asia/Hong_Kong': { code: 'HK', name: 'Hong Kong' },
  'Asia/Singapore': { code: 'SG', name: 'Singapore' },
  'Asia/Bangkok': { code: 'TH', name: 'Thailand' },
  'Asia/Jakarta': { code: 'ID', name: 'Indonesia' },
  'Asia/Kuala_Lumpur': { code: 'MY', name: 'Malaysia' },
  'Asia/Ho_Chi_Minh': { code: 'VN', name: 'Vietnam' },
  'Asia/Kolkata': { code: 'IN', name: 'India' },
  'America/New_York': { code: 'US', name: 'the USA' },
  'America/Los_Angeles': { code: 'US', name: 'the USA' },
  'America/Chicago': { code: 'US', name: 'the USA' },
  'America/Denver': { code: 'US', name: 'the USA' },
  'America/Toronto': { code: 'CA', name: 'Canada' },
  'America/Vancouver': { code: 'CA', name: 'Canada' },
  'America/Mexico_City': { code: 'MX', name: 'Mexico' },
  'America/Sao_Paulo': { code: 'BR', name: 'Brazil' },
  'Europe/London': { code: 'GB', name: 'the UK' },
  'Europe/Paris': { code: 'FR', name: 'France' },
  'Europe/Berlin': { code: 'DE', name: 'Germany' },
  'Europe/Madrid': { code: 'ES', name: 'Spain' },
  'Europe/Rome': { code: 'IT', name: 'Italy' },
  'Europe/Amsterdam': { code: 'NL', name: 'the Netherlands' },
  'Australia/Sydney': { code: 'AU', name: 'Australia' },
  'Australia/Melbourne': { code: 'AU', name: 'Australia' },
  'Pacific/Auckland': { code: 'NZ', name: 'New Zealand' },
};

const getCountryFromTimezone = () => {
  try {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return timezoneToCountry[timezone] || { code: 'US', name: 'Your Country' };
  } catch {
    return { code: 'US', name: 'Your Country' };
  }
};

const Home = () => {
  const [trendingMovies, setTrendingMovies] = useState([]);
  const [trendingTV, setTrendingTV] = useState([]);
  const [trendingAnime, setTrendingAnime] = useState([]);
  const [nowPlayingMovies, setNowPlayingMovies] = useState([]);
  const [topTenMovies, setTopTenMovies] = useState([]);
  const [userCountry, setUserCountry] = useState({ code: 'US', name: 'Your Country' });
  const [selectedItem, setSelectedItem] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [timeWindow, setTimeWindow] = useState('week');

  const {
    movieGenres,
    tvGenres,
    fetchTrending,
    fetchTrendingAnime,
    fetchNowPlaying,
    fetchPopularByRegion,
    searchTMDB,
    fetchCredits,
    fetchContentRating
  } = useTMDB();

  useEffect(() => {
    initializeData();
  }, []);

  useEffect(() => {
    if (!loading) {
      updateTrendingData();
    }
  }, [timeWindow]);

  const initializeData = async () => {
    try {
      setLoading(true);

      // Detect user's country from timezone
      const country = getCountryFromTimezone();
      setUserCountry(country);

      const [movies, tvShows, anime, nowPlaying, topTen] = await Promise.all([
        fetchTrending('movie', timeWindow),
        fetchTrending('tv', timeWindow),
        fetchTrendingAnime(),
        fetchNowPlaying(),
        fetchPopularByRegion('movie', country.code)
      ]);

      setTrendingMovies(movies);
      setTrendingTV(tvShows);
      setTrendingAnime(anime);
      setNowPlayingMovies(nowPlaying);
      setTopTenMovies(topTen);
    } catch (error) {
      console.error("Failed to initialize data:", error);
    } finally {
      setLoading(false);
    }
  };

  const updateTrendingData = async () => {
    try {
      const [movies, tvShows] = await Promise.all([
        fetchTrending('movie', timeWindow),
        fetchTrending('tv', timeWindow)
      ]);

      setTrendingMovies(movies);
      setTrendingTV(tvShows);
    } catch (error) {
      console.error("Failed to update trending data:", error);
    }
  };

  const handleTimeWindowToggle = () => {
    setTimeWindow(prev => prev === 'week' ? 'day' : 'week');
  };

  const handleSearch = async (query) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    try {
      const results = await searchTMDB(query);
      setSearchResults(results);
    } catch (error) {
      console.error('Search error:', error);
      setSearchResults([]);
    }
  };

  const handleItemClick = async (item) => {
    const type = item.media_type === "movie" || item.release_date ? "movie" : "tv";
    const genreMap = type === 'movie' ? movieGenres : tvGenres;
    const genreNames = item.genre_ids?.map(id => genreMap.get(id)).filter(Boolean) || [];

    // Fetch credits and content rating in parallel
    const [cast, contentRating] = await Promise.all([
      fetchCredits(type, item.id),
      fetchContentRating(type, item.id)
    ]);

    setSelectedItem({
      ...item,
      type,
      genres: genreNames,
      cast: cast.join(', ') || 'N/A',
      contentRating
    });
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setSelectedItem(null);
  };

  const openSearch = () => setIsSearchOpen(true);
  const closeSearch = () => {
    setIsSearchOpen(false);
    setSearchResults([]);
  };

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner"></div>
        <p>Loading amazing content...</p>
      </div>
    );
  }

  return (
    <div className="home-page">
      {/* Use nowPlayingMovies for BannerSlider */}
      {nowPlayingMovies.length > 0 && (
        <BannerSlider
          movies={nowPlayingMovies.slice(0, 10)}
          onItemClick={handleItemClick}
        />
      )}

      {/* Visitor Stats Widget - Homepage Only */}
      <VisitorStats />

      {/* Continue Watching Section */}
      <ContinueWatching onItemClick={handleItemClick} />

      <div className="time-window-toggle-container">
        <div className="time-window-toggle">
          <span className={`toggle-label ${timeWindow === 'week' ? 'active' : ''}`}>
            This Week
          </span>
          <button
            className={`toggle-switch ${timeWindow === 'day' ? 'day' : 'week'}`}
            onClick={handleTimeWindowToggle}
            aria-label={`Switch to ${timeWindow === 'week' ? 'today' : 'this week'} trending`}
          >
            <div className="toggle-slider"></div>
          </button>
          <span className={`toggle-label ${timeWindow === 'day' ? 'active' : ''}`}>
            Today
          </span>
        </div>
      </div>

      <div className="content-rows">
        {/* Side by side trending movies and TV shows */}
        <div className="trending-side-by-side">
          {trendingMovies.length > 0 && (
            <div className="trending-column">
              <MovieRow
                title={`Trending Movies ${timeWindow === 'day' ? 'Today' : 'This Week'}`}
                items={trendingMovies.slice(0, 15)}
                onItemClick={handleItemClick}
                columns={3}
              />
            </div>
          )}

          {trendingTV.length > 0 && (
            <div className="trending-column">
              <MovieRow
                title={`Trending TV Shows ${timeWindow === 'day' ? 'Today' : 'This Week'}`}
                items={trendingTV.slice(0, 15)}
                onItemClick={handleItemClick}
                columns={3}
              />
            </div>
          )}
        </div>

        {/* Top 10 in Your Country Section */}
        {topTenMovies.length > 0 && (
          <TopTenRow
            items={topTenMovies}
            onItemClick={handleItemClick}
            countryName={userCountry.name}
          />
        )}

        {/* Popular Collections Section */}
        <PopularCollections />

        {/* Netflix Originals Section */}
        <NetflixOriginals />

        {/* Disney+ Picks Section */}
        <DisneyPlusPicks />

        {/* Prime Video Featured Section */}
        <PrimeVideoPicks />

        {/* Apple TV+ Originals Section */}
        <AppleTVPicks />

        {/* HBO Originals Section */}
        <HBOPicks />

        {/* VIU Picks Section */}
        <ViuPicks />

        {/* Trending Anime below */}
        {trendingAnime.length > 0 && (
          <MovieRow
            title="Trending Anime"
            items={trendingAnime}
            onItemClick={handleItemClick}
          />
        )}
      </div>

      {isModalOpen && selectedItem && (
        <Modal item={selectedItem} onClose={closeModal} />
      )}

      {isSearchOpen && (
        <SearchModal
          searchResults={searchResults}
          onSearch={handleSearch}
          onClose={closeSearch}
          onItemClick={handleItemClick}
        />
      )}
    </div>
  );
};

export default Home;