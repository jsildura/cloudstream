import { useState } from 'react';
import { Routes, Route, useNavigate } from 'react-router-dom';
import Navbar from './components/Navbar';
import Home from './pages/Home';
import Movies from './pages/Movies';
import TVShows from './pages/TVShows';
import Popular from './pages/Popular';
import Watch from './pages/Watch';
import About from './pages/About';
import Disclaimer from './pages/Disclaimer';
import CollectionDetails from './pages/CollectionDetails';
import Netflix from './pages/Netflix';
import Disney from './pages/Disney';
import PrimeVideo from './pages/PrimeVideo';
import AppleTV from './pages/AppleTV';
import HBO from './pages/HBO';
import Viu from './pages/Viu';
import MyList from './pages/MyList';
import Modal from './components/Modal';
import { useTMDB } from './hooks/useTMDB';
import Footer from './components/Footer';
import ScrollToTop from './components/ScrollToTop';
import AdblockModal from './components/AdblockModal';
import BotProtection from './components/BotProtection';
import VisitorTracker from './components/VisitorTracker';
import { ToastProvider } from './contexts/ToastContext';
import Toast from './components/Toast';
import useTVNavigation from './hooks/useTVNavigation';


function App() {
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { searchTMDB, movieGenres, tvGenres, fetchCredits, fetchContentRating } = useTMDB();
  const navigate = useNavigate();

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
        <VisitorTracker />
        <BotProtection />
        <AdblockModal />
        <ScrollToTop />
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
            <Route path="/movies" element={<Movies />} />
            <Route path="/tv-shows" element={<TVShows />} />
            <Route path="/popular" element={<Popular />} />
            <Route path="/watch" element={<Watch />} />
            <Route path="/about" element={<About />} />
            <Route path="/disclaimer" element={<Disclaimer />} />
            <Route path="/collection/:id" element={<CollectionDetails />} />
            <Route path="/netflix" element={<Netflix />} />
            <Route path="/disney" element={<Disney />} />
            <Route path="/prime-video" element={<PrimeVideo />} />
            <Route path="/apple-tv" element={<AppleTV />} />
            <Route path="/hbo" element={<HBO />} />
            <Route path="/viu" element={<Viu />} />
            <Route path="*" element={<Home />} />
          </Routes>
        </main>
        <Footer />

        {isModalOpen && selectedItem && (
          <Modal item={selectedItem} onClose={closeModal} />
        )}
      </div>
    </ToastProvider>
  );
}

export default App;