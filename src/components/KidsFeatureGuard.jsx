import React, { useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useProfiles } from '../contexts/ProfileContext';
import { useToast } from '../contexts/ToastContext';

/**
 * Route guard that completely blocks access to unavailable features in Kids mode
 * (e.g. /iptv, /iptv/watch, /sports/watch, /person) without opening the PIN modal.
 */
const KidsFeatureGuard = ({ children }) => {
  const { isKidsMode, isProfileLoading } = useProfiles();
  const { showError } = useToast();

  useEffect(() => {
    if (!isProfileLoading && isKidsMode) {
      showError('This feature is unavailable in Kids mode.');
    }
  }, [isKidsMode, isProfileLoading, showError]);

  if (isProfileLoading) {
    return null;
  }

  if (isKidsMode) {
    return <Navigate to="/" replace />;
  }

  return children || null;
};

export default KidsFeatureGuard;
