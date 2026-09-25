import { useCallback, useEffect, useRef, useState } from 'react';

import { api, readApiJson } from '@/shared/api';
import { useWebSocket } from '@/shared/context/WebSocketContext';
import type {
  OfficeActions,
  OfficeCase,
  OfficeDivision,
  OfficeSnapshot,
  OfficeUpdateEvent,
  Project,
} from '@/shared/types';

type ApiEnvelope<T> = { success: true; data: T };

type LoadState = 'loading' | 'ready' | 'missing' | 'error';

const sortDivisions = (divisions: OfficeDivision[]) =>
  [...divisions].sort((left, right) => left.sortOrder - right.sortOrder || left.createdAt.localeCompare(right.createdAt));

const sortCases = (cases: OfficeCase[]) =>
  [...cases].sort((left, right) => right.createdAt.localeCompare(left.createdAt));

/** Unwraps `{ success, data }`, throwing the server's message on failure. */
async function readData<T>(response: Response): Promise<T> {
  return (await readApiJson<ApiEnvelope<T>>(response)).data;
}

/**
 * Loads the office of a project and keeps it live from `office:update`
 * frames on the shared websocket — the page never polls. After a reconnect
 * the snapshot is fetched once to catch up on frames missed while offline.
 */
export function useOffice(project: Project) {
  const { subscribe } = useWebSocket();
  // The office, its divisions and cases; null while loading or when the project has none.
  const [snapshot, setSnapshot] = useState<OfficeSnapshot | null>(null);
  // Drives the page between spinner, empty state ("create office"), error and content.
  const [loadState, setLoadState] = useState<LoadState>('loading');
  // Shown with a retry button when the snapshot request itself failed.
  const [loadError, setLoadError] = useState<string | null>(null);
  const officeIdRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const data = await readData<{ office: OfficeSnapshot | null }>(await api.office.forProject(project.projectId));
      officeIdRef.current = data.office?.office.id ?? null;
      setSnapshot(data.office);
      setLoadState(data.office ? 'ready' : 'missing');
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : String(error));
      setLoadState('error');
    }
  }, [project.projectId]);

  useEffect(() => {
    setSnapshot(null);
    setLoadState('loading');
    officeIdRef.current = null;
    void load();
  }, [load]);

  useEffect(() => subscribe((event) => {
    if (event.kind === 'websocket_reconnected') {
      void load();
      return;
    }
    if (event.kind !== 'office:update') {
      return;
    }
    const update = event as unknown as OfficeUpdateEvent;
    const { change } = update;

    // An office created in another tab for this project: pick it up.
    if (!officeIdRef.current) {
      if (change.entity === 'office' && change.office.projectPath === project.fullPath) {
        void load();
      }
      return;
    }
    if (update.officeId !== officeIdRef.current) {
      return;
    }

    setSnapshot((current) => {
      if (!current) {
        return current;
      }
      switch (change.entity) {
        case 'office':
          return { ...current, office: change.office };
        case 'division': {
          const others = current.divisions.filter((division) => division.id !== change.id);
          return { ...current, divisions: sortDivisions(change.division ? [...others, change.division] : others) };
        }
        case 'case': {
          const others = current.cases.filter((caseItem) => caseItem.id !== change.id);
          return { ...current, cases: sortCases(change.case ? [...others, change.case] : others) };
        }
        default:
          return current;
      }
    });
  }), [load, project.fullPath, subscribe]);

  const officeId = snapshot?.office.id ?? null;

  /** Runs a mutation against the loaded office; the frame it triggers patches state. */
  const call = useCallback(async <T,>(run: (id: string) => Promise<Response>): Promise<T> => {
    if (!officeId) {
      throw new Error('No office loaded.');
    }
    return readData<T>(await run(officeId));
  }, [officeId]);

  const actions: OfficeActions = {
    createOffice: async (locale) => {
      const created = await readData<OfficeSnapshot>(await api.office.create(project.projectId, locale));
      officeIdRef.current = created.office.id;
      setSnapshot(created);
      setLoadState('ready');
      return created;
    },
    updateOffice: (changes) => call((id) => api.office.update(id, changes)),
    createDivision: (input) => call((id) => api.office.createDivision(id, input)),
    updateDivision: (divisionId, changes) => call((id) => api.office.updateDivision(id, divisionId, changes)),
    deleteDivision: async (divisionId) => {
      await call((id) => api.office.deleteDivision(id, divisionId));
    },
    updateAgent: (agentId, changes) => call((id) => api.office.updateAgent(id, agentId, changes)),
    assignModels: async (assignments) => {
      await call((id) => api.office.assignModels(id, assignments));
    },
    createCase: (input) => call((id) => api.office.createCase(id, input)),
    deleteCase: async (caseId) => {
      await call((id) => api.office.deleteCase(id, caseId));
    },
    caseAction: (caseId, action) => call((id) => api.office.caseAction(id, caseId, action)),
    postNote: (caseId, text) => call((id) => api.office.postNote(id, caseId, text)),
  };

  return { snapshot, loadState, loadError, reload: load, actions };
}
