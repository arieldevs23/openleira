import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';

import { useWorkspaceReady } from '@/shared/appReadiness';
import { IS_PLATFORM } from '@/shared/utils';
import { useAuth } from '@/modules/auth/context/AuthContext';
import { Onboarding } from '@/modules/onboarding';
import AuthLoadingScreen from '@/modules/auth/AuthLoadingScreen';
import LoginForm from '@/modules/auth/LoginForm';
import SetupForm from '@/modules/auth/SetupForm';

/** The splash stays up at least this long on app start, even when auth resolves sooner. */
const MIN_SPLASH_MS = 5_000;
/** How long the splash stays mounted, fading, over the app once it may go. Matches `.splash-exit`. */
const SPLASH_EXIT_MS = 500;
/** Upper bound on waiting for the workspace, so a failed projects request cannot pin the splash forever. */
const MAX_SPLASH_MS = 15_000;

type ProtectedRouteProps = {
  children: ReactNode;
};

/** Used by App to gate the routed application behind setup, login and onboarding. */
export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, isLoading, needsSetup, hasCompletedOnboarding, refreshOnboardingStatus } = useAuth();

  const [isSplashHeld, setIsSplashHeld] = useState(true);
  const [hasSplashTimedOut, setHasSplashTimedOut] = useState(false);
  useEffect(() => {
    const hold = window.setTimeout(() => setIsSplashHeld(false), MIN_SPLASH_MS);
    const cap = window.setTimeout(() => setHasSplashTimedOut(true), MAX_SPLASH_MS);
    return () => {
      window.clearTimeout(hold);
      window.clearTimeout(cap);
    };
  }, []);

  // The workspace mounts underneath the splash as soon as auth resolves, so its
  // projects load during the hold and the fade reveals the finished home
  // screen, not a second loading state. Only a signed-in user has a workspace
  // to wait for; the login and setup forms are shown as soon as the hold ends.
  const isWorkspaceReady = useWorkspaceReady();
  const showsWorkspace = IS_PLATFORM ? hasCompletedOnboarding : Boolean(user && hasCompletedOnboarding);
  const isSplashActive = isLoading
    || isSplashHeld
    || (showsWorkspace && !isWorkspaceReady && !hasSplashTimedOut);

  const [hasSplashExited, setHasSplashExited] = useState(false);
  useEffect(() => {
    if (isSplashActive) {
      return;
    }
    const timer = window.setTimeout(() => setHasSplashExited(true), SPLASH_EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [isSplashActive]);

  const splash = isSplashActive || !hasSplashExited
    ? <AuthLoadingScreen exiting={!isSplashActive} />
    : null;

  // Until auth is known there is nothing to mount beneath the splash.
  if (isLoading) {
    return splash;
  }

  if (IS_PLATFORM) {
    if (!hasCompletedOnboarding) {
      return <>{splash}<Onboarding onComplete={refreshOnboardingStatus} /></>;
    }

    return <>{splash}{children}</>;
  }

  if (needsSetup) {
    return <>{splash}<SetupForm /></>;
  }

  if (!user) {
    return <>{splash}<LoginForm /></>;
  }

  if (!hasCompletedOnboarding) {
    return <>{splash}<Onboarding onComplete={refreshOnboardingStatus} /></>;
  }

  return <>{splash}{children}</>;
}
