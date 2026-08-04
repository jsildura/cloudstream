import { useState, lazy, Suspense, useEffect } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';

// Core components - always loaded (small, needed immediately)
import Navbar from './components/Navbar';
import Modal from './components/Modal';
import Footer from './components/Footer';
import ScrollToTop from './components/ScrollToTop';
import ScrollToTopButton from './components/ScrollToTopButton';
import AdblockModal from './components/AdblockModal';
import BotProtection from './components/BotProtection';
import Toast from './components/Toast';
import PageLoader from './components/PageLoader';
import UpdatePrompt from './components/UpdatePrompt';

// Deferred — pulls in Firebase, only needed after first paint
const GlobalChat = lazy(() => import('./components/GlobalChat'));

// Context providers - always loaded
import { ToastProvider } from './contexts/ToastContext';
import { ViewerCountProvider } from './contexts/ViewerCountContext';
import { HoverPreviewProvider } from './contexts/HoverPreviewContext';

// Hooks - always loaded
import { useTMDB } from './hooks/useTMDB';
import useTVNavigation from './hooks/useTVNavigation';
import useTVRemoteKeys from './hooks/useTVRemoteKeys';

// ─── Audio unlock: on the very first user interaction, create a silent
// AudioContext and resume it.  This "primes" the browser so that later
// unmuted media playback (YouTube embed, <video>, etc.) is permitted.
// Also pre-loads the YouTube Iframe API so it's cached before any hover
// preview opens.
const unlockAudio = () => {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        // Play a silent buffer to fully activate the context
        const buf = ctx.createBuffer(1, 1, 22050);
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.connect(ctx.destination);
        src.start(0);
        if (ctx.state === 'suspended') ctx.resume();
    } catch { /* AudioContext not supported — ignore */ }

    // Pre-load YouTube Iframe API script so it's ready when needed
    if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
        const tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        tag.async = true;
        document.head.appendChild(tag);
    }

    // One-shot: remove all listeners after first interaction
    ['click', 'touchstart', 'keydown'].forEach(evt =>
        document.removeEventListener(evt, unlockAudio, { capture: true })
    );
};
['click', 'touchstart', 'keydown'].forEach(evt =>
    document.addEventListener(evt, unlockAudio, { capture: true, once: false, passive: true })
);

// =============================================
// LAZY-LOADED PAGE COMPONENTS
// These are code-split and loaded on-demand
// =============================================

// Main pages (frequently visited)
const Home = lazy(() => import('./pages/Home'));
const Watch = lazy(() => import('./pages/Watch'));
const MyList = lazy(() => import('./pages/MyList'));

// Movie category pages
const Discover = lazy(() => import('./pages/Discover'));

// TV category pages
const TVShows = lazy(() => import('./pages/TVShows'));

// Streaming service pages
const StreamingProviderPage = lazy(() => import('./pages/StreamingProviderPage'));

// Collection & Studio pages
const CollectionDetails = lazy(() => import('./pages/CollectionDetails'));
const StudioPage = lazy(() => import('./pages/StudioPage'));

// IPTV pages (heavy - includes shaka-player)
const IPTV = lazy(() => import('./pages/IPTV'));
const IPTVWatch = lazy(() => import('./pages/IPTVWatch'));

// Sports pages
const Sports = lazy(() => import('./pages/Sports'));
const SportsWatch = lazy(() => import('./pages/SportsWatch'));

// Music pages (native React port of tidal-ui)
const MusicApp = lazy(() => import('./pages/music/MusicApp'));
const MusicHome = lazy(() => import('./pages/music/MusicHome'));
const MusicAlbum = lazy(() => import('./pages/music/MusicAlbum'));
const MusicArtist = lazy(() => import('./pages/music/MusicArtist'));
const MusicTrack = lazy(() => import('./pages/music/MusicTrack'));
const MusicPlaylist = lazy(() => import('./pages/music/MusicPlaylist'));

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

  const location = useLocation();

  // Enable TV remote / D-pad arrow key navigation
  useTVNavigation({ resetOnPathChange: location.pathname });
  // Map hardware Back button and media transport keys
  useTVRemoteKeys();

  // Signal that React app is mounted and ready - hides the HTML splash screen
  useEffect(() => {
    window.dispatchEvent(new Event('app-ready'));
  }, []);

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
        <HoverPreviewProvider>
        <div className="App">
          {/* VisitorTracker disabled */}
          <BotProtection />
          <AdblockModal />
          <ScrollToTop />
          <UpdatePrompt />
          {/* Hide ScrollToTopButton on music pages */}
          {!location.pathname.startsWith('/music') && <ScrollToTopButton />}
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
                <Route path="/tv-shows" element={<TVShows />} />
                <Route path="/discover" element={<Discover />} />
                <Route path="/watch" element={<Watch />} />
                <Route path="/about" element={<About />} />
                <Route path="/disclaimer" element={<Disclaimer />} />
                <Route path="/privacy" element={<DataPolicy />} />
                <Route path="/terms" element={<TermsOfService />} />
                <Route path="/contact" element={<Contact />} />
                <Route path="/collection/:id" element={<CollectionDetails />} />
                {['netflix', 'disney', 'prime-video', 'apple-tv', 'hbo', 'viu', 'crunchyroll', 'peacock']
                  .map(path => <Route key={path} path={`/${path}`} element={<StreamingProviderPage />} />)}
                <Route path="/studio/:id" element={<StudioPage />} />
                <Route path="/iptv" element={<IPTV />} />
                <Route path="/iptv/watch/:channelId" element={<IPTVWatch />} />
                {/* Temporarily disabled - <Route path="/sports" element={<Sports />} /> */}
                <Route path="/sports/watch/:matchId" element={<SportsWatch />} />
                {/* Temporarily disabled - Music routes
                <Route path="/music" element={<MusicApp />}>
                  <Route index element={<MusicHome />} />
                  <Route path="album/:id" element={<MusicAlbum />} />
                  <Route path="artist/:id" element={<MusicArtist />} />
                  <Route path="track/:id" element={<MusicTrack />} />
                  <Route path="playlist/:id" element={<MusicPlaylist />} />
                </Route>
                */}
                <Route path="*" element={<Home />} />
              </Routes>
            </Suspense>
          </main>

          {/* Hide Footer on watch/music pages for focused viewing */}
          {!location.pathname.startsWith('/watch') &&
            !location.pathname.startsWith('/music') &&
            !location.pathname.includes('/iptv/watch') &&
            !location.pathname.includes('/sports/watch') && (
              <Footer />
            )}

          {isModalOpen && selectedItem && (
            <Modal item={selectedItem} onClose={closeModal} />
          )}

          {/* Global Chat - Hidden on Watch and Music pages */}
          {!location.pathname.startsWith('/watch') &&
            !location.pathname.startsWith('/music') &&
            !location.pathname.includes('/iptv/watch') &&
            !location.pathname.includes('/sports/watch') && (
              <Suspense fallback={null}>
                <GlobalChat />
              </Suspense>
            )}
        </div>
        </HoverPreviewProvider>
      </ViewerCountProvider>
    </ToastProvider>
  );
}

export default App;