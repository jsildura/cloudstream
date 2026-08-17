import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useProfiles } from '../contexts/ProfileContext';
import PageLoader from './PageLoader';

/**
 * Route/Component wrapper that ensures an active profile is loaded
 * before rendering cloud-dependent consumers.
 */
export default function RequireActiveProfile({
  children,
  fallback = <PageLoader />,
  signedOutFallback = null,
  requireAuth = true
}) {
  const { isSignedIn, isAuthLoading } = useAuth();
  const { activeProfile, isProfileLoading, profileError } = useProfiles();

  if (isAuthLoading || (isSignedIn && isProfileLoading)) {
    return fallback;
  }

  if (requireAuth && !isSignedIn) {
    return signedOutFallback;
  }

  if (isSignedIn && (!activeProfile || profileError)) {
    return fallback;
  }

  return <>{children}</>;
}
