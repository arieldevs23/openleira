import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { Check, Edit2, ExternalLink, GitBranch, Trash2, X } from 'lucide-react';
import type { TFunction } from 'i18next';

import { ContextMenu, useContextMenu } from '@/shared/ui';
import { cn } from '@/shared/utils';
import type { LLMProvider } from '@/shared/types';
import { useSessionForkingProviders } from '@/shared/hooks/useProviderCapabilities';
import { useProviderSessionIdCopy } from '@/modules/sidebar/hooks/useProviderSessionIdCopy';
import { PROVIDER_LABELS } from '@/modules/sidebar/utils/sidebarProjectFormatting';

type SessionOptionsProps = {
  sessionId: string;
  sessionName: string;
  provider: LLMProvider;
  /**
   * The project that owns the session. Null where the row does not know it, in
   * which case rename is withheld rather than guessed — it is keyed by project.
   */
  projectId: string | null;
  /** A running session cannot be deleted or forked, matching the Projects row. */
  isProcessing: boolean;
  isEditing: boolean;
  renameDraft: string;
  onRenameDraftChange: (draft: string) => void;
  onStartEditingSession: (projectId: string, sessionId: string, initialName: string) => void;
  onCancelEditingSession: () => void;
  onSaveEditingSession: (projectId: string, sessionId: string, summary: string, provider: LLMProvider) => void;
  onDeleteSession: (sessionId: string, sessionTitle: string) => void;
  /** Bound by the caller, which owns the session object the fork needs. */
  onFork?: () => void;
  /** Withheld where the row has nowhere to send a delete. */
  canDelete?: boolean;
  className?: string;
  /** The row itself; right-click or a long-press anywhere on it opens the menu. */
  children: ReactNode;
  t: TFunction;
};

/**
 * A session row's actions: a context menu on right-click (desktop) or long-press
 * (touch), and the inline rename that overlays the row while a rename is open.
 * The row itself carries no action buttons.
 *
 * Shared by the Projects list and the Conversations list so the two rows cannot
 * drift. Callers keep only what is genuinely theirs: the row markup, and whether
 * deleting is offered.
 */
export default function SessionOptions({
  sessionId,
  sessionName,
  provider,
  projectId,
  isProcessing,
  isEditing,
  renameDraft,
  onRenameDraftChange,
  onStartEditingSession,
  onCancelEditingSession,
  onSaveEditingSession,
  onDeleteSession,
  onFork,
  canDelete = true,
  className,
  children,
  t,
}: SessionOptionsProps) {
  const renamePanelRef = useRef<HTMLDivElement>(null);
  const providerLabel = PROVIDER_LABELS[provider];
  const { copyState, copyLabel, setOptionsOpen, handleCopyAction, isCopyPending, CopyStateIcon } =
    useProviderSessionIdCopy(sessionId, providerLabel);
  // The provider id is fetched when the menu opens and dropped when it closes.
  const { triggerHandlers, position, close } = useContextMenu({ enabled: !isEditing, onOpenChange: setOptionsOpen });

  // Read from the backend capability matrix rather than branching on the
  // provider id here; the request is cached module-side, so every row shares one.
  const forkableProviders = useSessionForkingProviders();
  const canFork = Boolean(onFork) && forkableProviders.has(provider) && !isProcessing;

  // While editing, dismiss only when the click lands outside the rename panel,
  // matching Escape and the cancel button.
  useEffect(() => {
    if (!isEditing) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      const panel = renamePanelRef.current;
      if (panel && !panel.contains(event.target as Node)) {
        onCancelEditingSession();
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [isEditing, onCancelEditingSession]);

  const saveRename = () => {
    if (projectId === null) {
      onCancelEditingSession();
      return;
    }
    onSaveEditingSession(projectId, sessionId, renameDraft, provider);
  };

  const items = [
    ...(projectId !== null ? [{
      key: 'rename',
      label: t('contextMenu.renameSession', 'Rename session'),
      icon: Edit2,
      onSelect: () => onStartEditingSession(projectId, sessionId, sessionName),
    }] : []),
    {
      key: 'open-tab',
      label: t('contextMenu.openInNewTab', 'Open in new tab'),
      icon: ExternalLink,
      onSelect: () => window.open(`/session/${sessionId}`, '_blank', 'noopener'),
    },
    {
      key: 'copy',
      label: copyLabel,
      description: copyState === 'error' ? t('contextMenu.tryAgain', 'Click to try again.') : undefined,
      icon: CopyStateIcon,
      loading: isCopyPending,
      closeOnSelect: false,
      onSelect: handleCopyAction,
    },
    ...(canFork && onFork ? [{
      key: 'fork',
      label: t('contextMenu.forkSession', 'Fork session'),
      description: t('contextMenu.forkDescription', 'Continue from a copy, leaving this one untouched.'),
      icon: GitBranch,
      onSelect: onFork,
    }] : []),
    ...(canDelete && !isProcessing ? [{
      key: 'delete',
      label: t('contextMenu.deleteSession', 'Archive or delete session'),
      icon: Trash2,
      isDanger: true,
      showDividerBefore: true,
      onSelect: () => onDeleteSession(sessionId, sessionName),
    }] : []),
  ];

  return (
    <div
      className={cn('relative [-webkit-touch-callout:none]', className)}
      {...triggerHandlers}
    >
      {children}

      {isEditing && (
        <div
          ref={renamePanelRef}
          className="glass-surface absolute inset-0 z-10 flex items-center gap-1 rounded-lg px-2"
          onClick={(event) => event.stopPropagation()}
        >
          <input
            type="text"
            value={renameDraft}
            aria-label={t('contextMenu.sessionName', 'Session name')}
            onChange={(event) => onRenameDraftChange(event.target.value)}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === 'Enter') {
                saveRename();
              } else if (event.key === 'Escape') {
                onCancelEditingSession();
              }
            }}
            // 16px on touch keeps iOS Safari from zooming the viewport on focus.
            className="min-w-0 flex-1 rounded border border-border bg-background px-2 py-1 text-base text-foreground focus:outline-none focus:ring-1 focus:ring-primary md:text-xs"
            autoFocus
            autoComplete="off"
          />
          <button
            type="button"
            className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded text-ok hover:bg-ok/10"
            onClick={saveRename}
            aria-label={t('tooltips.save')}
          >
            <Check className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted"
            onClick={onCancelEditingSession}
            aria-label={t('tooltips.cancel')}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {position && (
        <ContextMenu
          position={position}
          onClose={close}
          ariaLabel={t('contextMenu.sessionMenuLabel', { name: sessionName, defaultValue: 'Session options for {{name}}' })}
          header={(
            <div className="mb-1 border-b border-foreground/[0.08] px-2.5 py-1.5">
              <p className="truncate text-xs font-medium text-foreground" title={sessionName}>{sessionName}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {t('contextMenu.providerSession', { provider: providerLabel, defaultValue: '{{provider}} session' })}
              </p>
            </div>
          )}
          items={items}
        />
      )}
    </div>
  );
}
