import { useState, useEffect } from 'react';

/**
 * Custom hook to detect if the application is running on a TV-sized screen.
 * This is used to disable expensive JavaScript operations (like momentum scrolling,
 * frequent polling, or auto-playing carousels) on lower-powered smart TV processors.
 * @returns {boolean} True if the viewport is ≥ 1920px (1080p TV resolution or higher)
 */
const useTVDetect = () => {
  const [isTVMode, setIsTVMode] = useState(false);

  useEffect(() => {
    // Check initial window size
    const checkTVMode = () => {
      setIsTVMode(window.innerWidth >= 1920);
    };

    // Initial check
    checkTVMode();

    // Listen for resize events
    window.addEventListener('resize', checkTVMode);
    
    // Cleanup
    return () => window.removeEventListener('resize', checkTVMode);
  }, []);

  return isTVMode;
};

export default useTVDetect;
