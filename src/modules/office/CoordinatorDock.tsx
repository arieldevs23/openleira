import { ChevronDown, ChevronUp, EyeOff, MessageSquare } from 'lucide-react';
import { forwardRef, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import CoordinatorComposer from '@/modules/office/CoordinatorComposer';
import { coordinatorThread } from '@/modules/office/utils/coordinatorThread';
import { isOpenWork, type WorkTarget } from '@/modules/office/utils/workItems';
import type { OfficeCase, OfficeCaseStatus, OfficeDivision, OfficeMessage } from '@/shared/types';
import { StatusMark } from '@/shared/ui';
import type { StatusMarkKind } from '@/shared/ui';
import { cn } from '@/shared/utils';

/** How much of the dock is on screen. */
export type CoordinatorDockMode = 'hidden' | 'collapsed' | 'expanded';

type CoordinatorDockProps = {
  /** Every work item of the workspace (the snapshot's cases, newest first). */
  cases: OfficeCase[];
  divisions: OfficeDivision[];
  selectedCaseId: string | null;
  /** Messages of the selected work item; its conversation shows under it. */
  selectedMessages: OfficeMessage[];
  mode: CoordinatorDockMode;
  onModeChange: (mode: CoordinatorDockMode) => void;
  target: WorkTarget;
  onTargetChange: (target: WorkTarget) => void;
  onSelectCase: (caseId: string) => void;
  onSubmitWork: (items: string[], divisionId: string | null) => Promise<void>;
  onSendNote: (caseId: string, text: string) => Promise<void>;
};

const STATUS_MARKS: Record<OfficeCaseStatus, StatusMarkKind> = {
  draft: 'idle',
  running: 'running',
  waiting_user: 'warning',
  done: 'done',
  failed: 'error',
};

const MAX_RESULT_PREVIEW = 600;

const messageText = (message: OfficeMessage) => String(message.payload.text ?? '');
const formatTime = (value: string) => new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const clip = (value: string, max: number) => (value.length > max ? `${value.slice(0, max)}…` : value);

/**
 * The workspace chat, docked at the bottom of the canvas (rendered by
 * OfficePage over the canvas). It is a feed of the work handed to the
 * workspace, oldest first: each prompt with its target, status and result,
 * and the conversation of the selected one. New work, lists and notes are
 * written in the box below. Collapsed it is the box with the latest line
 * above it; expanded it darkens the lower part of the canvas and shows the
 * feed; hidden it is one small button. The ref is the message box.
 */
const CoordinatorDock = forwardRef<HTMLTextAreaElement, CoordinatorDockProps>(function CoordinatorDock(
  {
    cases, divisions, selectedCaseId, selectedMessages, mode, onModeChange,
    target, onTargetChange, onSelectCase, onSubmitWork, onSendNote,
  },
  ref,
) {
  const { t } = useTranslation('office');
  const listRef = useRef<HTMLOListElement | null>(null);
  const coordinator = divisions.find((division) => division.isCoordinator) ?? null;
  const teams = divisions.filter((division) => !division.isCoordinator && !division.isAudit && division.agent.enabled);
  const feed = [...cases].reverse();
  const openWork = cases.filter(isOpenWork);
  const noteTargets = cases.filter((caseItem) => (
    !caseItem.quickDivisionId && (caseItem.status === 'running' || caseItem.status === 'waiting_user')
  ));
  const coordinatorName = coordinator?.agent.name ?? t('case.coordinator');
  const thread = coordinatorThread(selectedMessages, coordinator?.id);
  const latest = cases[0] ?? null;

  const targetName = (caseItem: OfficeCase): string => {
    if (!caseItem.quickDivisionId) {
      return coordinatorName;
    }
    const team = divisions.find((division) => division.id === caseItem.quickDivisionId);
    return team?.agent.name || team?.name || '?';
  };

  const statusText = (caseItem: OfficeCase): string => {
    if (caseItem.status === 'draft') {
      return caseItem.followsCaseId ? t('work.queued') : t('status.draft');
    }
    if (caseItem.status === 'waiting_user' && caseItem.waitingReason) {
      return caseItem.waitingReason === 'question' ? t('work.asking') : t(`status.${caseItem.status}`);
    }
    return t(`status.${caseItem.status}`);
  };

  // Follows the newest entry while the feed is open.
  useEffect(() => {
    const list = listRef.current;
    if (list && mode === 'expanded') {
      list.scrollTop = list.scrollHeight;
    }
  }, [mode, cases.length, thread.length]);

  if (mode === 'hidden') {
    return (
      <button
        type="button"
        data-canvas-control
        data-testid="office-dock-show"
        onClick={() => onModeChange('collapsed')}
        className="glass-surface-strong absolute bottom-12 left-1/2 z-30 flex -translate-x-1/2 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs text-foreground shadow-sm hover:bg-card"
      >
        <MessageSquare className="h-3.5 w-3.5" />
        {t('work.show')}
        {openWork.length > 0 && <span className="text-muted-foreground">· {t('work.openCount', { count: openWork.length })}</span>}
      </button>
    );
  }

  const controls = (
    <div className="flex shrink-0 items-center gap-0.5">
      <button
        type="button"
        onClick={() => onModeChange(mode === 'expanded' ? 'collapsed' : 'expanded')}
        className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        aria-label={mode === 'expanded' ? t('dock.collapse') : t('dock.expand')}
        title={mode === 'expanded' ? t('dock.collapse') : t('dock.expand')}
        data-testid="office-dock-toggle"
      >
        {mode === 'expanded' ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
      </button>
      <button
        type="button"
        onClick={() => onModeChange('hidden')}
        className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        aria-label={t('dock.hide')}
        title={t('dock.hide')}
        data-testid="office-dock-hide"
      >
        <EyeOff className="h-4 w-4" />
      </button>
    </div>
  );

  const composer = (
    <CoordinatorComposer
      ref={ref}
      target={target}
      onTargetChange={onTargetChange}
      coordinator={coordinator}
      teams={teams}
      noteTargets={noteTargets}
      onSubmitWork={onSubmitWork}
      onSendNote={onSendNote}
    />
  );

  return (
    <div
      data-canvas-control
      data-testid="office-dock"
      data-mode={mode}
      className={cn(
        'absolute inset-x-0 bottom-0 z-30 flex flex-col',
        mode === 'expanded' ? 'top-[30%] bg-black/70 backdrop-blur-sm' : 'pointer-events-none',
      )}
      onPointerDown={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
    >
      <div className={cn('pointer-events-auto mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col px-4', mode === 'expanded' ? 'pb-12 pt-3' : 'justify-end pb-12')}>
        {mode === 'expanded' ? (
          <>
            <div className="flex items-center gap-2 pb-2 text-white">
              <MessageSquare className="h-4 w-4" />
              <span className="flex-1 text-sm font-medium">
                {t('work.title')}
                {openWork.length > 0 && <span className="ml-1.5 text-xs font-normal text-white/70">· {t('work.openCount', { count: openWork.length })}</span>}
              </span>
              <div className="text-white/80 [&_button:hover]:bg-white/10 [&_button:hover]:text-white [&_button]:text-white/80">{controls}</div>
            </div>
            <ol ref={listRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto pb-3" aria-label={t('work.title')} data-testid="office-dock-thread">
              {feed.length === 0 && <li className="text-xs text-white/70">{t('work.empty')}</li>}
              {feed.map((caseItem) => {
                const isSelected = caseItem.id === selectedCaseId;
                const result = caseItem.status === 'failed' ? caseItem.error : caseItem.finalSummary;
                return (
                  <li key={caseItem.id} className="space-y-1.5" data-testid="office-work-item" data-status={caseItem.status}>
                    <div className="ml-auto w-fit max-w-[85%] rounded-[12px] bg-primary px-3 py-2 text-[13px] text-primary-foreground shadow-sm">
                      <span className="mb-0.5 block text-[10.5px] text-primary-foreground/75">
                        {t('case.you')} → {targetName(caseItem)} · {formatTime(caseItem.createdAt)}
                      </span>
                      <span className="whitespace-pre-wrap break-words">{caseItem.description || caseItem.title}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => onSelectCase(caseItem.id)}
                      className={cn(
                        'mr-auto block max-w-[85%] rounded-[12px] border bg-card px-3 py-2 text-left text-[13px] text-foreground shadow-sm',
                        isSelected ? 'border-primary' : 'border-white/10 hover:border-white/30',
                        caseItem.waitingReason === 'question' && 'border-warn/60',
                      )}
                      aria-pressed={isSelected}
                      data-testid="office-work-open"
                    >
                      <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <StatusMark kind={STATUS_MARKS[caseItem.status]} />
                        <span className="font-medium text-foreground">{statusText(caseItem)}</span>
                        <span className="truncate">· {caseItem.title}</span>
                      </span>
                      {result && (
                        <div className={cn('prose prose-sm mt-1 max-w-none break-words text-[12.5px] dark:prose-invert prose-p:my-1 prose-pre:text-[11px]', caseItem.status === 'failed' && 'text-err')}>
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{clip(result, MAX_RESULT_PREVIEW)}</ReactMarkdown>
                        </div>
                      )}
                      {!isSelected && <span className="mt-1 block text-[10.5px] text-muted-foreground">{t('work.openResult')}</span>}
                    </button>
                    {isSelected && thread.filter((message) => !message.payload.final).map((message) => {
                      const fromUser = message.fromDivisionId === null;
                      return (
                        <div
                          key={message.id}
                          className={cn(
                            'w-fit max-w-[85%] rounded-[12px] px-3 py-2 text-[13px] shadow-sm',
                            fromUser ? 'ml-auto bg-primary text-primary-foreground' : 'mr-auto border border-white/10 bg-card text-foreground',
                            message.kind === 'question' && 'border-warn/60',
                          )}
                        >
                          <span className={cn('mb-0.5 block text-[10.5px]', fromUser ? 'text-primary-foreground/75' : 'text-muted-foreground')}>
                            {fromUser ? t('case.you') : coordinatorName}
                            {message.kind === 'question' ? ` · ${t('kinds.question')}` : ''} · {formatTime(message.createdAt)}
                          </span>
                          {fromUser ? (
                            <span className="whitespace-pre-wrap break-words">{messageText(message)}</span>
                          ) : (
                            <div className="prose prose-sm max-w-none break-words text-[13px] dark:prose-invert prose-p:my-1 prose-pre:text-[11px]">
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>{messageText(message)}</ReactMarkdown>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </li>
                );
              })}
            </ol>
            <div className="glass-surface-strong rounded-[12px] border p-2">{composer}</div>
          </>
        ) : (
          <div className="glass-surface-strong space-y-1.5 rounded-[12px] border p-2 shadow-lg">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onModeChange('expanded')}
                className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-[11.5px] text-muted-foreground hover:text-foreground"
                data-testid="office-dock-latest"
              >
                {latest ? (
                  <>
                    <StatusMark kind={STATUS_MARKS[latest.status]} className="shrink-0" />
                    <span className="truncate">
                      {openWork.length > 0 ? `${t('work.openCount', { count: openWork.length })} · ` : ''}
                      {latest.title} · {statusText(latest)}
                    </span>
                  </>
                ) : (
                  <span className="truncate">{t('work.empty')}</span>
                )}
              </button>
              {controls}
            </div>
            {composer}
          </div>
        )}
      </div>
    </div>
  );
});

export default CoordinatorDock;
