import React, { useCallback, useEffect, useRef, type Dispatch, type SetStateAction, useState } from 'react';

import { ChatInterface } from '@/modules/chat';
import { FileTree } from '@/modules/file-tree';
import { StandaloneShell } from '@/modules/standalone-shell';
import { PluginTabContent } from '@/modules/plugins';
import { BrowserUsePanel, useBrowserUseEnabled } from '@/modules/browser-use';
import { usePaletteOpsRegister } from '@/modules/command-palette';
import { TaskMasterPanel, useTaskMasterProjectSync, useTasksSettings } from '@/modules/task-master';
import { OfficePage } from '@/modules/office';
import type { AppTab, DirectoryRevealRequest, Project, ProjectSession, SessionEstablishedContext, SessionNavigationOptions, SettingsMainTab } from '@/shared/types';
import { useUiPreferences } from '@/shared/context/UiPreferencesContext';
import { useFileOpenResolver } from '@/modules/project-workspace/hooks/useFileOpenResolver';
import { EditorSidebar, useEditorSidebar } from '@/modules/code-editor';
import WorkspaceHeader from '@/modules/project-workspace/WorkspaceHeader';
import WorkspaceTabs from '@/modules/project-workspace/WorkspaceTabs';
import WorkspaceStateView from '@/modules/project-workspace/WorkspaceStateView';
import WorkspaceWelcome from '@/modules/project-workspace/WorkspaceWelcome';
import WorkspaceErrorBoundary from '@/modules/project-workspace/WorkspaceErrorBoundary';

type WorkspaceMainProps = {
  selectedProject: Project | null;
  selectedSession: ProjectSession | null;
  activeTab: AppTab;
  setActiveTab: Dispatch<SetStateAction<AppTab>>;
  ws: WebSocket | null;
  sendMessage: (message: unknown) => void;
  isMobile: boolean;
  onMenuClick: () => void;
  isLoading: boolean;
  onNavigateToSession: (targetSessionId: string, options?: SessionNavigationOptions) => void;
  onSessionEstablished: (sessionId: string, context: SessionEstablishedContext) => void;
  onShowSettings: (tab?: SettingsMainTab) => void;
  externalMessageUpdate: number;
  newSessionTrigger: number;
};

/**
 * Rendered by ProjectMainRegion. Normal mode shows the selected project's
 * active tab (chat, files, shell, tasks, browser or a plugin) with the view
 * rail beside it; workspace mode shows the office module's workspace page,
 * which does not need a selected project.
 */
