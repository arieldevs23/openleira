import { ChevronDown, ChevronUp, EyeOff, MessageSquare } from 'lucide-react';
import { forwardRef, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import CoordinatorComposer from '@/modules/office/CoordinatorComposer';
import { coordinatorThread } from '@/modules/office/utils/coordinatorThread';
import type { OfficeCase, OfficeDivision, OfficeMessage } from '@/shared/types';
import { cn } from '@/shared/utils';

/** How much of the dock is on screen. */
export type CoordinatorDockMode = 'hidden' | 'collapsed' | 'expanded';

type CoordinatorDockProps = {
  caseItem: OfficeCase;
  messages: OfficeMessage[];
  coordinator: OfficeDivision | null;
  mode: CoordinatorDockMode;
  onModeChange: (mode: CoordinatorDockMode) => void;
  onSend: (text: string) => Promise<void>;
};

const messageText = (message: OfficeMessage) => String(message.payload.text ?? '');
const formatTime = (value: string) => new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

/**
 * The chat with the coordinator, docked at the bottom of the workspace canvas
 * (rendered by OfficePage over the canvas). Collapsed it is the message box
 * with the latest line above it; expanded it darkens the lower part of the
 * canvas and shows the whole conversation; hidden it is one small button.
 * The ref is the message box, so "message the coordinator" can focus it.
 */
const CoordinatorDock = forwardRef<HTMLTextAreaElement, CoordinatorDockProps>(function CoordinatorDock(
  { caseItem, messages, coordinator, mode, onModeChange, onSend },
  ref,
) {
  const { t } = useTranslation('office');
  const listRef = useRef<HTMLOListElement | null>(null);
  const thread = coordinatorThread(messages, coordinator?.id);
  const latest = thread.at(-1) ?? null;
  const isOpen = caseItem.status !== 'done' && caseItem.status !== 'failed';
  const coordinatorName = coordinator?.agent.name ?? t('case.coordinator');

  // Follows the newest message while the conversation is open.
  useEffect(() => {
    const list = listRef.current;
    if (list && mode === 'expanded') {
      list.scrollTop = list.scrollHeight;
    }
  }, [mode, thread.length]);

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
        {t('dock.show', { name: coordinatorName })}
        {thread.length > 0 && <span className="text-muted-foreground">· {thread.length}</span>}
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

  const composer = isOpen ? (
    <CoordinatorComposer
      key={caseItem.id}
      ref={ref}
      isAnswering={caseItem.waitingReason === 'question'}
      onSend={onSend}
    />
  ) : (
    <p className="py-1 text-xs text-muted-foreground">{t('dock.finished')}</p>
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
              <span className="flex-1 text-sm font-medium">{t('dock.title', { name: coordinatorName })}</span>
              <div className="text-white/80 [&_button:hover]:bg-white/10 [&_button:hover]:text-white [&_button]:text-white/80">{controls}</div>
            </div>
            <ol ref={listRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto pb-3" aria-label={t('dock.title', { name: coordinatorName })} data-testid="office-dock-thread">
              {thread.length === 0 && <li className="text-xs text-white/70">{t('case.noConversation')}</li>}
              {thread.map((message) => {
                const fromUser = message.fromDivisionId === null;
                return (
                  <li
                    key={message.id}
                    className={cn(
                      'max-w-[85%] rounded-[12px] px-3 py-2 text-[13px] shadow-sm',
                      fromUser ? 'ml-auto bg-primary text-primary-foreground' : 'mr-auto border border-white/10 bg-card text-foreground',
                      message.kind === 'question' && 'border-warn/60',
                    )}
                  >
                    <span className={cn('mb-0.5 block text-[10.5px]', fromUser ? 'text-primary-foreground/75' : 'text-muted-foreground')}>
                      {fromUser ? t('case.you') : coordinatorName}
                      {message.kind === 'question' ? ` · ${t('kinds.question')}` : ''}
                      {message.payload.final ? ` · ${t('case.finalSummary')}` : ''} · {formatTime(message.createdAt)}
                    </span>
                    {fromUser ? (
                      <span className="whitespace-pre-wrap break-words">{messageText(message)}</span>
                    ) : (
                      <div className="prose prose-sm max-w-none break-words text-[13px] dark:prose-invert prose-p:my-1 prose-pre:text-[11px]">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{messageText(message)}</ReactMarkdown>
                      </div>
                    )}
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
                className="min-w-0 flex-1 truncate text-left text-[11.5px] text-muted-foreground hover:text-foreground"
                data-testid="office-dock-latest"
              >
                {latest
                  ? `${latest.fromDivisionId === null ? t('case.you') : coordinatorName}: ${messageText(latest).replace(/\s+/g, ' ')}`
                  : t('dock.empty', { name: coordinatorName })}
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
