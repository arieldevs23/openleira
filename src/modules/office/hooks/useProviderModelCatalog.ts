import { useEffect, useState } from 'react';

import { api } from '@/shared/api';
import type { LLMProvider, OfficeModelGroup, ProviderModelsDefinition } from '@/shared/types';

/** Providers an office agent can run on, in the order the model menus list them. */
const PROVIDERS: LLMProvider[] = ['claude', 'codex', 'cursor', 'opencode'];

let cachedGroups: OfficeModelGroup[] | null = null;
let inFlight: Promise<OfficeModelGroup[]> | null = null;

/**
 * Fetches every provider's model catalog once per page load. A provider whose
 * catalog cannot be read is simply left out of the menu.
 */
async function loadOfficeModelGroups(): Promise<OfficeModelGroup[]> {
  if (cachedGroups) {
    return cachedGroups;
  }
  inFlight ??= (async () => {
    const groups = await Promise.all(PROVIDERS.map(async (provider): Promise<OfficeModelGroup | null> => {
      try {
        const response = await api.providers.models(provider);
        const body = await response.json() as { success?: boolean; data?: { models?: ProviderModelsDefinition } };
        const options = body.data?.models?.OPTIONS ?? [];
        return options.length > 0 ? { provider, options } : null;
      } catch {
        return null;
      }
    }));
    const loaded = groups.filter((group): group is OfficeModelGroup => group !== null);
    // An all-failed load is not cached, so opening the page again retries.
    if (loaded.length > 0) {
      cachedGroups = loaded;
    }
    inFlight = null;
    return loaded;
  })();
  return inFlight;
}

/** The model catalog of every provider, grouped for the agent model dropdowns. */
export function useProviderModelCatalog() {
  // Loaded groups; starts from the module cache so reopening the page renders instantly.
  const [groups, setGroups] = useState<OfficeModelGroup[]>(cachedGroups ?? []);

  useEffect(() => {
    let cancelled = false;
    void loadOfficeModelGroups().then((loaded) => {
      if (!cancelled) {
        setGroups(loaded);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return groups;
}
