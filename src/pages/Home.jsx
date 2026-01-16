import React, { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import BannerSlider from '../components/BannerSlider';
import MovieRow from '../components/MovieRow';
import Modal from '../components/Modal';
import SearchModal from '../components/SearchModal';
import PopularCollections from '../components/PopularCollections';
import ContinueWatching from '../components/ContinueWatching';
import StreamingPicks from '../components/StreamingPicks';
import TrendingSection from '../components/TrendingSection';
import TrendingAnimeSection from '../components/TrendingAnimeSection';
import MovieStudios from '../components/MovieStudios';
// VisitorStats disabled
import TopTenRow from '../components/TopTenRow';
import NativeAd from '../components/NativeAd';
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
  const location = useLocation();
  const [nowPlayingMovies, setNowPlayingMovies] = useState([]);
  const [topTenMovies, setTopTenMovies] = useState([]);
  const [userCountry, setUserCountry] = useState({ code: 'US', name: 'Your Country' });
  const [selectedItem, setSelectedItem] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [loading, setLoading] = useState(true);

  const {
    movieGenres,
    tvGenres,
    fetchNowPlaying,
    fetchPopularByRegion,
    searchTMDB,
    fetchCredits,
    fetchContentRating
  } = useTMDB();

  useEffect(() => {
    initializeData();
  }, []);

  // Handle incoming modal request from Watch redirect
  useEffect(() => {
    const modalRequest = location.state?.openModalForContent;
    if (modalRequest) {
      openModalForContent(modalRequest);
      // Clear state to prevent re-opening on refresh
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  // Fetch content and open modal for redirected direct URL access
  const openModalForContent = async ({ type, id, season, episode }) => {
    try {
      const res = await fetch(`/api/${type}/${id}`);
      const contentData = await res.json();

      const genreNames = contentData.genres?.map(g => g.name) || [];

      const [cast, contentRating] = await Promise.all([
        fetchCredits(type, id),
        fetchContentRating(type, id)
      ]);

      setSelectedItem({
        ...contentData,
        type,
        genres: genreNames,
        cast: cast.join(', ') || 'N/A',
        contentRating,
        // Pass season/episode for TV shows
        ...(type === 'tv' && season && episode && {
          lastSeason: parseInt(season),
          lastEpisode: parseInt(episode)
        })
      });
      setIsModalOpen(true);
    } catch (error) {
      console.error('Failed to load content for modal:', error);
    }
  };



  const initializeData = async () => {
    try {
      setLoading(true);

      // Detect user's country from timezone
      const country = getCountryFromTimezone();
      setUserCountry(country);

      const [nowPlaying, topTen] = await Promise.all([
        fetchNowPlaying(),
        fetchPopularByRegion('movie', country.code)
      ]);

      setNowPlayingMovies(nowPlaying);
      setTopTenMovies(topTen);
    } catch (error) {
      console.error("Failed to initialize data:", error);
    } finally {
      setLoading(false);
    }
  };



  const handleSearch = useCallback(async (query) => {
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
  }, [searchTMDB]);

  const handleItemClick = useCallback(async (item) => {
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
  }, [movieGenres, tvGenres, fetchCredits, fetchContentRating]);

  const closeModal = useCallback(() => {
    setIsModalOpen(false);
    setSelectedItem(null);
  }, []);

  const openSearch = useCallback(() => setIsSearchOpen(true), []);
  const closeSearch = useCallback(() => {
    setIsSearchOpen(false);
    setSearchResults([]);
  }, []);

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

      {/* Continue Watching Section */}
      <ContinueWatching onItemClick={handleItemClick} />

      <div className="content-rows">
        {/* Trending Today Section */}
        <TrendingSection timeWindow="day" onItemClick={handleItemClick} />

        {/* Trending This Week Section */}
        <TrendingSection timeWindow="week" onItemClick={handleItemClick} />

        {/* Trending Anime Section */}
        <TrendingAnimeSection onItemClick={handleItemClick} />

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

        {/* Movie Studios Section */}
        <MovieStudios />

        {/* Netflix Originals Section */}
        <StreamingPicks provider="netflix" />

        {/* Disney+ Picks Section */}
        <StreamingPicks provider="disney" />

        {/* Prime Video Featured Section */}
        <StreamingPicks provider="prime" />

        {/* Apple TV+ Originals Section */}
        <StreamingPicks provider="apple" />

        {/* HBO Originals Section */}
        <StreamingPicks provider="hbo" />

        {/* VIU Picks Section */}
        <StreamingPicks provider="viu" />

        {/* Crunchyroll Anime Section */}
        <StreamingPicks provider="crunchyroll" />

        {/* Peacock Picks Section */}
        <StreamingPicks provider="peacock" />


      </div>

      {/* Native Ad - Non-intrusive placement at bottom of homepage */}
      <NativeAd />

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