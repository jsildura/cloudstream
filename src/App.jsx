import { Suspense, useEffect } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import ErrorBoundary from './components/ErrorBoundary';
import { lazyRetry } from './utils/lazyRetry';

// Core components - always loaded (small, needed immediately)
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import ScrollToTop from './components/ScrollToTop';
import ScrollToTopButton from './components/ScrollToTopButton';
import AdblockModal from './components/AdblockModal';
import PopunderLoader from './components/PopunderLoader';
import SocialBarLoader from './components/SocialBarLoader';
import BotProtection from './components/BotProtection';
import Toast from './components/Toast';
import PageLoader from './components/PageLoader';
import UpdatePrompt from './components/UpdatePrompt';
import UpdateModal from './components/UpdateModal';
import KidsFeatureGuard from './components/KidsFeatureGuard';
import KidsRatedWatchGuard from './components/KidsRatedWatchGuard';

// Deferred — pulls in Firebase, only needed after first paint
const GlobalChat = lazyRetry(() => import('./components/GlobalChat'));

// Context providers - always loaded
import { ViewerCountProvider } from './contexts/ViewerCountContext';
import { HoverPreviewProvider } from './contexts/HoverPreviewContext';

// Hooks - always loaded
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
const Home = lazyRetry(() => import('./pages/Home'));
const Watch = lazyRetry(() => import('./pages/Watch'));
const MyList = lazyRetry(() => import('./pages/MyList'));

// Watch is keyed by URL so navigating watch → watch (movie auto-next) mounts
// a fresh instance. Without a key React reuses the mounted component and the
// old movie's player/progress/recommendations leak into the next one.
const KeyedWatch = () => {
  const location = useLocation();
  return <Watch key={location.pathname + location.search} />;
};

// Movie category pages
const Discover = lazyRetry(() => import('./pages/Discover'));

// TV category pages
const TVShows = lazyRetry(() => import('./pages/TVShows'));

// Streaming service pages
const StreamingProviderPage = lazyRetry(() => import('./pages/StreamingProviderPage'));

// Collection & Studio pages
const CollectionDetails = lazyRetry(() => import('./pages/CollectionDetails'));
const StudioPage = lazyRetry(() => import('./pages/StudioPage'));

// IPTV pages (heavy - includes shaka-player)
const IPTV = lazyRetry(() => import('./pages/IPTV'));
const IPTVWatch = lazyRetry(() => import('./pages/IPTVWatch'));

// Sports pages
const Sports = lazyRetry(() => import('./pages/Sports'));
const SportsWatch = lazyRetry(() => import('./pages/SportsWatch'));

// Music pages (native React port of tidal-ui)
const MusicApp = lazyRetry(() => import('./pages/music/MusicApp'));
const MusicHome = lazyRetry(() => import('./pages/music/MusicHome'));
const MusicAlbum = lazyRetry(() => import('./pages/music/MusicAlbum'));
const MusicArtist = lazyRetry(() => import('./pages/music/MusicArtist'));
const MusicTrack = lazyRetry(() => import('./pages/music/MusicTrack'));
const MusicPlaylist = lazyRetry(() => import('./pages/music/MusicPlaylist'));

// Info pages (rarely visited)
const About = lazyRetry(() => import('./pages/About'));
const Disclaimer = lazyRetry(() => import('./pages/Disclaimer'));
const DataPolicy = lazyRetry(() => import('./pages/DataPolicy'));
const TermsOfService = lazyRetry(() => import('./pages/TermsOfService'));
const Contact = lazyRetry(() => import('./pages/Contact'));
const Search = lazyRetry(() => import('./pages/Search'));
const PersonPage = lazyRetry(() => import('./pages/PersonPage'));
const NotFound = lazyRetry(() => import('./pages/NotFound'));


import { useProfiles } from './contexts/ProfileContext';

