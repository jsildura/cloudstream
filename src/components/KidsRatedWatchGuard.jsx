import React, { useState, useEffect } from 'react';
import { useSearchParams, Navigate } from 'react-router-dom';
import { useProfiles } from '../contexts/ProfileContext';
import { useToast } from '../contexts/ToastContext';
import { getKidsRating } from '../lib/tmdbClient';
import PageLoader from './PageLoader';

/**
 * Route guard that validates search params on /watch and strictly gates
 * Kids mode playback to US G/PG movies and TV-Y..TV-PG television series.
 */
const KidsRatedWatchGuard = ({ children }) => {
  const [searchParams] = useSearchParams();
  const { isKidsMode, isProfileLoading } = useProfiles();
  const { showError } = useToast();

  const rawType = searchParams.get('type');
  const rawId = searchParams.get('id');
  const rawSeason = searchParams.get('season');
  const rawEpisode = searchParams.get('episode');

  const type = rawType ? rawType.toLowerCase() : null;
  const numId = rawId ? parseInt(rawId, 10) : NaN;

  // Basic param validation
  const isValidType = type === 'movie' || type === 'tv';
  const isValidId = Number.isInteger(numId) && numId > 0;

  let isValidTvParams = true;
  if (type === 'tv') {
    if (rawSeason !== null) {
      const s = parseInt(rawSeason, 10);
      if (!Number.isInteger(s) || s < 0) isValidTvParams = false;
    }
    if (rawEpisode !== null) {
      const ep = parseInt(rawEpisode, 10);
      if (!Number.isInteger(ep) || ep < 0) isValidTvParams = false;
    }
  }

  const isValidParams = isValidType && isValidId && isValidTvParams;

  const [ratingStatus, setRatingStatus] = useState(() => {
    if (!isValidParams) return 'invalid-params';
    return isKidsMode ? 'checking' : 'approved';
  });

  useEffect(() => {
    if (!isValidParams) {
      setRatingStatus('invalid-params');
      return;
    }

    if (isProfileLoading) {
      return;
    }

    if (!isKidsMode) {
      setRatingStatus('approved');
      return;
    }

    let isMounted = true;
    const controller = new AbortController();
    setRatingStatus('checking');

    async function checkRating() {
      try {
        const check = await getKidsRating(type, numId, { signal: controller.signal });
        if (!isMounted) return;

        if (check.approved) {
          setRatingStatus('approved');
        } else {
          setRatingStatus('rejected');
          showError('This title is not available in Kids mode.');
        }
      } catch (err) {
        if (!isMounted || err?.name === 'AbortError') return;
        setRatingStatus('rejected');
        showError('This title is not available in Kids mode.');
      }
    }

    checkRating();

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [type, numId, isValidParams, isKidsMode, isProfileLoading, showError]);

  if (!isValidParams) {
    return <Navigate to="/" replace />;
  }

  if (isProfileLoading || ratingStatus === 'checking') {
    return <PageLoader />;
  }

  if (ratingStatus === 'rejected') {
    return <Navigate to="/" replace />;
  }

  return children || null;
};

export default KidsRatedWatchGuard;
