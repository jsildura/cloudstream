import { useState, lazy, Suspense } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';

// Core components - always loaded (small, needed immediately)
import Navbar from './components/Navbar';
import Modal from './components/Modal';
import Footer from './components/Footer';
import ScrollToTop from './components/ScrollToTop';
import ScrollToTopButton from './components/ScrollToTopButton';
import AdblockModal from './components/AdblockModal';
import BotProtection from './components/BotProtection';
import Toast from './components/Toast';
import GlobalChat from './components/GlobalChat';
import PageLoader from './components/PageLoader';

// Context providers - always loaded
import { ToastProvider } from './contexts/ToastContext';
import { ViewerCountProvider } from './contexts/ViewerCountContext';

// Hooks - always loaded
import { useTMDB } from './hooks/useTMDB';
import useTVNavigation from './hooks/useTVNavigation';

// =============================================
// LAZY-LOADED PAGE COMPONENTS
// These are code-split and loaded on-demand
// =============================================

// Main pages (frequently visited)
const Home = lazy(() => import('./pages/Home'));
const Watch = lazy(() => import('./pages/Watch'));
const MyList = lazy(() => import('./pages/MyList'));

// Movie category pages
const TopRated = lazy(() => import('./pages/TopRated'));
const Popular = lazy(() => import('./pages/Popular'));
const Discover = lazy(() => import('./pages/Discover'));
const TrendingNow = lazy(() => import('./pages/TrendingNow'));
const AnimeMovies = lazy(() => import('./pages/AnimeMovies'));

// TV category pages
const TVShows = lazy(() => import('./pages/TVShows'));
const TrendingTV = lazy(() => import('./pages/TrendingTV'));
const TopRatedTV = lazy(() => import('./pages/TopRatedTV'));
const AnimeSeries = lazy(() => import('./pages/AnimeSeries'));
const PopularTV = lazy(() => import('./pages/PopularTV'));

// Streaming service pages
const Netflix = lazy(() => import('./pages/Netflix'));
const Disney = lazy(() => import('./pages/Disney'));
const PrimeVideo = lazy(() => import('./pages/PrimeVideo'));
const AppleTV = lazy(() => import('./pages/AppleTV'));
const HBO = lazy(() => import('./pages/HBO'));
const Viu = lazy(() => import('./pages/Viu'));
const Crunchyroll = lazy(() => import('./pages/Crunchyroll'));
const Peacock = lazy(() => import('./pages/Peacock'));

// Collection & Studio pages
const CollectionDetails = lazy(() => import('./pages/CollectionDetails'));
const StudioPage = lazy(() => import('./pages/StudioPage'));

// IPTV pages (heavy - includes shaka-player)
const IPTV = lazy(() => import('./pages/IPTV'));
const IPTVWatch = lazy(() => import('./pages/IPTVWatch'));

// Sports pages
const Sports = lazy(() => import('./pages/Sports'));
const SportsWatch = lazy(() => import('./pages/SportsWatch'));

// Music page
const Music = lazy(() => import('./pages/Music'));

// Info pages (rarely visited)
const About = lazy(() => import('./pages/About'));
const Disclaimer = lazy(() => import('./pages/Disclaimer'));
const DataPolicy = lazy(() => import('./pages/DataPolicy'));
const TermsOfService = lazy(() => import('./pages/TermsOfService'));
const Contact = lazy(() => import('./pages/Contact'));


function App() {
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { searchTMDB, movieGenres, tvGenres, fetchCredits, fetchContentRating } = useTMDB();
  const navigate = useNavigate();
  const location = useLocation();

  // Enable TV remote / D-pad arrow key navigation
  useTVNavigation();

  const handleSearch = async (query) => {
    if (!query.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    try {
      const results = await searchTMDB(query);
      setSearchResults(results);
    } catch (error) {
      console.error('Search error:', error);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
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
    setSearchResults([]);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setSelectedItem(null);
  };

  return (
    <ToastProvider>
      <ViewerCountProvider>
        <div className="App">
          {/* VisitorTracker disabled */}
          <BotProtection />
          <AdblockModal />
          <ScrollToTop />
          <ScrollToTopButton />
          <Toast />
          {/* Hide Navbar on watch pages for focused viewing */}
          {!location.pathname.startsWith('/watch') &&
            !location.pathname.includes('/iptv/watch') &&
            !location.pathname.includes('/sports/watch') && (
              <Navbar
                onSearch={handleSearch}
                searchResults={searchResults}
                onItemClick={handleItemClick}
                isSearching={isSearching}
              />
            )}

          <main>
            {/* Suspense wrapper for lazy-loaded routes */}
            <Suspense fallback={<PageLoader />}>
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/my-list" element={<MyList />} />
                <Route path="/top-rated" element={<TopRated />} />
                <Route path="/tv-shows" element={<TVShows />} />
                <Route path="/popular" element={<Popular />} />
                <Route path="/discover" element={<Discover />} />
                <Route path="/trending" element={<TrendingNow />} />
                <Route path="/anime-movies" element={<AnimeMovies />} />
                <Route path="/trending-tv" element={<TrendingTV />} />
                <Route path="/top-rated-tv" element={<TopRatedTV />} />
                <Route path="/anime-series" element={<AnimeSeries />} />
                <Route path="/popular-tv" element={<PopularTV />} />
                <Route path="/watch" element={<Watch />} />
                <Route path="/about" element={<About />} />
                <Route path="/disclaimer" element={<Disclaimer />} />
                <Route path="/privacy" element={<DataPolicy />} />
                <Route path="/terms" element={<TermsOfService />} />
                <Route path="/contact" element={<Contact />} />
                <Route path="/collection/:id" element={<CollectionDetails />} />
                <Route path="/netflix" element={<Netflix />} />
                <Route path="/disney" element={<Disney />} />
                <Route path="/prime-video" element={<PrimeVideo />} />
                <Route path="/apple-tv" element={<AppleTV />} />
                <Route path="/hbo" element={<HBO />} />
                <Route path="/viu" element={<Viu />} />
                <Route path="/crunchyroll" element={<Crunchyroll />} />
                <Route path="/peacock" element={<Peacock />} />
                <Route path="/studio/:id" element={<StudioPage />} />
                <Route path="/iptv" element={<IPTV />} />
                <Route path="/iptv/watch/:channelId" element={<IPTVWatch />} />
                <Route path="/sports" element={<Sports />} />
                <Route path="/sports/watch/:matchId" element={<SportsWatch />} />
                <Route path="/music" element={<Music />} />
                <Route path="*" element={<Home />} />
              </Routes>
            </Suspense>
          </main>

          {/* Hide Footer on watch pages for focused viewing */}
          {!location.pathname.startsWith('/watch') &&
            !location.pathname.includes('/iptv/watch') &&
            !location.pathname.includes('/sports/watch') && (
              <Footer />
            )}

          {isModalOpen && selectedItem && (
            <Modal item={selectedItem} onClose={closeModal} />
          )}

          {/* Global Chat - Hidden on Watch pages */}
          {!location.pathname.startsWith('/watch') &&
            !location.pathname.includes('/iptv/watch') &&
            !location.pathname.includes('/sports/watch') && (
              <GlobalChat />
            )}
        </div>
      </ViewerCountProvider>
    </ToastProvider>
  );
}

export default App;