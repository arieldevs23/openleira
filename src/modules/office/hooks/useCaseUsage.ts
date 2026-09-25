import { useCallback, useEffect, useRef, useState } from 'react';

import { api, readApiJson } from '@/shared/api';
import { useWebSocket } from '@/shared/context/WebSocketContext';
import type { OfficeCaseUsage, OfficeUpdateEvent } from '@/shared/types';

/** Transcripts are written as a turn runs; reading them once a burst of frames settles is enough. */
const REFRESH_DEBOUNCE_MS = 1500;

/**
 * Token use of a case, read from the providers' transcripts. Re-read when the
 * case's tasks or the case itself change (a turn finished, a task moved on),
 * so the numbers follow the work without polling.
 */
export function useCaseUsage(officeId: string | null, caseId: string | null) {
  const { subscribe } = useWebSocket();
  // The latest usage of the case; null before the first read or without a case.
  const [usage, setUsage] = useState<OfficeCaseUsage | null>(null);
  const timerRef = useRef<number | null>(null);

  const load = useCallback(async () => {
    if (!officeId || !caseId) {
      setUsage(null);
      return;
    }
    try {
      const body = await readApiJson<{ data: OfficeCaseUsage }>(await api.office.caseUsage(officeId, caseId));
      setUsage(body.data.caseId === caseId ? body.data : null);
    } catch {
      // Usage is a side panel; a failed read keeps the last numbers.
    }
  }, [caseId, officeId]);

  useEffect(() => {
    setUsage(null);
    void load();
  }, [load]);

  useEffect(() => {
    const unsubscribe = subscribe((event) => {
      if (event.kind !== 'office:update') {
        return;
      }
      const update = event as unknown as OfficeUpdateEvent;
      if (update.officeId !== officeId) {
        return;
      }
      const { change } = update;
      const touchesCase = (change.entity === 'task' && change.task.caseId === caseId)
        || (change.entity === 'case' && change.id === caseId);
      if (!touchesCase) {
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
  }, [caseId, load, officeId, subscribe]);

  return usage;
}
