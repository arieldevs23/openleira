import { useCallback, useMemo, useState } from 'react';

import { api } from '@/shared/api';
import { HOME_BROWSER_PATH, OBROLAN_WORKSPACE_PATH } from '@/shared/constants';
import { isHomeBrowserProject, isObrolanProject } from '@/shared/utils';
import type { Project } from '@/shared/types';

type BuiltInWorkspaceKind = 'obrolan' | 'home';

const WORKSPACE_DEFINITIONS: Record<BuiltInWorkspaceKind, { path: string; customName: string }> = {
  obrolan: { path: OBROLAN_WORKSPACE_PATH, customName: 'obrolan' },
  home: { path: HOME_BROWSER_PATH, customName: 'home' },
};

type CreateProjectResponse = {
  success?: boolean;
  project?: Project;
  error?: string;
};

/**
 * Resolves the two hidden projects the sidebar builds on — the obrolan chat
 * workspace and the home-directory file browser — registering either one on
 * first use so the user never has to add them as projects by hand.
 */
export function useBuiltInWorkspaces(projects: Project[], onRefresh: () => Promise<void> | void) {
  const obrolanProject = useMemo(() => projects.find((project) => isObrolanProject(project)) ?? null, [projects]);
  const homeProject = useMemo(() => projects.find((project) => isHomeBrowserProject(project)) ?? null, [projects]);
  const [pendingWorkspace, setPendingWorkspace] = useState<BuiltInWorkspaceKind | null>(null);

  const ensureWorkspace = useCallback(async (kind: BuiltInWorkspaceKind): Promise<Project | null> => {
    const existing = kind === 'obrolan' ? obrolanProject : homeProject;
    if (existing) return existing;

    setPendingWorkspace(kind);
    try {
      const response = await api.createProject(WORKSPACE_DEFINITIONS[kind]);
      const body = (await response.json()) as CreateProjectResponse;
      if (!response.ok || !body.project) {
        console.error(`Failed to register the ${kind} workspace:`, body.error ?? response.status);
        return null;
      }
      await onRefresh();
      return body.project;
    } catch (error) {
      console.error(`Failed to register the ${kind} workspace:`, error);
      return null;
    } finally {
      setPendingWorkspace(null);
    }
  }, [homeProject, obrolanProject, onRefresh]);

  return { obrolanProject, homeProject, pendingWorkspace, ensureWorkspace };
}
