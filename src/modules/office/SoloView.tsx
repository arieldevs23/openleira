import { History, Loader2, MessageSquarePlus } from 'lucide-react';
import { useCallback, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { useSoloSessions } from '@/modules/office/hooks/useSoloSessions';
import { Button } from '@/shared/ui';
import { cn } from '@/shared/utils';
import type { OfficeSoloSession } from '@/shared/types';

type SoloViewProps = {
  projectId: string;
  /** The app's open session when it belongs to this project; null for a fresh chat. */
  activeSessionId: string | null;
  isNarrow: boolean;
  /** The regular agent chat; it calls `onSessionEstablished` once a new chat has its session. */
  renderChat: (onSessionEstablished: (sessionId: string) => void) => ReactNode;
  /** Opens one of the project's earlier solo chats in place. */
  onOpenSession: (sessionId: string) => void;
  /** Starts a fresh chat in the project. */
  onNewChat: () => void;
};

/** SQLite writes "YYYY-MM-DD HH:MM:SS" in UTC without a zone; Date would read it as local time. */
const parseTimestamp = (value: string): Date => new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(value) ? value : `${value.replace(' ', 'T')}Z`);

/**
 * The workspace page's solo view: one plain agent chat in the workspace
 * folder, with the project's earlier solo chats beside it. On the first visit
 * to a project with no chat open, the latest solo chat is reopened instead of
 * starting empty. Rendered only by OfficePage, keyed by project.
 */
export default function SoloView({ projectId, activeSessionId, isNarrow, renderChat, onOpenSession, onNewChat }: SoloViewProps) {
  const { t, i18n } = useTranslation('office');
  const { sessions, error, reload } = useSoloSessions(projectId);
  // Whether this visit already reopened the latest chat (or the user chose a fresh one), so it happens once.
  const resumedRef = useRef(false);

  useEffect(() => {
    if (resumedRef.current || sessions === null) {
      return;
    }
    resumedRef.current = true;
    if (!activeSessionId && sessions.length > 0) {
      onOpenSession(sessions[0].sessionId);
    }
  }, [activeSessionId, onOpenSession, sessions]);

  const startNewChat = () => {
    resumedRef.current = true;
    onNewChat();
  };

  // A new chat was just created (and recorded) by the server: show it in the history.
  const handleSessionEstablished = useCallback(() => {
    void reload();
  }, [reload]);

  const formatTime = (session: OfficeSoloSession) => {
    const date = parseTimestamp(session.lastActivity);
    return Number.isNaN(date.getTime())
      ? ''
      : date.toLocaleString(i18n.language || undefined, { dateStyle: 'short', timeStyle: 'short' });
  };
  const titleOf = (session: OfficeSoloSession) => session.title.trim() || t('solo.untitled');

  const history = (
    <div className="min-h-0 flex-1 overflow-y-auto p-1.5" data-testid="office-solo-history">
      {error && <p className="px-2 py-1 text-[11px] text-err">{error}</p>}
      {sessions === null ? (
        <div className="flex items-center gap-2 px-2 py-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />{t('loading')}</div>
      ) : sessions.length === 0 ? (
        <p className="px-2 py-2 text-xs text-muted-foreground">{t('solo.empty')}</p>
      ) : (
        sessions.map((session) => (
          <button
            key={session.sessionId}
            type="button"
            onClick={() => onOpenSession(session.sessionId)}
            aria-current={session.sessionId === activeSessionId ? 'true' : undefined}
            className={cn(
              'flex w-full flex-col rounded-[8px] px-2 py-1.5 text-left transition-colors',
              session.sessionId === activeSessionId ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
            )}
          >
            <span className="w-full truncate text-xs">{titleOf(session)}</span>
            <span className="text-[10.5px] text-muted-foreground">{session.provider} · {formatTime(session)}</span>
          </button>
        ))
      )}
    </div>
  );

  return (
    <div className="flex h-full min-h-0" data-testid="office-solo">
      {!isNarrow && (
        <aside className="flex w-60 shrink-0 flex-col border-r border-border/60" aria-label={t('solo.history')}>
          <div className="flex items-center gap-1.5 px-3 pb-1 pt-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <History className="h-3.5 w-3.5" />
            {t('solo.history')}
          </div>
          {history}
        </aside>
      )}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2 border-b border-border/60 px-3 py-1.5">
          {isNarrow && sessions && sessions.length > 0 ? (
            <select
              aria-label={t('solo.history')}
              className="min-w-0 flex-1 truncate rounded-[8px] border border-border bg-background px-2 py-1 text-xs"
              value={activeSessionId ?? ''}
              onChange={(event) => (event.target.value ? onOpenSession(event.target.value) : startNewChat())}
            >
              <option value="">{t('solo.newChat')}</option>
              {sessions.map((session) => (
                <option key={session.sessionId} value={session.sessionId}>{titleOf(session)} · {formatTime(session)}</option>
              ))}
            </select>
          ) : (
            <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{t('solo.hint')}</p>
          )}
          <Button size="sm" variant="ghost" className="h-7 gap-1.5 text-xs" onClick={startNewChat} data-testid="office-solo-new">
            <MessageSquarePlus className="h-3.5 w-3.5" />
            {t('solo.newChat')}
          </Button>
        </div>
        <div className="min-h-0 flex-1">
          {renderChat(handleSessionEstablished) ?? (
            <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t('loading')}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
