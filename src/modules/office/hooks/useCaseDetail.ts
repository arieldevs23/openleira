import { useCallback, useEffect, useState } from 'react';

import { api, readApiJson } from '@/shared/api';
import { useWebSocket } from '@/shared/context/WebSocketContext';
import type { OfficeCaseDetail, OfficeUpdateEvent } from '@/shared/types';

/**
 * Loads one case's tasks and message bus and patches them from
 * `office:update` frames, so the timeline and tree move live.
 */
export function useCaseDetail(officeId: string | null, caseId: string | null) {
  const { subscribe } = useWebSocket();
  // The selected case with its tasks and messages; null until loaded or when nothing is selected.
  const [detail, setDetail] = useState<OfficeCaseDetail | null>(null);

  const load = useCallback(async () => {
    if (!officeId || !caseId) {
      setDetail(null);
      return;
    }
    try {
      const response = await api.office.caseDetail(officeId, caseId);
      const body = await readApiJson<{ data: OfficeCaseDetail }>(response);
      setDetail(body.data);
    } catch (error) {
      console.error('[Office] Failed to load case', error);
      setDetail(null);
    }
  }, [officeId, caseId]);

  useEffect(() => {
    setDetail(null);
    void load();
  }, [load]);

  useEffect(() => subscribe((event) => {
    if (event.kind === 'websocket_reconnected') {
      void load();
      return;
    }
    if (event.kind !== 'office:update' || !caseId) {
      return;
    }
    const { change, officeId: eventOfficeId } = event as unknown as OfficeUpdateEvent;
    if (eventOfficeId !== officeId) {
      return;
    }

    setDetail((current) => {
      if (!current) {
        return current;
      }
      switch (change.entity) {
        case 'case':
          if (change.id !== caseId) return current;
          return change.case ? { ...current, case: change.case } : null;
        case 'task': {
          if (change.task.caseId !== caseId) return current;
          const exists = current.tasks.some((task) => task.id === change.task.id);
          const tasks = exists
            ? current.tasks.map((task) => (task.id === change.task.id ? change.task : task))
            : [...current.tasks, change.task].sort((left, right) => left.sortOrder - right.sortOrder);
          return { ...current, tasks };
        }
        case 'message':
          if (change.message.caseId !== caseId || current.messages.some((message) => message.id === change.message.id)) {
            return current;
          }
          return { ...current, messages: [...current.messages, change.message] };
        default:
          return current;
      }
    });
  }), [caseId, load, officeId, subscribe]);

  return detail;
}
