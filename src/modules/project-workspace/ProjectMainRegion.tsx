import { memo, useCallback, useEffect, useRef } from 'react';

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
    handleNewSession,
    refreshProjectsSilently,
  } = useProjectMainState();

  // A workspace made a moment ago is not in the project list yet; reloading the
  // list lets the effect below select it once it arrives.
  const pendingCanvasProjectIdRef = useRef<string | null>(null);

  const handleCanvasProjectChange = useCallback((projectId: string) => {
    const project = projects.find((candidate) => candidate.projectId === projectId);
    if (!project) {
      pendingCanvasProjectIdRef.current = projectId;
      void refreshProjectsSilently();
      return;
    }
    pendingCanvasProjectIdRef.current = null;
    if (project.projectId !== selectedProject?.projectId) {
      handleProjectSelect(project);
    }
  }, [handleProjectSelect, projects, refreshProjectsSilently, selectedProject?.projectId]);

  useEffect(() => {
    const pendingId = pendingCanvasProjectIdRef.current;
    const project = pendingId ? projects.find((candidate) => candidate.projectId === pendingId) : undefined;
    if (project) {
      pendingCanvasProjectIdRef.current = null;
      handleProjectSelect(project);
    }
  }, [handleProjectSelect, projects]);

  // A project's new chat goes back to its workspace page, where the solo view shows it.
  const handleNewSoloChat = useCallback(() => {
    if (selectedProject) {
      handleNewSession(selectedProject);
    }
  }, [handleNewSession, selectedProject]);

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
      onNewSoloChat={handleNewSoloChat}
    />
  );
}

export default memo(ProjectMainRegion);
