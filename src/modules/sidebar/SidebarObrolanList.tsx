import { Loader2, MessageCirclePlus, MessagesSquare } from 'lucide-react';
import type { TFunction } from 'i18next';

import { Button } from '@/shared/ui';
import type { Project, SidebarProjectListProps } from '@/shared/types';
import { getSessionTitle } from '@/shared/utils';
import SidebarSessionItem from '@/modules/sidebar/SidebarSessionItem';

type SidebarObrolanListProps = {
  /** The hidden obrolan project; null until the first obrolan registers it. */
  project: Project | null;
  isCreating: boolean;
  /** The sidebar search box; narrows the list by session title. */
  searchFilter: string;
  onNewObrolan: () => void;
  projectListProps: SidebarProjectListProps;
  t: TFunction;
};

/**
 * Rendered by SidebarContent for the "obrolan" tab: general chats that live in
 * one fixed working directory, listed as plain sessions with no project row.
 */
export default function SidebarObrolanList({
  project,
  isCreating,
  searchFilter,
  onNewObrolan,
  projectListProps,
  t,
}: SidebarObrolanListProps) {
  const {
    selectedSession,
    activeSessions,
    backgroundSessionIds,
    attentionSessionIds,
    currentTime,
    activeRename,
    initialSessionsLoaded,
    loadingMoreProjects,
    getProjectSessions,
    onLoadMoreSessions,
  } = projectListProps;
  const normalizedFilter = searchFilter.trim().toLowerCase();
  const sessions = (project ? getProjectSessions(project) : [])
    .filter((session) => !normalizedFilter || getSessionTitle(session).toLowerCase().includes(normalizedFilter));
  const renamingSession = activeRename?.target === 'session' && activeRename.projectId === project?.projectId
    ? activeRename
    : null;
  const isLoadingSessions = Boolean(project) && !initialSessionsLoaded.has(project!.projectId);

  return (
    <div className="space-y-0.5 px-2 md:px-0">
      <Button
        variant="ghost"
        size="sm"
        className="sidebar-item mb-1 flex h-9 w-full justify-start gap-2 rounded-lg px-2.5 text-[13px] font-medium text-foreground hover:bg-accent"
        onClick={onNewObrolan}
        disabled={isCreating}
      >
        {isCreating
          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
          : <MessageCirclePlus className="h-3.5 w-3.5 text-primary" />}
        {t('obrolan.new')}
      </Button>

      {isLoadingSessions ? (
        <p className="px-3 py-2 text-xs text-muted-foreground">{t('sessions.loadingSessions')}</p>
      ) : sessions.length === 0 ? (
        <div className="px-4 py-10 text-center">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
            <MessagesSquare className="h-5 w-5 text-muted-foreground" />
          </div>
          <p className="text-sm text-foreground">{t('obrolan.emptyTitle')}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t('obrolan.emptyDescription')}</p>
        </div>
      ) : (
        <>
          {sessions.map((session) => (
            <SidebarSessionItem
              key={session.id}
              project={project!}
              session={session}
              selectedSession={selectedSession}
              isProcessing={activeSessions.has(session.id) && !backgroundSessionIds.has(session.id)}
              hasBackgroundWork={backgroundSessionIds.has(session.id)}
              needsAttention={attentionSessionIds.has(session.id)}
              currentTime={currentTime}
              onRenameDraftChange={projectListProps.onRenameDraftChange}
              isEditing={session.id === renamingSession?.id}
              renameDraft={session.id === renamingSession?.id ? renamingSession.draft : ''}
              onStartEditingSession={projectListProps.onStartEditingSession}
              onCancelEditingSession={projectListProps.onCancelEditingSession}
              onSaveEditingSession={projectListProps.onSaveEditingSession}
              onProjectSelect={projectListProps.onProjectSelect}
              onSessionSelect={projectListProps.onSessionSelect}
              onDeleteSession={projectListProps.onDeleteSession}
              onForkSession={projectListProps.onForkSession}
              t={t}
            />
          ))}

          {project?.sessionMeta?.hasMore && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-full justify-center text-xs text-muted-foreground hover:text-foreground"
              onClick={() => onLoadMoreSessions(project.projectId)}
              disabled={loadingMoreProjects.has(project.projectId)}
            >
              {loadingMoreProjects.has(project.projectId) ? t('sessions.loadingSessions') : t('obrolan.loadMore')}
            </Button>
          )}
        </>
      )}
    </div>
  );
}