function App() {
  const location = useLocation();
  const { isKidsMode } = useProfiles();

  // Enable TV remote / D-pad arrow key navigation
  useTVNavigation({ resetOnPathChange: location.pathname });
  // Map hardware Back button and media transport keys
  useTVRemoteKeys();

  // Signal that React app is mounted and ready - hides the HTML splash screen
  useEffect(() => {
    window.dispatchEvent(new Event('app-ready'));
  }, []);

  return (
    <ViewerCountProvider>
      <HoverPreviewProvider>
      <div className="App">
        {/* VisitorTracker disabled */}
        <BotProtection />
        <AdblockModal />
        <PopunderLoader />
        <SocialBarLoader />
        <ScrollToTop />
        <UpdatePrompt />
        <UpdateModal />
        {/* Hide ScrollToTopButton on music pages */}
        {!location.pathname.startsWith('/music') && <ScrollToTopButton />}
        <Toast />
        {/* Hide Navbar on watch pages for focused viewing */}
        {!location.pathname.startsWith('/watch') &&
          !location.pathname.includes('/iptv/watch') &&
          !location.pathname.includes('/sports/watch') && (
            <Navbar />
          )}

        <main>
          {/* Suspense wrapper for lazy-loaded routes guarded by ErrorBoundary keyed by pathname */}
          <ErrorBoundary key={location.pathname}>
            <Suspense fallback={<PageLoader />}>
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/my-list" element={<MyList />} />
                <Route path="/tv-shows" element={<TVShows />} />
                <Route path="/discover" element={<Discover />} />
                <Route path="/watch" element={<KidsRatedWatchGuard><KeyedWatch /></KidsRatedWatchGuard>} />
                <Route path="/about" element={<About />} />
                <Route path="/disclaimer" element={<Disclaimer />} />
                <Route path="/privacy" element={<DataPolicy />} />
                <Route path="/terms" element={<TermsOfService />} />
                <Route path="/contact" element={<Contact />} />
                <Route path="/collection/:id" element={<CollectionDetails />} />
                {['netflix', 'disney', 'prime-video', 'apple-tv', 'hbo', 'viu', 'crunchyroll', 'peacock']
                  .map(path => <Route key={path} path={`/${path}`} element={<StreamingProviderPage />} />)}
                <Route path="/studio/:id" element={<StudioPage />} />
                <Route path="/iptv" element={<KidsFeatureGuard><IPTV /></KidsFeatureGuard>} />
                <Route path="/iptv/watch/:channelId" element={<KidsFeatureGuard><IPTVWatch /></KidsFeatureGuard>} />
                {/* Temporarily disabled - <Route path="/sports" element={<Sports />} /> */}
                <Route path="/sports/watch/:matchId" element={<KidsFeatureGuard><SportsWatch /></KidsFeatureGuard>} />
                {/* Temporarily disabled - Music routes
                <Route path="/music" element={<MusicApp />}>
                  <Route index element={<MusicHome />} />
                  <Route path="album/:id" element={<MusicAlbum />} />
                  <Route path="artist/:id" element={<MusicArtist />} />
                  <Route path="track/:id" element={<MusicTrack />} />
                  <Route path="playlist/:id" element={<MusicPlaylist />} />
                </Route>
                */}
                <Route path="/search" element={<Search />} />
                <Route path="/person/:id" element={<KidsFeatureGuard><PersonPage /></KidsFeatureGuard>} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </ErrorBoundary>
        </main>

        {/* Hide Footer on watch/music pages for focused viewing */}
        {!location.pathname.startsWith('/watch') &&
          !location.pathname.startsWith('/music') &&
          !location.pathname.includes('/iptv/watch') &&
          !location.pathname.includes('/sports/watch') && (
            <Footer />
          )}

        {/* Global Chat - Hidden on Watch and Music pages, and completely disabled in Kids mode */}
        {!isKidsMode &&
          !location.pathname.startsWith('/watch') &&
          !location.pathname.startsWith('/music') &&
          !location.pathname.includes('/iptv/watch') &&
          !location.pathname.includes('/sports/watch') && (
            <ErrorBoundary fallback={null}>
              <Suspense fallback={null}>
                <GlobalChat />
              </Suspense>
            </ErrorBoundary>
          )}
      </div>
      </HoverPreviewProvider>
    </ViewerCountProvider>
  );
}

export default App;