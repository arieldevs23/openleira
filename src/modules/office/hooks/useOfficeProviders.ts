import { useCallback, useEffect, useMemo, useState } from 'react';

import { useProviderAuthStatus } from '@/modules/provider-auth';
import type { LLMProvider } from '@/shared/types';

/** Providers an office agent can run on, in the order the setup step lists them. */
export const OFFICE_PROVIDERS: LLMProvider[] = ['claude', 'codex', 'cursor', 'opencode'];

/** Display name of each provider in the office setup step and model menus. */
export const OFFICE_PROVIDER_LABELS: Record<LLMProvider, string> = {
  claude: 'Claude',
  codex: 'Codex',
  cursor: 'Cursor',
  opencode: 'OpenCode',
};

/**
 * Login state of every provider for the office page. Only a connected
 * provider's models are offered to agents, and the setup step lets the user
 * log in to the others through the same login shell as onboarding.
 */
export function useOfficeProviders() {
  const { providerAuthStatus, checkProviderAuthStatus, refreshProviderAuthStatuses } = useProviderAuthStatus();
  // The provider whose login shell is open, or null when none is.
  const [loginProvider, setLoginProvider] = useState<LLMProvider | null>(null);

  useEffect(() => {
    void refreshProviderAuthStatuses(OFFICE_PROVIDERS);
  }, [refreshProviderAuthStatuses]);

  const isChecking = OFFICE_PROVIDERS.some((provider) => providerAuthStatus[provider].loading);
  const connected = useMemo(
    () => OFFICE_PROVIDERS.filter((provider) => providerAuthStatus[provider].authenticated),
    [providerAuthStatus],
  );

  /** Closes the login shell and re-reads the provider it was for. */
  const closeLogin = useCallback(() => {
    const provider = loginProvider;
    setLoginProvider(null);
    if (provider) {
      void refreshProviderAuthStatuses([provider]);
    }
  }, [loginProvider, refreshProviderAuthStatuses]);

  /** Re-reads the provider as soon as its login command exits cleanly, while the shell stays open. */
  const onLoginComplete = useCallback((exitCode: number) => {
    if (exitCode === 0 && loginProvider) {
      void checkProviderAuthStatus(loginProvider);
    }
  }, [checkProviderAuthStatus, loginProvider]);

  return {
    statuses: providerAuthStatus,
    connected,
    isChecking,
    refresh: () => refreshProviderAuthStatuses(OFFICE_PROVIDERS),
    loginProvider,
    openLogin: setLoginProvider,
    closeLogin,
    onLoginComplete,
  };
}
