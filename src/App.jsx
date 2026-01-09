import { useState } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import Navbar from './components/Navbar';
import Home from './pages/Home';
import TopRated from './pages/TopRated';
import TVShows from './pages/TVShows';
import Popular from './pages/Popular';
import Discover from './pages/Discover';
import TrendingNow from './pages/TrendingNow';
import AnimeMovies from './pages/AnimeMovies';
import TrendingTV from './pages/TrendingTV';
import TopRatedTV from './pages/TopRatedTV';
import AnimeSeries from './pages/AnimeSeries';
import PopularTV from './pages/PopularTV';
import Watch from './pages/Watch';
import About from './pages/About';
import Disclaimer from './pages/Disclaimer';
import DataPolicy from './pages/DataPolicy';
import TermsOfService from './pages/TermsOfService';
import Contact from './pages/Contact';
import CollectionDetails from './pages/CollectionDetails';
import Netflix from './pages/Netflix';
import Disney from './pages/Disney';
import PrimeVideo from './pages/PrimeVideo';
import AppleTV from './pages/AppleTV';
import HBO from './pages/HBO';
import Viu from './pages/Viu';
import Crunchyroll from './pages/Crunchyroll';
import Peacock from './pages/Peacock';
import StudioPage from './pages/StudioPage';
import MyList from './pages/MyList';
import IPTV from './pages/IPTV';
import IPTVWatch from './pages/IPTVWatch';
import Sports from './pages/Sports';
import SportsWatch from './pages/SportsWatch';
import Modal from './components/Modal';
import { useTMDB } from './hooks/useTMDB';
import Footer from './components/Footer';
import ScrollToTop from './components/ScrollToTop';
import ScrollToTopButton from './components/ScrollToTopButton';
import AdblockModal from './components/AdblockModal';
import BotProtection from './components/BotProtection';
// VisitorTracker disabled
import { ToastProvider } from './contexts/ToastContext';
import Toast from './components/Toast';
import useTVNavigation from './hooks/useTVNavigation';
import GlobalChat from './components/GlobalChat';


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
      <div className="App">
        {/* VisitorTracker disabled */}
        <BotProtection />
        <AdblockModal />
        <ScrollToTop />
        <ScrollToTopButton />
        <Toast />
        <Navbar
          onSearch={handleSearch}
          searchResults={searchResults}
          onItemClick={handleItemClick}
          isSearching={isSearching}
        />

        <main>
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
            <Route path="*" element={<Home />} />
          </Routes>
        </main>
        <Footer />

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
    </ToastProvider>
  );
}

export default App;