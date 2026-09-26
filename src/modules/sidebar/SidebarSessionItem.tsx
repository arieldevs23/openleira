import { memo } from 'react';
import { Loader2 } from 'lucide-react';
import type { TFunction } from 'i18next';

import { LLMProviderLogo, Tooltip, buttonVariants } from '@/shared/ui';
import { cn } from '@/shared/utils';
import type { LLMProvider, Project, ProjectSession, SessionWithProvider } from '@/shared/types';
import { createSessionViewModel, formatCompactAge } from '@/modules/sidebar/utils/sidebarProjectFormatting';
import { useCompactSidebar } from '@/modules/sidebar/hooks/useCompactSidebar';
import SessionOptions from '@/modules/sidebar/SessionOptions';

type SidebarSessionItemProps = {
  project: Project;
  session: SessionWithProvider;
  selectedSession: ProjectSession | null;
  isProcessing: boolean;
  /** The session's turn has ended but the agents, workflows or commands it launched still run. */
  hasBackgroundWork: boolean;
  needsAttention: boolean;
  currentTime: Date;
  /** Resolved for this row, so a keystroke elsewhere does not invalidate it. */
  isEditing: boolean;
  renameDraft: string;
  onRenameDraftChange: (draft: string) => void;
  onStartEditingSession: (projectId: string, sessionId: string, initialName: string) => void;
  onCancelEditingSession: () => void;
  onSaveEditingSession: (projectName: string, sessionId: string, summary: string, provider: LLMProvider) => void;
  onProjectSelect: (project: Project) => void;
  onSessionSelect: (session: SessionWithProvider, projectName: string) => void;
  onDeleteSession: (sessionId: string, sessionTitle: string) => void;
  /** Branches this session into an independent one; absent when its provider cannot. */
  onForkSession?: (session: SessionWithProvider) => void;
  t: TFunction;
};

/** Rendered by SidebarObrolanList for one chat row, with its actions on a right-click / long-press context menu. */
function SidebarSessionItem({
  project,
  session,
  selectedSession,
  isProcessing,
  hasBackgroundWork,
  needsAttention,
  currentTime,
  isEditing,
  renameDraft,
  onRenameDraftChange,
  onStartEditingSession,
  onCancelEditingSession,
  onSaveEditingSession,
  onProjectSelect,
  onSessionSelect,
  onDeleteSession,
  onForkSession,
  t,
}: SidebarSessionItemProps) {
  const isCompact = useCompactSidebar();
  const sessionView = createSessionViewModel(session, currentTime, t);
  const isSelected = selectedSession?.id === session.id;
  const compactSessionAge = formatCompactAge(sessionView.sessionTime, currentTime);
  const showAttentionIndicator = needsAttention && !isSelected;
  // Background work takes the recent-activity dot's place: the session is
  // still doing something, which says more than that it was touched lately.
  const showBackgroundIndicator = !showAttentionIndicator && hasBackgroundWork;
  const showRecentIndicator = !showAttentionIndicator && !showBackgroundIndicator && !isProcessing && sessionView.isActive;
  const indicatorLabel = showAttentionIndicator
    ? t('tooltips.attentionRequiredIndicator', { defaultValue: 'Session needs attention' })
    : showBackgroundIndicator
      ? t('tooltips.backgroundWorkIndicator', { defaultValue: 'Background work running' })
      : t('tooltips.activeSessionIndicator');
  // Sessions are owned by a project identified by `projectId` (DB primary key)
  // after the projectName → projectId migration.
  const selectMobileSession = () => {
    onProjectSelect(project);
    onSessionSelect(session, project.projectId);
  };

  const statusDot = (showAttentionIndicator || showBackgroundIndicator || showRecentIndicator) && (
    <Tooltip content={indicatorLabel} position="top">
      <span
        role="status"
        aria-label={indicatorLabel}
        className={cn(
          'block h-1.5 w-1.5 flex-shrink-0 rounded-full',
          showAttentionIndicator
            ? 'bg-amber-500'
            : showBackgroundIndicator
              ? 'bg-purple-500 dark:bg-purple-400'
              : 'bg-green-500',
        )}
      />
    </Tooltip>
  );

  const trailing = (
    isProcessing ? (
      <span className="ml-auto flex-shrink-0">
        <Tooltip content={t('tooltips.processingSessionIndicator', 'Processing session')} position="top">
          <span className="flex h-5 w-5 items-center justify-center rounded-md text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
          </span>
        </Tooltip>
      </span>
    ) : compactSessionAge && (
      <span className="ml-auto flex-shrink-0 text-[11px] text-muted-foreground">{compactSessionAge}</span>
    )
  );

  const rowBody = (
    <div className="flex w-full min-w-0 items-center gap-2">
      <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center">
        <LLMProviderLogo provider={session.__provider} className="h-3 w-3" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <div
            className="min-w-0 flex-1 truncate text-sm font-normal text-foreground"
            title={sessionView.sessionName}
          >
            {sessionView.sessionName}
          </div>
          {statusDot}
          {trailing}
        </div>
        <div className="mt-0.5 flex items-center">
          {sessionView.messageCount > 0 && (
            <span className="text-[11px] text-muted-foreground">{sessionView.messageCount}</span>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <SessionOptions
      className={isCompact ? 'mx-3 my-0.5' : undefined}
      sessionId={session.id}
      sessionName={sessionView.sessionName}
      provider={session.__provider}
      projectId={project.projectId}
      isProcessing={isProcessing}
      isEditing={isEditing}
      renameDraft={renameDraft}
      onRenameDraftChange={onRenameDraftChange}
      onStartEditingSession={onStartEditingSession}
      onCancelEditingSession={onCancelEditingSession}
      onSaveEditingSession={onSaveEditingSession}
      onDeleteSession={onDeleteSession}
      onFork={onForkSession ? () => onForkSession(session) : undefined}
      t={t}
    >
      {isCompact ? (
        <div
          className={cn(
            'relative select-none rounded-lg p-2 transition-colors duration-150',
            isSelected ? 'sidebar-item-active' : 'active:bg-muted',
          )}
          onClick={selectMobileSession}
        >
          {rowBody}
        </div>
      ) : (
        <a
          href={`/session/${session.id}`}
          className={cn(
            buttonVariants({ variant: 'ghost' }),
            'h-auto w-full justify-start rounded-lg p-2 text-left font-normal transition-colors duration-150',
            isSelected ? 'sidebar-item-active' : 'hover:bg-muted',
          )}
          // Left-click keeps in-app navigation; Ctrl/Cmd/middle-click use the
          // href to open a new tab. Right-click opens the session menu instead.
          onClick={(event) => {
            if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
            event.preventDefault();
            onSessionSelect(session, project.projectId);
          }}
        >
          {rowBody}
        </a>
      )}
    </SessionOptions>
  );
}

/**
 * Memoized: a websocket session delta re-renders the sidebar roughly every
 * 0.5-2s during a run, and a rename keystroke re-renders it per character.
 *
 * SidebarObrolanList hands every row but the one being renamed a constant
 * draft, and the session objects come from a per-project cache, so the compare
 * succeeds for the rest. See sidebarRowProps.test.tsx.
 */
export default memo(SidebarSessionItem);
