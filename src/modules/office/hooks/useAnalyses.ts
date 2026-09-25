import { useCallback, useEffect, useState } from 'react';

import { api, readApiJson } from '@/shared/api';
import { useWebSocket } from '@/shared/context/WebSocketContext';
import type { OfficeAnalysis, OfficeAnalysisEvent } from '@/shared/types';

/**
 * App analyses the add-workspace flow can come back to (running, or finished
 * and not yet turned into a workspace), kept live from `office:analysis`
 * frames. They run on the server, so closing the dialog does not stop them;
 * the workspace sidebar lists them so the user can reopen one.
 */
export function useAnalyses() {
  const { subscribe } = useWebSocket();
  // Analyses by id, newest first when listed.
  const [analyses, setAnalyses] = useState<OfficeAnalysis[]>([]);

  const load = useCallback(async () => {
    try {
      const body = await readApiJson<{ data: { analyses: OfficeAnalysis[] } }>(await api.office.analyses());
      setAnalyses(body.data.analyses);
    } catch {
      // The list is a convenience; the dialog still works without it.
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => subscribe((event) => {
    if (event.kind === 'websocket_reconnected') {
      void load();
      return;
    }
    if (event.kind !== 'office:analysis') {
      return;
    }
    const { analysis, removed } = event as unknown as OfficeAnalysisEvent;
    setAnalyses((current) => {
      const others = current.filter((candidate) => candidate.id !== analysis.id);
      return removed ? others : [analysis, ...others].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    });
  }), [load, subscribe]);

  /** Drops analyses whose folder just got its workspace. */
  const forgetProject = useCallback((projectId: string) => {
    setAnalyses((current) => current.filter((analysis) => analysis.status === 'running' || analysis.projectId !== projectId));
  }, []);

  return { analyses, reload: load, forgetProject };
}
