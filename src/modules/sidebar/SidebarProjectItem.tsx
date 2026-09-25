import { memo, useEffect, useRef } from 'react';
import { Check, ChevronDown, ChevronRight, Edit3, Star, StarOff, Trash2, X } from 'lucide-react';
import type { TFunction } from 'i18next';

import { Button, ContextMenu, useContextMenu } from '@/shared/ui';
import { cn } from '@/shared/utils';
import type { LLMProvider, MCPServerStatus, Project, ProjectSession, SessionWithProvider } from '@/shared/types';
import { getTaskIndicatorStatus } from '@/modules/sidebar/utils/sidebarProjectFormatting';
import TaskIndicator from '@/modules/sidebar/TaskIndicator';
import SidebarProjectSessions from '@/modules/sidebar/SidebarProjectSessions';
import { useCompactSidebar } from '@/modules/sidebar/hooks/useCompactSidebar';

type SidebarProjectItemProps = {
  project: Project;
  selectedProject: Project | null;
  selectedSession: ProjectSession | null;
  isExpanded: boolean;
  isDeleting: boolean;
  isStarred: boolean;
  /** Resolved for this row: only the project being renamed re-renders on a keystroke. */
  isEditing: boolean;
  renameDraft: string;
  sessions: SessionWithProvider[];
  initialSessionsLoaded: boolean;
  isLoadingMoreSessions: boolean;
  currentTime: Date;
  /** The session being renamed, when it belongs to this project. */
  sessionRenameId: string | null;
  sessionRenameDraft: string;
  tasksEnabled: boolean;
  mcpServerStatus: MCPServerStatus;
  onRenameDraftChange: (name: string) => void;
  onToggleProject: (projectId: string) => void;
  onProjectSelect: (project: Project) => void;
  onToggleStarProject: (projectId: string) => void;
  onStartEditingProject: (project: Project) => void;
  onCancelEditingProject: () => void;
  onSaveProjectName: (projectId: string, nextName: string) => void;
  onDeleteProject: (project: Project) => void;
  onSessionSelect: (session: SessionWithProvider, projectName: string) => void;
  onDeleteSession: (sessionId: string, sessionTitle: string) => void;
  onForkSession?: (session: SessionWithProvider) => void;
  onLoadMoreSessions: (projectId: string) => void;
  activeSessions: ReadonlySet<string>;
  backgroundSessionIds: ReadonlySet<string>;
  attentionSessionIds: ReadonlySet<string>;
  onNewSession: (project: Project) => void;
  onStartEditingSession: (projectId: string, sessionId: string, initialName: string) => void;
  onCancelEditingSession: () => void;
  onSaveEditingSession: (projectName: string, sessionId: string, summary: string, provider: LLMProvider) => void;
  t: TFunction;
};

const getSessionCountDisplay = (project: Project, sessions: SessionWithProvider[]): string => {
  const total = Number(project.sessionMeta?.total ?? sessions.length);
  return String(total);
};

