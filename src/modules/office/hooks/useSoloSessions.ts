import { useCallback, useEffect, useState } from 'react';

import { api, readApiJson } from '@/shared/api';
import type { OfficeSoloSession } from '@/shared/types';

/**
 * The solo view's chat history for one project. The server records a solo
 * chat when it creates it, so `reload` after a new chat starts is enough.
 */
export function useSoloSessions(projectId: string) {
  // The project's solo chats, most recently active first; null until the first load.
  const [sessions, setSessions] = useState<OfficeSoloSession[] | null>(null);
  // Error of the last load, shown above the list.
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const body = await readApiJson<{ data: { sessions: OfficeSoloSession[] } }>(await api.office.soloSessions(projectId));
      setSessions(body.data.sessions);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
      setSessions((current) => current ?? []);
    }
  }, [projectId]);

  // The solo view is keyed by project, so a project switch starts from a fresh hook.
  useEffect(() => {
    void load();
  }, [load]);

  return { sessions, error, reload: load };
}
