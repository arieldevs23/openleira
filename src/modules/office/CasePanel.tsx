import { AlertTriangle, ExternalLink, Pause, Play, Send, Square, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import OfficeStatusBadge from '@/modules/office/OfficeStatusBadge';
import { Button } from '@/shared/ui';
import type { OfficeActions, OfficeCase, OfficeDivision, OfficeMessage, OfficeTask } from '@/shared/types';
import { cn, officeCaseTone, officeTaskTone } from '@/shared/utils';

type CasePanelProps = {
  caseItem: OfficeCase;
  tasks: OfficeTask[];
  messages: OfficeMessage[];
  divisions: OfficeDivision[];
  missingModelAgents: OfficeDivision[];
  /** Names of providers that enabled agents use but that are not logged in. */
  disconnectedProviders: string[];
  onConnectProviders: () => void;
  actions: OfficeActions;
  /** Starts the case, showing the one-time permission warning first when needed. */
  onStart: () => Promise<void>;
  onOpenWizard: () => void;
  onSelectTask: (task: OfficeTask) => void;
  onOpenSession: (sessionId: string) => void;
};

const formatTime = (value: string | null) => (value ? new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '');

const messageText = (message: OfficeMessage) => String(message.payload.text ?? '');

/** Right panel of the office page for the selected case: controls, timeline, coordinator thread and final summary. */
export default function CasePanel({
  caseItem,
  tasks,
  messages,
  divisions,
  missingModelAgents,
  disconnectedProviders,
  onConnectProviders,
  actions,
  onStart,
  onOpenWizard,
  onSelectTask,
  onOpenSession,
}: CasePanelProps) {
  const { t } = useTranslation('office');
  // Text of the message to the coordinator being typed.
  const [note, setNote] = useState('');
  // The control currently waiting on the in-flight request, to disable the buttons meanwhile.
  const [busyAction, setBusyAction] = useState<string | null>(null);
  // Which destructive action asked "are you sure?" and waits for the second click.
  const [confirming, setConfirming] = useState<'cancel' | 'delete' | null>(null);
  // Error from the last control or note, shown above the controls.
  const [actionError, setActionError] = useState<string | null>(null);

  const divisionsById = new Map(divisions.map((division) => [division.id, division]));
  const coordinator = divisions.find((division) => division.isCoordinator);
  const isActive = caseItem.status === 'running' || caseItem.status === 'waiting_user';
  const canStart = caseItem.status === 'draft' && missingModelAgents.length === 0 && disconnectedProviders.length === 0;

  const run = async (name: string, action: () => Promise<unknown>) => {
    setBusyAction(name);
    setActionError(null);
    try {
      await action();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusyAction(null);
      setConfirming(null);
    }
  };

  const sendNote = async (event: FormEvent) => {
    event.preventDefault();
    if (!note.trim()) {
      return;
    }
    await run('note', async () => {
      await actions.postNote(caseItem.id, note.trim());
      setNote('');
    });
  };

  // The thread between the user and the coordinator: user notes, replies, questions, the final report.
  const thread = messages.filter((message) => (
    (message.kind === 'note' || message.kind === 'question')
    && message.payload.type !== 'task_failed'
    && (message.fromDivisionId === null || (message.fromDivisionId === coordinator?.id && message.toDivisionId === null))
  ));
  const pendingQuestion = caseItem.waitingReason === 'question'
    ? [...thread].reverse().find((message) => message.kind === 'question')
    : undefined;

  return (
    <div className="flex flex-col gap-4">
      <header className="space-y-1.5">
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-base font-semibold leading-snug text-foreground">{caseItem.title}</h2>
          <OfficeStatusBadge tone={officeCaseTone(caseItem.status)} label={t(`status.${caseItem.status}`)} className="mt-1" />
        </div>
        {caseItem.description && (
          <p className="max-h-32 overflow-y-auto whitespace-pre-wrap text-xs text-muted-foreground">{caseItem.description}</p>
        )}
        {caseItem.status === 'running' && caseItem.phase && (
          <p className="text-[11px] text-primary">{t(`case.phase.${caseItem.phase}`)}</p>
        )}
      </header>

      {caseItem.status === 'waiting_user' && caseItem.waitingReason && (
        <div className="rounded-[10px] border border-navy/20 bg-navy/5 p-2.5 text-xs text-foreground">
          <p className="font-medium">{t(`case.waiting.${caseItem.waitingReason}`)}</p>
          {pendingQuestion && <p className="mt-1 whitespace-pre-wrap">{messageText(pendingQuestion)}</p>}
        </div>
      )}

      {caseItem.status === 'failed' && caseItem.error && (
        <div className="flex gap-2 rounded-[10px] border border-err/30 bg-err/5 p-2.5 text-xs text-err">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{caseItem.error}</span>
        </div>
      )}

      {caseItem.status === 'draft' && missingModelAgents.length > 0 && (
        <div className="rounded-[10px] border border-warn/40 bg-warn/5 p-2.5 text-xs text-warn">
          <p>{t('case.modelsMissing', { names: missingModelAgents.map((division) => division.name).join(', ') })}</p>
          <button type="button" onClick={onOpenWizard} className="mt-1 font-medium underline underline-offset-2">
            {t('missingModels.action')}
          </button>
        </div>
      )}

      {['draft', 'waiting_user'].includes(caseItem.status) && disconnectedProviders.length > 0 && (
        <div className="rounded-[10px] border border-warn/40 bg-warn/5 p-2.5 text-xs text-warn">
          <p>{t('case.providersMissing', { providers: disconnectedProviders.join(', ') })}</p>
          <button type="button" onClick={onConnectProviders} className="mt-1 font-medium underline underline-offset-2">
            {t('providers.connectAction')}
          </button>
        </div>
      )}

      {actionError && <p className="text-xs text-err">{actionError}</p>}

      <div className="flex flex-wrap gap-1.5">
        {caseItem.status === 'draft' && (
          <Button size="sm" className="h-8 gap-1.5 px-3 text-xs" disabled={!canStart || busyAction !== null} onClick={() => void run('start', onStart)}>
            <Play className="h-3.5 w-3.5" />
            {busyAction === 'start' ? t('case.starting') : t('case.run')}
          </Button>
        )}
        {caseItem.status === 'running' && (
          <Button size="sm" variant="outline" className="h-8 gap-1.5 px-3 text-xs" disabled={busyAction !== null}
            onClick={() => void run('pause', () => actions.caseAction(caseItem.id, 'pause'))}>
            <Pause className="h-3.5 w-3.5" />
            {t('case.pause')}
          </Button>
        )}
        {caseItem.status === 'waiting_user' && (
          <Button size="sm" className="h-8 gap-1.5 px-3 text-xs" disabled={busyAction !== null}
            onClick={() => void run('resume', () => actions.caseAction(caseItem.id, 'resume'))}>
            <Play className="h-3.5 w-3.5" />
            {t('case.resume')}
          </Button>
        )}
        {isActive && (
          <Button
            size="sm"
            variant={confirming === 'cancel' ? 'destructive' : 'outline'}
            className="h-8 gap-1.5 px-3 text-xs"
            disabled={busyAction !== null}
            onClick={() => (confirming === 'cancel'
              ? void run('cancel', () => actions.caseAction(caseItem.id, 'cancel'))
              : setConfirming('cancel'))}
          >
            <Square className="h-3.5 w-3.5" />
            {confirming === 'cancel' ? t('case.confirmCancel') : t('case.cancel')}
          </Button>
        )}
        {!isActive && (
          <Button
            size="sm"
            variant={confirming === 'delete' ? 'destructive' : 'ghost'}
            className="h-8 gap-1.5 px-3 text-xs"
            disabled={busyAction !== null}
            onClick={() => (confirming === 'delete'
              ? void run('delete', () => actions.deleteCase(caseItem.id))
              : setConfirming('delete'))}
          >
            <Trash2 className="h-3.5 w-3.5" />
            {confirming === 'delete' ? t('case.confirmDelete') : t('case.delete')}
          </Button>
        )}
      </div>

      {caseItem.finalSummary && (
        <section className="space-y-1.5">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('case.finalSummary')}</h3>
          <div className="prose prose-sm max-w-none rounded-[10px] border border-border bg-card/60 p-3 text-[13px] dark:prose-invert prose-headings:mb-1.5 prose-headings:mt-3 prose-h1:text-base prose-h2:text-sm prose-h3:text-[13px] prose-pre:text-[11px]">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{caseItem.finalSummary}</ReactMarkdown>
          </div>
        </section>
      )}

      <section className="space-y-1.5">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('case.timeline')}</h3>
        {tasks.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            {caseItem.status === 'draft' ? t('case.noTasksDraft') : t('case.noTasks')}
          </p>
        ) : (
          <ol className="space-y-1">
            {tasks.map((task) => {
              const division = task.divisionId ? divisionsById.get(task.divisionId) : undefined;
              return (
                <li key={task.id}>
                  <div className="flex items-start gap-2 rounded-[10px] px-2 py-1.5 hover:bg-muted/60">
                    <span aria-hidden className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: division?.color ?? 'var(--muted)' }} />
                    <button type="button" onClick={() => onSelectTask(task)} className="min-w-0 flex-1 text-left">
                      <span className="flex items-center gap-1.5">
                        <span className="font-mono text-[10px] text-muted-foreground">{task.ref}</span>
                        <span className="truncate text-[12.5px] font-medium text-foreground">{task.title}</span>
                      </span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10.5px] text-muted-foreground">
                        <span>{division?.name ?? t('case.deletedDivision')}</span>
                        <OfficeStatusBadge tone={officeTaskTone(task.status)} label={t(`taskStatus.${task.status}`)} />
                        {task.attempts > 0 && <span>{t('case.auditAttempts', { count: task.attempts })}</span>}
                        {task.startedAt && <span>{formatTime(task.startedAt)}{task.finishedAt ? ` – ${formatTime(task.finishedAt)}` : ''}</span>}
                      </span>
                      {task.error && <span className="mt-0.5 block text-[10.5px] text-err">{task.error}</span>}
                    </button>
                    {task.sessionId && (
                      <button
                        type="button"
                        onClick={() => onOpenSession(task.sessionId as string)}
                        className="mt-0.5 shrink-0 text-muted-foreground hover:text-primary"
                        title={t('case.openSession')}
                        aria-label={`${t('case.openSession')}: ${task.title}`}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <section className="space-y-1.5">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('case.conversation')}</h3>
        {thread.length === 0 && <p className="text-xs text-muted-foreground">{t('case.noConversation')}</p>}
        <ul className="space-y-1.5">
          {thread.filter((message) => !message.payload.final).map((message) => {
            const fromUser = message.fromDivisionId === null;
            return (
              <li
                key={message.id}
                className={cn(
                  'rounded-[10px] px-2.5 py-1.5 text-xs',
                  fromUser ? 'ml-6 bg-primary/10 text-foreground' : 'mr-6 border border-border bg-card/70',
                  message.kind === 'question' && 'border-navy/30',
                )}
              >
                <span className="mb-0.5 block text-[10px] text-muted-foreground">
                  {fromUser ? t('case.you') : coordinator?.agent.name ?? t('case.coordinator')}
                  {message.kind === 'question' ? ` · ${t('kinds.question')}` : ''} · {formatTime(message.createdAt)}
                </span>
                <span className="whitespace-pre-wrap break-words">{messageText(message)}</span>
              </li>
            );
          })}
        </ul>
        {caseItem.status !== 'done' && caseItem.status !== 'failed' && (
          <form onSubmit={(event) => void sendNote(event)} className="flex items-end gap-1.5">
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                  void sendNote(event);
                }
              }}
              rows={2}
              placeholder={t('case.notePlaceholder')}
              aria-label={t('case.notePlaceholder')}
              className="min-h-10 flex-1 resize-y rounded-md border border-input bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <Button type="submit" size="icon" className="h-9 w-9" disabled={!note.trim() || busyAction === 'note'} aria-label={t('case.send')}>
              <Send className="h-3.5 w-3.5" />
            </Button>
          </form>
        )}
      </section>
    </div>
  );
}