/** Rendered by SidebarProjectList for one project row, with its star, rename and delete actions on a right-click / long-press context menu. */
function SidebarProjectItem({
  project,
  selectedProject,
  selectedSession,
  isExpanded,
  isDeleting,
  isStarred,
  isEditing,
  renameDraft,
  sessions,
  initialSessionsLoaded,
  isLoadingMoreSessions,
  currentTime,
  sessionRenameId,
  sessionRenameDraft,
  tasksEnabled,
  mcpServerStatus,
  onRenameDraftChange,
  onToggleProject,
  onProjectSelect,
  onToggleStarProject,
  onStartEditingProject,
  onCancelEditingProject,
  onSaveProjectName,
  onDeleteProject,
  onSessionSelect,
  onDeleteSession,
  onForkSession,
  onLoadMoreSessions,
  activeSessions,
  backgroundSessionIds,
  attentionSessionIds,
  onNewSession,
  onStartEditingSession,
  onCancelEditingSession,
  onSaveEditingSession,
  t,
}: SidebarProjectItemProps) {
  // Project identity is tracked by the DB-assigned `projectId` everywhere
  // after the projectName → projectId migration.
  const isSelected = selectedProject?.projectId === project.projectId;
  const totalSessionCount = Number(project.sessionMeta?.total ?? sessions.length);
  const sessionCountDisplay = getSessionCountDisplay(project, sessions);
  const sessionCountLabel = `${sessionCountDisplay} session${totalSessionCount === 1 ? '' : 's'}`;
  const taskStatus = getTaskIndicatorStatus(project, mcpServerStatus);
  const mobileRenameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isEditing || !mobileRenameInputRef.current) {
      return;
    }

    let animationFrame = 0;
    const revealInput = () => {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(() => {
        mobileRenameInputRef.current?.scrollIntoView({ block: 'center', inline: 'nearest' });
      });
    };

    revealInput();
    window.visualViewport?.addEventListener('resize', revealInput);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.visualViewport?.removeEventListener('resize', revealInput);
    };
  }, [isEditing]);

  const isCompact = useCompactSidebar();
  const { triggerHandlers, position: menuPosition, close: closeMenu } = useContextMenu({ enabled: !isEditing });

  const toggleProject = () => onToggleProject(project.projectId);
  const toggleStarProject = () => onToggleStarProject(project.projectId);

  const saveProjectName = () => {
    onSaveProjectName(project.projectId, renameDraft);
  };

  const selectAndToggleProject = () => {
    if (selectedProject?.projectId !== project.projectId) {
      onProjectSelect(project);
    }

    toggleProject();
  };

  return (
    <div className={cn('md:space-y-1', isDeleting && 'opacity-50 pointer-events-none')}>
      <div className="sticky top-0 z-10 md:group group [-webkit-touch-callout:none]" {...triggerHandlers}>
        {isCompact && (
        <div className="bg-card">
          <div
            className={cn(
              'sidebar-item mx-3 my-1 select-none rounded-lg p-3 transition-colors duration-150',
              isSelected ? 'sidebar-item-active' : 'active:bg-muted',
            )}
            onClick={toggleProject}
          >
            <div className="flex items-center justify-between">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <div className="min-w-0 flex-1">
                  {isEditing ? (
                    <input
                      ref={mobileRenameInputRef}
                      type="text"
                      value={renameDraft}
                      onChange={(event) => onRenameDraftChange(event.target.value)}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                      placeholder={t('projects.projectNamePlaceholder')}
                      autoFocus
                      autoComplete="off"
                      onClick={(event) => event.stopPropagation()}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          saveProjectName();
                        }

                        if (event.key === 'Escape') {
                          onCancelEditingProject();
                        }
                      }}
                      style={{
                        fontSize: '16px',
                        WebkitAppearance: 'none',
                        borderRadius: '8px',
                      }}
                    />
                  ) : (
                    <>
                      <div className="flex min-w-0 flex-1 items-center justify-between">
                        <h3 className="flex min-w-0 items-center gap-1.5 text-[13px] font-medium text-foreground">
                          <span className="truncate">{project.displayName}</span>
                          {isStarred && (
                            <Star
                              aria-label={t('contextMenu.starred', 'Starred')}
                              className="h-2.5 w-2.5 flex-shrink-0 fill-current text-warn"
                            />
                          )}
                        </h3>
                        {tasksEnabled && (
                          <TaskIndicator
                            status={taskStatus}
                            size="xs"
                            className="ml-2 hidden flex-shrink-0 md:inline-flex"
                          />
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">{sessionCountLabel}</p>
                    </>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1">
                {isEditing ? (
                  <>
                    <button
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors active:bg-muted"
                      onClick={(event) => {
                        event.stopPropagation();
                        saveProjectName();
                      }}
                    >
                      <Check className="h-4 w-4 text-foreground" />
                    </button>
                    <button
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors active:bg-muted"
                      onClick={(event) => {
                        event.stopPropagation();
                        onCancelEditingProject();
                      }}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </>
                ) : (
                  <>
                    <div className="flex h-6 w-6 items-center justify-center">
                      {isExpanded ? (
                        <ChevronDown className="h-3 w-3 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-3 w-3 text-muted-foreground" />
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
        )}

        {!isCompact && (
        <Button
          variant="ghost"
          className={cn(
            'sidebar-item sticky top-0 z-10 flex h-auto w-full justify-between rounded-lg p-2 font-normal',
            isSelected ? 'sidebar-item-active' : 'bg-card hover:bg-accent',
          )}
          onClick={selectAndToggleProject}
        >
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div className="min-w-0 flex-1 text-left">
              {isEditing ? (
                <div className="space-y-1">
                  <input
                    type="text"
                    value={renameDraft}
                    onChange={(event) => onRenameDraftChange(event.target.value)}
                    className="w-full rounded border border-border bg-background px-2 py-1 text-sm text-foreground focus:ring-2 focus:ring-primary/20"
                    placeholder={t('projects.projectNamePlaceholder')}
                    autoFocus
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        saveProjectName();
                      }
                      if (event.key === 'Escape') {
                        onCancelEditingProject();
                      }
                    }}
                  />
                  <div className="truncate text-xs text-muted-foreground" title={project.fullPath}>
                    {project.fullPath}
                  </div>
                </div>
              ) : (
                <div>
                  <div className="flex min-w-0 items-center gap-1.5 text-[13px] font-medium text-foreground" title={project.displayName}>
                    <span className="truncate">{project.displayName}</span>
                    {isStarred && (
                      <Star
                        aria-label={t('contextMenu.starred', 'Starred')}
                        className="h-2.5 w-2.5 flex-shrink-0 fill-current text-warn"
                      />
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {sessionCountDisplay}
                    {project.fullPath !== project.displayName && (
                      <span className="ml-1 opacity-60" title={project.fullPath}>
                        {' - '}
                        {project.fullPath.length > 25 ? `...${project.fullPath.slice(-22)}` : project.fullPath}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-shrink-0 items-center gap-1">
            {isEditing ? (
              <>
                <div
                  className="flex h-6 w-6 cursor-pointer items-center justify-center rounded text-ok transition-colors hover:bg-ok/10 hover:text-ok"
                  onClick={(event) => {
                    event.stopPropagation();
                    saveProjectName();
                  }}
                >
                  <Check className="h-3 w-3" />
                </div>
                <div
                  className="flex h-6 w-6 cursor-pointer items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  onClick={(event) => {
                    event.stopPropagation();
                    onCancelEditingProject();
                  }}
                >
                  <X className="h-3 w-3" />
                </div>
              </>
            ) : (
              <>
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-foreground" />
                )}
              </>
            )}
          </div>
        </Button>
        )}

        {menuPosition && (
          <ContextMenu
            position={menuPosition}
            onClose={closeMenu}
            ariaLabel={t('contextMenu.projectMenuLabel', { name: project.displayName, defaultValue: 'Project options for {{name}}' })}
            header={(
              <div className="mb-1 border-b border-foreground/[0.08] px-2.5 py-1.5">
                <p className="truncate text-xs font-medium text-foreground" title={project.displayName}>{project.displayName}</p>
                <p className="mt-0.5 truncate text-[11px] text-muted-foreground" title={project.fullPath}>{project.fullPath}</p>
              </div>
            )}
            items={[
              {
                key: 'star',
                label: isStarred ? t('tooltips.removeFromFavorites') : t('tooltips.addToFavorites'),
                icon: isStarred ? StarOff : Star,
                onSelect: toggleStarProject,
              },
              {
                key: 'rename',
                label: t('contextMenu.renameProject', 'Rename project'),
                icon: Edit3,
                onSelect: () => onStartEditingProject(project),
              },
              {
                key: 'delete',
                label: t('contextMenu.deleteProject', 'Remove project'),
                icon: Trash2,
                isDanger: true,
                showDividerBefore: true,
                onSelect: () => onDeleteProject(project),
              },
            ]}
          />
        )}
      </div>

      <SidebarProjectSessions
        project={project}
        isExpanded={isExpanded}
        sessions={sessions}
        selectedSession={selectedSession}
        initialSessionsLoaded={initialSessionsLoaded}
        hasMoreSessions={Boolean(project.sessionMeta?.hasMore)}
        isLoadingMoreSessions={isLoadingMoreSessions}
        activeSessions={activeSessions}
        backgroundSessionIds={backgroundSessionIds}
        attentionSessionIds={attentionSessionIds}
        currentTime={currentTime}
        sessionRenameId={sessionRenameId}
        sessionRenameDraft={sessionRenameDraft}
        onRenameDraftChange={onRenameDraftChange}
        onStartEditingSession={onStartEditingSession}
        onCancelEditingSession={onCancelEditingSession}
        onSaveEditingSession={onSaveEditingSession}
        onProjectSelect={onProjectSelect}
        onSessionSelect={onSessionSelect}
        onDeleteSession={onDeleteSession}
        onForkSession={onForkSession}
        onLoadMoreSessions={onLoadMoreSessions}
        onNewSession={onNewSession}
        t={t}
      />
    </div>
  );
}

/**
 * Memoized: a websocket session delta re-renders the sidebar roughly every
 * 0.5-2s during a run, and a rename keystroke re-renders it per character.
 *
 * Both renames are resolved to scalars by SidebarProjectList and the sorted
 * session array is cached per project, so a keystroke changes props on exactly
 * one row and every other row's compare succeeds. See sidebarRowProps.test.tsx.
 */
export default memo(SidebarProjectItem);