function WorkspaceMain({
  selectedProject,
  selectedSession,
  activeTab,
  setActiveTab,
  ws,
  sendMessage,
  isMobile,
  onMenuClick,
  isLoading,
  onNavigateToSession,
  onSessionEstablished,
  onShowSettings,
  externalMessageUpdate,
  newSessionTrigger,
}: WorkspaceMainProps) {
  const preferences = useUiPreferences();
  const { showRawParameters, showThinking, sendByCtrlEnter } = preferences;

  const { tasksEnabled, isTaskMasterInstalled } = useTasksSettings();
  const browserUseEnabled = useBrowserUseEnabled();

  useTaskMasterProjectSync(selectedProject);
  // The folder an in-chat `path/` reference asked to reveal. Held as an object
  // so that re-clicking the same folder is a new request the tree acts on.
  const [revealDirectory, setRevealDirectory] = useState<DirectoryRevealRequest | null>(null);

  const shouldShowTasksTab = Boolean(tasksEnabled && isTaskMasterInstalled);
  const shouldShowBrowserTab = browserUseEnabled;

  const {
    editingFile,
    editorWidth,
    editorExpanded,
    hasManualWidth,
    resizeHandleRef,
    handleFileOpen,
    handleCloseEditor,
    handleToggleEditorExpand,
    handleResizeStart,
  } = useEditorSidebar({
    selectedProject,
    isMobile,
  });

  // Resolves bare/partial file references (e.g. links inside chat messages) to
  // real project files before opening them in the in-app editor.
  const resolvedFileOpen = useFileOpenResolver(selectedProject, handleFileOpen);

  useEffect(() => {
    if (!shouldShowTasksTab && activeTab === 'tasks') {
      setActiveTab('chat');
    }
  }, [shouldShowTasksTab, activeTab, setActiveTab]);

  useEffect(() => {
    if (!shouldShowBrowserTab && activeTab === 'browser') {
      setActiveTab('chat');
    }
  }, [shouldShowBrowserTab, activeTab, setActiveTab]);

  // Stable so React.memo(ChatInterface) can bail out: an inline arrow here made
  // every WorkspaceMain render re-render the whole chat tree, including during
  // an editor-divider drag.
  const showAllTasks = useCallback(() => {
    setActiveTab('tasks');
  }, [setActiveTab]);

  const openFile = useCallback((filePath: string) => {
    setActiveTab('files');
    handleFileOpen(filePath);
  }, [handleFileOpen, setActiveTab]);

  // Opens the editor side panel in place, keeping the current tab (e.g. chat).
  const openFileInEditor = useCallback((filePath: string, line?: number | null) => {
    resolvedFileOpen(filePath, undefined, line);
  }, [resolvedFileOpen]);

  // Directories cannot be read as text: reveal them in the file tree instead.
  const openDirectory = useCallback((directoryPath: string) => {
    setActiveTab('files');
    setRevealDirectory({ path: directoryPath });
  }, [setActiveTab]);

  // Workspace sessions are ordinary app sessions, so "open" is the regular chat view.
  const openOfficeSession = useCallback((targetSessionId: string) => {
    setActiveTab('chat');
    onNavigateToSession(targetSessionId);
  }, [onNavigateToSession, setActiveTab]);

  // The normal-mode tab to come back to when leaving workspace mode.
  const lastNormalTabRef = useRef<AppTab>(activeTab === 'office' ? 'chat' : activeTab);
  useEffect(() => {
    if (activeTab !== 'office') {
      lastNormalTabRef.current = activeTab;
    }
  }, [activeTab]);

  const handleModeChange = useCallback((workspaceMode: boolean) => {
    setActiveTab(workspaceMode ? 'office' : lastNormalTabRef.current);
  }, [setActiveTab]);

  // Stable arguments keep usePaletteOpsRegister's effect from tearing down and
  // rewriting the whole palette registry on every render.
  usePaletteOpsRegister({ openFile, openFileInEditor, openDirectory });

  if (isLoading) {
    return <WorkspaceStateView mode="loading" isMobile={isMobile} onMenuClick={onMenuClick} />;
  }

  if (activeTab === 'office') {
    return (
      <div className="flex h-full flex-col">
        <WorkspaceHeader
          activeTab={activeTab}
          selectedProject={selectedProject}
          selectedSession={selectedSession}
          shouldShowTasksTab={shouldShowTasksTab}
          isMobile={isMobile}
          onMenuClick={onMenuClick}
          onModeChange={handleModeChange}
        />
        <div className="min-h-0 flex-1 overflow-hidden">
          <WorkspaceErrorBoundary showDetails>
            <OfficePage initialProjectId={selectedProject?.projectId ?? null} onOpenSession={openOfficeSession} />
          </WorkspaceErrorBoundary>
        </div>
      </div>
    );
  }

  if (!selectedProject) {
    return (
      <WorkspaceWelcome
        isMobile={isMobile}
        onMenuClick={onMenuClick}
        onShowSettings={onShowSettings}
        onOpenWorkspaceMode={() => handleModeChange(true)}
      />
    );
  }

  const viewTabs = (
    <WorkspaceTabs
      activeTab={activeTab}
      setActiveTab={setActiveTab}
      shouldShowTasksTab={shouldShowTasksTab}
      shouldShowBrowserTab={shouldShowBrowserTab}
      orientation={isMobile ? 'horizontal' : 'vertical'}
    />
  );

  return (
    <div className="flex h-full flex-col">
      <WorkspaceHeader
        activeTab={activeTab}
        selectedProject={selectedProject}
        selectedSession={selectedSession}
        shouldShowTasksTab={shouldShowTasksTab}
        isMobile={isMobile}
        onMenuClick={onMenuClick}
        onModeChange={handleModeChange}
      />
      {isMobile && (
        <div className="scrollbar-hide flex-shrink-0 overflow-x-auto border-b border-border/40 px-3 py-1.5">{viewTabs}</div>
      )}

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {!isMobile && (
          <div className="flex flex-shrink-0 flex-col items-center border-r border-border/40 px-1.5 py-2">{viewTabs}</div>
        )}
        <div className={`flex min-h-0 min-w-[200px] flex-col overflow-hidden ${editorExpanded ? 'hidden' : ''} flex-1`}>
          <div className={`h-full ${activeTab === 'chat' ? 'block' : 'hidden'}`}>
            <WorkspaceErrorBoundary showDetails>
              <ChatInterface
                isActive={activeTab === 'chat'}
                selectedProject={selectedProject}
                selectedSession={selectedSession}
                ws={ws}
                sendMessage={sendMessage}
                onFileOpen={handleFileOpen}
                onNavigateToSession={onNavigateToSession}
                onSessionEstablished={onSessionEstablished}
                onShowSettings={onShowSettings}
                showRawParameters={showRawParameters}
                showThinking={showThinking}
                sendByCtrlEnter={sendByCtrlEnter}
                externalMessageUpdate={externalMessageUpdate}
                newSessionTrigger={newSessionTrigger}
                onShowAllTasks={tasksEnabled ? showAllTasks : null}
              />
            </WorkspaceErrorBoundary>
          </div>

          {activeTab === 'files' && (
            <div className="h-full overflow-hidden">
              <FileTree
                selectedProject={selectedProject}
                onFileOpen={handleFileOpen}
                revealDirectory={revealDirectory}
              />
            </div>
          )}

          {activeTab === 'shell' && (
            <div className="h-full w-full overflow-hidden">
              <StandaloneShell
                project={selectedProject}
                session={selectedSession}
                showHeader={false}
                isActive={activeTab === 'shell'}
              />
            </div>
          )}

          {shouldShowTasksTab && <TaskMasterPanel isVisible={activeTab === 'tasks'} />}

          {shouldShowBrowserTab && activeTab === 'browser' && (
            <div className="h-full overflow-hidden">
              <BrowserUsePanel isVisible={activeTab === 'browser'} onShowSettings={onShowSettings} />
            </div>
          )}

          {activeTab.startsWith('plugin:') && (
            <div className="h-full overflow-hidden">
              <PluginTabContent
                pluginName={activeTab.replace('plugin:', '')}
                selectedProject={selectedProject}
                selectedSession={selectedSession}
              />
            </div>
          )}
        </div>

        <EditorSidebar
          editingFile={editingFile}
          isMobile={isMobile}
          editorExpanded={editorExpanded}
          editorWidth={editorWidth}
          hasManualWidth={hasManualWidth}
          resizeHandleRef={resizeHandleRef}
          onResizeStart={handleResizeStart}
          onCloseEditor={handleCloseEditor}
          onToggleEditorExpand={handleToggleEditorExpand}
          projectPath={selectedProject.path}
          fillSpace={activeTab === 'files'}
        />
      </div>
    </div>
  );
}

export default React.memo(WorkspaceMain);
