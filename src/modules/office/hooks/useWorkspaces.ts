import { useCallback, useEffect, useRef, useState } from 'react';

import { api, readApiJson } from '@/shared/api';
import { useWebSocket } from '@/shared/context/WebSocketContext';
import type { OfficeUpdateEvent, OfficeWorkspaceSummary } from '@/shared/types';

/** Case and office frames arrive in bursts while a case runs; one refetch covers a burst. */
const REFRESH_DEBOUNCE_MS = 400;

/**
 * Every workspace for the workspace sidebar. Refetched when an `office:update`
 * frame says an office or a case changed (names, new workspaces, live case
 * counts), never on a timer.
 */
export function useWorkspaces() {
  const { subscribe } = useWebSocket();
  // The workspaces, newest first; null until the first load finishes.
  const [workspaces, setWorkspaces] = useState<OfficeWorkspaceSummary[] | null>(null);
  // Error of the last load, shown in the sidebar with a retry.
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);

  const load = useCallback(async () => {
    try {
      const body = await readApiJson<{ data: { workspaces: OfficeWorkspaceSummary[] } }>(await api.office.workspaces());
      setWorkspaces(body.data.workspaces);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
      setWorkspaces((current) => current ?? []);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const unsubscribe = subscribe((event) => {
      if (event.kind === 'websocket_reconnected') {
        void load();
        return;
      }
      if (event.kind !== 'office:update') {
        return;
      }
      const { change } = event as unknown as OfficeUpdateEvent;
      if (change.entity !== 'office' && change.entity !== 'case' && change.entity !== 'deleted') {
        return;
      }
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        void load();
      }, REFRESH_DEBOUNCE_MS);
    });
    return () => {
      unsubscribe();
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, [load, subscribe]);

  return { workspaces, error, reload: load };
}
