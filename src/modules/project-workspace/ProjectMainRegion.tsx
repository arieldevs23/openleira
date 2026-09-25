import { memo, useCallback } from 'react';

import { useProjectMainState } from '@/modules/project-workspace/context/ProjectsStateContext';
import type { SessionEstablishedContext, SessionNavigationOptions,ProjectWorkspaceShellProps } from '@/shared/types';
import WorkspaceMain from '@/modules/project-workspace/WorkspaceMain';

/** Rendered by ProjectWorkspaceShell to bind this module's project state to WorkspaceMain. */
function ProjectMainRegion({
  isMobile,
  ws,
  sendMessage,
  navigate,
}: ProjectWorkspaceShellProps) {
  const {
    selectedProject,
    selectedSession,
    activeTab,
    setActiveTab,
    setSidebarOpen,
    isLoadingProjects,
    openSettings,
    externalMessageUpdate,
    newSessionTrigger,
    registerOptimisticSession,
    projects,
    handleProjectSelect,
  } = useProjectMainState();

  const handleCanvasProjectChange = useCallback((projectId: string) => {
    const project = projects.find((candidate) => candidate.projectId === projectId);
    if (project && project.projectId !== selectedProject?.projectId) {
      handleProjectSelect(project);
    }
  }, [handleProjectSelect, projects, selectedProject?.projectId]);

  const handleOpenSidebar = useCallback(() => {
    setSidebarOpen(true);
  }, [setSidebarOpen]);

  const handleNavigateToSession = useCallback((
    targetSessionId: string,
    options?: SessionNavigationOptions,
  ) => {
    navigate(`/session/${targetSessionId}`, { replace: Boolean(options?.replace) });
  }, [navigate]);

  const handleSessionEstablished = useCallback((
    targetSessionId: string,
    context: SessionEstablishedContext,
  ) => {
    registerOptimisticSession({ sessionId: targetSessionId, ...context });
  }, [registerOptimisticSession]);

  return (
    <WorkspaceMain
      selectedProject={selectedProject}
      selectedSession={selectedSession}
      activeTab={activeTab}
      setActiveTab={setActiveTab}
      ws={ws}
      sendMessage={sendMessage}
      isMobile={isMobile}
      onMenuClick={handleOpenSidebar}
      isLoading={isLoadingProjects}
      onNavigateToSession={handleNavigateToSession}
      onSessionEstablished={handleSessionEstablished}
      onShowSettings={openSettings}
      externalMessageUpdate={externalMessageUpdate}
      newSessionTrigger={newSessionTrigger}
      onCanvasProjectChange={handleCanvasProjectChange}
    />
  );
}

export default memo(ProjectMainRegion);
