import React, { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import BannerSlider from '../components/BannerSlider';
import Modal from '../components/Modal';
import PopularCollections from '../components/PopularCollections';
import ContinueWatching from '../components/ContinueWatching';
import StreamingProviders from '../components/StreamingProviders';
import TrendingSection from '../components/TrendingSection';
import TrendingAnimeSection from '../components/TrendingAnimeSection';
import RecommendedForYou from '../components/RecommendedForYou';
import MovieStudios from '../components/MovieStudios';
import LazyLoadSection from '../components/LazyLoadSection';
// VisitorStats disabled
import TopTenRow from '../components/TopTenRow';
import PopularOnStreamflix from '../components/PopularOnStreamflix';
import NativeAd from '../components/NativeAd';
import SpreadTheWordModal from '../components/SpreadTheWordModal';
import MetaTags from '../components/MetaTags';
import { useTMDB } from '../hooks/useTMDB';
import { useProfiles } from '../contexts/ProfileContext';
import { useToast } from '../contexts/ToastContext';
import { buildKidsCatalog } from '../lib/kidsCatalog';
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
  const { isKidsMode } = useProfiles();
  const [nowPlayingMovies, setNowPlayingMovies] = useState([]);
  const [topTenMovies, setTopTenMovies] = useState([]);
  const [kidsCatalog, setKidsCatalog] = useState(null);
  const [userCountry, setUserCountry] = useState({ code: 'US', name: 'Your Country' });
  const [selectedItem, setSelectedItem] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const {
    movieGenres,
    tvGenres,
    fetchNowPlaying,
    fetchPopularByRegion,
    fetchCredits,
    fetchContentRating
  } = useTMDB();
  const { showError } = useToast();

  useEffect(() => {
    let isMounted = true;
    const controller = new AbortController();

    if (isKidsMode) {
      // Clear normal feed synchronously when switching to Kids mode
      setNowPlayingMovies([]);
      setTopTenMovies([]);
      setLoading(true);

      async function loadKidsData() {
        try {
          const catalog = await buildKidsCatalog({ signal: controller.signal });
          if (isMounted) {
            setKidsCatalog(catalog);
            setLoading(false);
          }
        } catch (err) {
          if (isMounted && err?.name !== 'AbortError') {
            console.error('Failed to initialize Kids catalog:', err);
            setLoading(false);
          }
        }
      }

      loadKidsData();
    } else {
      setKidsCatalog(null);
      initializeData();
    }

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [isKidsMode]);

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

      if (!contentData || typeof contentData.id === 'undefined') {
        throw new Error('Content not found');
      }

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
        ...(type === 'tv' && season && episode && {
          lastSeason: parseInt(season),
          lastEpisode: parseInt(episode)
        })
      });
      setIsModalOpen(true);
    } catch (error) {
      console.error('Failed to load content for modal:', error);
      showError('This title is no longer available');
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

  const handleItemClick = useCallback((item) => {
    const type = item.type || item.media_type || (item.first_air_date || (item.name && !item.title) ? "tv" : "movie");
    const genreMap = type === 'movie' ? movieGenres : tvGenres;
    const genreNames = item.genre_ids?.map(id => genreMap.get(id)).filter(Boolean) || [];

    setSelectedItem({
      ...item,
      type,
      genres: item.genres?.length ? item.genres : genreNames,
    });
    setIsModalOpen(true);
  }, [movieGenres, tvGenres]);

  const closeModal = useCallback(() => {
    setIsModalOpen(false);
    setSelectedItem(null);
  }, []);

  // Kids section minimum thresholds
  const kidsBannerMovies = kidsCatalog?.bannerItems?.length >= 3
    ? kidsCatalog.bannerItems
    : (kidsCatalog?.allApproved?.filter(m => m.backdrop_path)?.slice(0, 8) || []);

  const hasKidsBanner = kidsBannerMovies.length >= 3;
  const kidsTopTen = (kidsCatalog?.allApproved || []).slice(0, 10);
  const hasKidsTopTen = kidsTopTen.length >= 5;
  const kidsFamilyShows = (kidsCatalog?.sections?.familyShows || []);
  const hasKidsFamilyShows = kidsFamilyShows.length >= 8;
  const kidsAnimationMovies = (kidsCatalog?.sections?.animationMovies || []);
  const hasKidsAnimationMovies = kidsAnimationMovies.length >= 6;
  const kidsShows = (kidsCatalog?.sections?.kidsShows || []);
  const hasKidsShows = kidsShows.length >= 6;

  return (
    <div className="home-page">
      <MetaTags
        title="StreamFlix - Watch Movies & TV Shows Online | Free Streaming"
        description="StreamFlix - Your favorite destination for movies and TV shows. Stream the latest blockbusters, popular TV series, and anime all in one place."
      />
      <h1 className="visually-hidden">StreamFlix - Watch Movies & TV Shows Online</h1>

      {/* BannerSlider */}
      {isKidsMode ? (
        (hasKidsBanner || loading) && (
          <BannerSlider
            movies={kidsBannerMovies}
            onItemClick={handleItemClick}
            loading={loading}
          />
        )
      ) : (
        <BannerSlider
          movies={nowPlayingMovies.slice(0, 10)}
          onItemClick={handleItemClick}
          loading={loading}
        />
      )}

      {/* Continue Watching Section */}
      <ContinueWatching onItemClick={handleItemClick} />

      <div className="content-rows">
        {/* Recommended For You - Only shows if user has watch history */}
        <RecommendedForYou onItemClick={handleItemClick} />

        {isKidsMode ? (
          <>
            {/* Top 10 for Kids */}
            {hasKidsTopTen && (
              <TopTenRow
                items={kidsTopTen}
                onItemClick={handleItemClick}
                title="Top 10 for Kids"
                subtitle="Most watched by kids"
              />
            )}

            {/* Trending for Kids */}
            {hasKidsFamilyShows && (
              <TopTenRow
                title="Trending for Kids"
                subtitle="Shows kids are watching now"
                items={kidsFamilyShows}
                onItemClick={handleItemClick}
                showRanks={false}
              />
            )}

            {/* Animated Favorites */}
            {hasKidsAnimationMovies && (
              <TopTenRow
                title="Animated Favorites"
                subtitle="Colorful adventures for every age"
                items={kidsAnimationMovies}
                onItemClick={handleItemClick}
                showRanks={false}
              />
            )}

            {/* Kids Shows */}
            {hasKidsShows && (
              <TopTenRow
                title="Kids Shows"
                subtitle="More series picked for kids"
                items={kidsShows}
                onItemClick={handleItemClick}
                showRanks={false}
              />
            )}
          </>
        ) : (
          <>
            {/* Popular on Streamflix */}
            <PopularOnStreamflix onItemClick={handleItemClick} />

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
            <LazyLoadSection minHeight="350px">
              <PopularCollections />
            </LazyLoadSection>

            {/* Native Ad Section */}
            <LazyLoadSection minHeight="200px">
              <NativeAd />
            </LazyLoadSection>

            {/* Movie Studios Section */}
            <LazyLoadSection minHeight="300px">
              <MovieStudios />
            </LazyLoadSection>

            {/* Streaming Providers Section */}
            <LazyLoadSection minHeight="300px">
              <StreamingProviders />
            </LazyLoadSection>
          </>
        )}
      </div>

      {isModalOpen && selectedItem && (
        <Modal item={selectedItem} onClose={closeModal} />
      )}

      {/* Spread the Word Modal */}
      <SpreadTheWordModal />
    </div>
  );
};

export default Home;
