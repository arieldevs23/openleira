import { CheckCircle2, Circle, Download, Eye, EyeOff, FileText, Loader2, RefreshCw, Send, Upload, Users } from 'lucide-react';
import { useRef, useState, type DragEvent } from 'react';
import { useTranslation } from 'react-i18next';

import MarkdownPreview from '@/modules/office/MarkdownPreview';
import ResultFilePreview from '@/modules/office/ResultFilePreview';
import { useMaterialUpload } from '@/modules/office/hooks/useMaterialUpload';
import { OFFICE_PROVIDERS, OFFICE_PROVIDER_LABELS } from '@/modules/office/hooks/useOfficeProviders';
import { downloadResultFile } from '@/modules/office/utils/resultDownloads';
import { parseWorkItems, MAX_WORK_ITEMS } from '@/modules/office/utils/workItems';
import { Button } from '@/shared/ui';
import type {
  LLMProvider,
  Office,
  OfficeCase,
  OfficeDivision,
  OfficeMessage,
  OfficeTask,
  ProviderAuthStatusMap,
} from '@/shared/types';
import { cn } from '@/shared/utils';

/** What the setup card needs to get a first-time user from "nothing connected" to "ready". */
type SimpleSetup = {
  connected: LLMProvider[];
  statuses: ProviderAuthStatusMap;
  isChecking: boolean;
  /** Enabled agents that still have no model; the page picks one for them automatically. */
  missingModels: number;
  isAutoSetting: boolean;
  error: string | null;
  onConnect: (provider: LLMProvider) => void;
  onRefresh: () => void;
  onAutoSetup: () => void;
};

type SimpleViewProps = {
  office: Office;
  projectId: string;
  divisions: OfficeDivision[];
  /** Every piece of work of the workspace, newest first. */
  cases: OfficeCase[];
  selectedCaseId: string | null;
  /** Tasks and messages of the selected work. */
  tasks: OfficeTask[];
  messages: OfficeMessage[];
  setup: SimpleSetup;
  onSubmitWork: (items: string[]) => Promise<void>;
  onAnswer: (caseId: string, text: string) => Promise<void>;
  onSelectCase: (caseId: string) => void;
  /** Leaves the simple view for the full canvas. */
  onShowTeam: () => void;
};

const MAX_LISTED_WORK = 5;

const stepDot = (done: boolean) => (done
  ? <CheckCircle2 className="h-4 w-4 shrink-0 text-ok" />
  : <Circle className="h-4 w-4 shrink-0 text-muted-foreground" />);

const cardClass = 'rounded-[14px] border border-border bg-card/60 p-4';

/**
 * The simple way to use a workspace, for people who do not want a canvas:
 * connect an AI once, put material in, say what to do, and take the result.
 * Shown by the office page by default; the full canvas is one click away.
 */
export default function SimpleView({
  office,
  projectId,
  divisions,
  cases,
  selectedCaseId,
  tasks,
  messages,
  setup,
  onSubmitWork,
  onAnswer,
  onSelectCase,
  onShowTeam,
}: SimpleViewProps) {
  const { t } = useTranslation('office');
  const materials = useMaterialUpload(projectId);
  // The job being written.
  const [draft, setDraft] = useState('');
  // The job is being handed to the team, or why that failed.
  const [submit, setSubmit] = useState<{ busy: boolean; error: string | null }>({ busy: false, error: null });
  // The answer being written to a question of the coordinator.
  const [answer, setAnswer] = useState('');
  // The answer is on its way, or why it failed.
  const [answering, setAnswering] = useState<{ busy: boolean; error: string | null }>({ busy: false, error: null });
  // Result file whose preview is open; one at a time keeps the page short.
  const [previewPath, setPreviewPath] = useState<string | null>(null);
  // A download is being prepared, or why it failed.
  const [download, setDownload] = useState<string | null>(null);
  // Highlights the material card while files are dragged over it.
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const kind = office.kind ?? 'coding';
  const isReady = setup.connected.length > 0 && setup.missingModels === 0;
  const needsMaterials = kind !== 'coding';
  const rawExamples = t(`simple.examples.${kind}`, { returnObjects: true }) as unknown;
  const examples = Array.isArray(rawExamples) ? rawExamples.filter((item): item is string => typeof item === 'string') : [];
  const parsed = parseWorkItems(draft);
  const tooMany = parsed.items.length > MAX_WORK_ITEMS;
  const divisionsById = new Map(divisions.map((division) => [division.id, division]));

  const activeCase = cases.find((candidate) => candidate.id === selectedCaseId) ?? null;
  const isQuestion = activeCase?.status === 'waiting_user' && activeCase.waitingReason === 'question';
  const question = isQuestion
    ? [...messages].reverse().find((message) => message.kind === 'question')
    : undefined;
  const files = [...new Set(tasks.flatMap((task) => task.changedFiles))]
    .filter((filePath) => !filePath.startsWith('/'))
    .sort();

  const sendJob = async () => {
    if (parsed.items.length === 0 || tooMany || !isReady) return;
    setSubmit({ busy: true, error: null });
    try {
      await onSubmitWork(parsed.items);
      setDraft('');
      setSubmit({ busy: false, error: null });
    } catch (error) {
      setSubmit({ busy: false, error: error instanceof Error ? error.message : String(error) });
    }
  };

  const sendAnswer = async () => {
    if (!activeCase || !answer.trim()) return;
    setAnswering({ busy: true, error: null });
    try {
      await onAnswer(activeCase.id, answer.trim());
      setAnswer('');
      setAnswering({ busy: false, error: null });
    } catch (error) {
      setAnswering({ busy: false, error: error instanceof Error ? error.message : String(error) });
    }
  };

  const downloadFile = async (filePath: string) => {
    setDownload(null);
    try {
      await downloadResultFile(projectId, filePath);
    } catch (error) {
      setDownload(error instanceof Error ? error.message : String(error));
    }
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    void materials.upload(Array.from(event.dataTransfer.files));
  };

  /** One plain-language line about where the selected work stands. */
  const headline = (caseItem: OfficeCase): string => {
    if (caseItem.status === 'done') return t('simple.state.done');
    if (caseItem.status === 'failed') return t('simple.state.failed');
    if (caseItem.status === 'waiting_user') return t(`simple.waiting.${caseItem.waitingReason ?? 'paused'}`);
    if (caseItem.status === 'draft') return t('simple.state.queued');
    if (caseItem.quickDivisionId) return t('simple.state.working');
    return t(`simple.phase.${caseItem.phase ?? 'planning'}`);
  };

  const stepsStrip = [
    { key: 'connect', done: setup.connected.length > 0 && setup.missingModels === 0 },
    ...(needsMaterials ? [{ key: 'materials', done: materials.files.length > 0 }] : []),
    { key: 'job', done: cases.some((candidate) => candidate.status !== 'draft') },
    { key: 'result', done: cases.some((candidate) => candidate.status === 'done') },
  ];

  return (
    <div className="h-full overflow-y-auto" data-testid="office-simple-view">
      <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 pb-32 pt-6">
        <header className="space-y-1">
          <h2 className="text-xl font-semibold text-foreground">{t('simple.title')}</h2>
          <p className="text-sm text-muted-foreground">{t(`simple.subtitle.${kind}`)}</p>
        </header>

        <ol className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground" aria-label={t('simple.stepsLabel')}>
          {stepsStrip.map((step, index) => (
            <li key={step.key} className="flex items-center gap-1.5">
              {stepDot(step.done)}
              <span className={cn(step.done && 'text-foreground')}>{index + 1}. {t(`simple.steps.${step.key}`)}</span>
            </li>
          ))}
        </ol>

        {/* 1. connect an AI (once) */}
        {isReady ? (
          <p className="flex items-center gap-2 text-xs text-muted-foreground" data-testid="office-simple-ready">
            <CheckCircle2 className="h-4 w-4 text-ok" />
            {t('simple.setup.ready', { providers: setup.connected.map((provider) => OFFICE_PROVIDER_LABELS[provider]).join(', ') })}
          </p>
        ) : setup.connected.length === 0 ? (
          <section className={cardClass} data-testid="office-simple-connect">
            <h3 className="text-sm font-semibold text-foreground">{t('simple.setup.title')}</h3>
            <p className="mt-1 text-xs text-muted-foreground">{t('simple.setup.body')}</p>
            <ul className="mt-3 space-y-1.5">
              {OFFICE_PROVIDERS.map((provider) => {
                const status = setup.statuses[provider];
                return (
                  <li key={provider} className="flex items-center gap-2.5 rounded-[10px] border border-border px-3 py-2">
                    {status.loading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : stepDot(status.authenticated)}
                    <span className="min-w-0 flex-1 text-sm text-foreground">
                      {OFFICE_PROVIDER_LABELS[provider]}
                      <span className="block text-[11px] text-muted-foreground">{t(`simple.setup.provider.${provider}`)}</span>
                    </span>
                    {!status.loading && !status.authenticated && (
                      <Button type="button" size="sm" variant="outline" className="h-8 px-3 text-xs" onClick={() => setup.onConnect(provider)}>
                        {t('providers.connect')}
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
            <ol className="mt-3 list-decimal space-y-0.5 pl-5 text-xs text-muted-foreground">
              <li>{t('simple.setup.step1')}</li>
              <li>{t('simple.setup.step2')}</li>
              <li>{t('simple.setup.step3')}</li>
            </ol>
            <Button type="button" variant="ghost" size="sm" className="mt-2 h-8 gap-1.5 px-2.5 text-xs" disabled={setup.isChecking} onClick={setup.onRefresh}>
              <RefreshCw className={cn('h-3.5 w-3.5', setup.isChecking && 'animate-spin')} />
              {t('providers.recheck')}
            </Button>
          </section>
        ) : (
          <section className={cardClass} data-testid="office-simple-models">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              {setup.isAutoSetting && <Loader2 className="h-4 w-4 animate-spin" />}
              {t('simple.setup.preparing')}
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">{t('simple.setup.preparingBody')}</p>
            {setup.error && <p className="mt-2 text-xs text-err">{setup.error}</p>}
            <Button type="button" size="sm" variant="outline" className="mt-2 h-8 px-3 text-xs" disabled={setup.isAutoSetting} onClick={setup.onAutoSetup}>
              {t('simple.setup.prepare')}
            </Button>
          </section>
        )}

        {/* 2. material (only for work on documents and data) */}
        {needsMaterials && (
          <section
            className={cn(cardClass, isDragging && 'border-primary/60 bg-primary/5')}
            onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={onDrop}
            data-testid="office-simple-materials"
          >
            <h3 className="text-sm font-semibold text-foreground">{t('simple.materials.title')}</h3>
            <p className="mt-1 text-xs text-muted-foreground">{t(`simple.materials.body.${kind}`)}</p>
            <div className="mt-3 flex items-center gap-2">
              <Button type="button" size="sm" variant="outline" className="h-8 gap-1.5 px-3 text-xs" disabled={materials.busy} onClick={() => fileInputRef.current?.click()}>
                {materials.busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                {t('simple.materials.pick')}
              </Button>
              <span className="text-[11px] text-muted-foreground">{t('simple.materials.optional')}</span>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                data-testid="office-simple-materials-input"
                onChange={(event) => {
                  const picked = Array.from(event.target.files ?? []);
                  event.target.value = '';
                  void materials.upload(picked);
                }}
              />
            </div>
            {materials.files.length > 0 && (
              <ul className="mt-2 space-y-0.5" aria-label={t('files.uploaded')}>
                {materials.files.map((filePath) => (
                  <li key={filePath} className="flex items-center gap-1.5 text-xs text-foreground">
                    <CheckCircle2 className="h-3.5 w-3.5 text-ok" />
                    <span className="truncate font-mono text-[11.5px]">{filePath}</span>
                  </li>
                ))}
              </ul>
            )}
            {materials.error && <p className="mt-2 text-xs text-err">{materials.error}</p>}
          </section>
        )}

        {/* 3. the job */}
        <section className={cardClass} data-testid="office-simple-job">
          <h3 className="text-sm font-semibold text-foreground">{t('simple.job.title')}</h3>
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                event.preventDefault();
                void sendJob();
              }
            }}
            rows={4}
            placeholder={t(`simple.job.placeholder.${kind}`)}
            aria-label={t('simple.job.title')}
            className="mt-2 w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
          {examples.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-muted-foreground">{t('simple.job.examples')}</span>
              {examples.map((example) => (
                <button
                  key={example}
                  type="button"
                  onClick={() => setDraft(example)}
                  className="rounded-full border border-border px-2.5 py-1 text-[11px] text-foreground hover:border-primary/60 hover:bg-primary/5"
                >
                  {example}
                </button>
              ))}
            </div>
          )}
          {parsed.isList && <p className="mt-2 text-[11px] text-muted-foreground">{t('simple.job.list', { count: parsed.items.length })}</p>}
          {tooMany && <p className="mt-1 text-[11px] text-err">{t('work.tooMany', { max: MAX_WORK_ITEMS })}</p>}
          {submit.error && <p className="mt-1 text-xs text-err">{submit.error}</p>}
          <div className="mt-3 flex items-center justify-between gap-2">
            <span className="text-[11px] text-muted-foreground">{isReady ? t('simple.job.hint') : t('simple.job.notReady')}</span>
            <Button type="button" size="sm" className="h-9 gap-1.5 px-4 text-xs" disabled={!isReady || parsed.items.length === 0 || tooMany || submit.busy} onClick={() => void sendJob()} data-testid="office-simple-send">
              {submit.busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              {t('simple.job.send')}
            </Button>
          </div>
        </section>

        {/* 4. progress and result */}
        {cases.length > 0 && (
          <section className="space-y-3" data-testid="office-simple-result">
            <h3 className="text-sm font-semibold text-foreground">{t('simple.result.title')}</h3>
            <ul className="flex flex-wrap gap-1.5">
              {cases.slice(0, MAX_LISTED_WORK).map((caseItem) => (
                <li key={caseItem.id}>
                  <button
                    type="button"
                    aria-pressed={caseItem.id === activeCase?.id}
                    onClick={() => onSelectCase(caseItem.id)}
                    className={cn(
                      'flex max-w-[16rem] items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-[11.5px] text-foreground hover:bg-muted/60',
                      caseItem.id === activeCase?.id && 'border-primary/60 bg-primary/10',
                    )}
                  >
                    {caseItem.status === 'running' ? <Loader2 className="h-3 w-3 shrink-0 animate-spin text-primary" />
                      : caseItem.status === 'done' ? <CheckCircle2 className="h-3 w-3 shrink-0 text-ok" />
                        : <Circle className={cn('h-3 w-3 shrink-0', caseItem.status === 'failed' ? 'text-err' : 'text-muted-foreground')} />}
                    <span className="truncate">{caseItem.title}</span>
                  </button>
                </li>
              ))}
            </ul>

            {activeCase && (
              <div className={cardClass}>
                <p className="flex items-center gap-2 text-sm font-medium text-foreground" data-testid="office-simple-headline">
                  {activeCase.status === 'running' && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
                  {headline(activeCase)}
                </p>
                {activeCase.status === 'failed' && activeCase.error && <p className="mt-1 text-xs text-err">{activeCase.error}</p>}

                {tasks.length > 0 && (
                  <ul className="mt-3 space-y-1.5" aria-label={t('simple.result.team')}>
                    {tasks.map((task) => {
                      const division = task.divisionId ? divisionsById.get(task.divisionId) : undefined;
                      return (
                        <li key={task.id} className="flex items-center gap-2 text-xs">
                          <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: division?.color ?? '#717784' }} />
                          <span className="min-w-0 flex-1 truncate text-foreground">
                            {division?.name ?? t('case.deletedDivision')}
                            <span className="text-muted-foreground"> · {task.title}</span>
                          </span>
                          <span className={cn('shrink-0 text-[11px]', task.status === 'done' ? 'text-ok' : task.status === 'failed' ? 'text-err' : 'text-muted-foreground')}>
                            {t(`simple.taskState.${task.status}`)}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}

                {isQuestion && (
                  <div className="mt-3 space-y-2 rounded-[10px] border border-warn/40 bg-warn/5 p-3" data-testid="office-simple-question">
                    <p className="text-xs font-medium text-foreground">{t('simple.result.question')}</p>
                    {question && <p className="whitespace-pre-wrap text-xs text-foreground">{String(question.payload.text ?? '')}</p>}
                    <textarea
                      value={answer}
                      onChange={(event) => setAnswer(event.target.value)}
                      rows={2}
                      aria-label={t('simple.result.answer')}
                      className="w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                    {answering.error && <p className="text-xs text-err">{answering.error}</p>}
                    <Button type="button" size="sm" className="h-8 px-3 text-xs" disabled={!answer.trim() || answering.busy} onClick={() => void sendAnswer()}>
                      {t('simple.result.sendAnswer')}
                    </Button>
                  </div>
                )}

                {activeCase.status === 'done' && activeCase.finalSummary && (
                  <div className="mt-3 rounded-[10px] border border-border bg-background/60 p-3">
                    <p className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">{t('simple.result.summary')}</p>
                    <MarkdownPreview markdown={activeCase.finalSummary} />
                  </div>
                )}

                {files.length > 0 && (
                  <div className="mt-3" data-testid="office-simple-files">
                    <p className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">{t('simple.result.files', { count: files.length })}</p>
                    <ul className="space-y-1">
                      {files.map((filePath) => (
                        <li key={filePath} className="rounded-[10px] border border-border">
                          <div className="flex items-center gap-2 px-2.5 py-1.5">
                            <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                            <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-foreground" title={filePath}>{filePath}</span>
                            <Button type="button" size="sm" variant="ghost" className="h-7 gap-1 px-2 text-[11px]" onClick={() => setPreviewPath(previewPath === filePath ? null : filePath)}>
                              {previewPath === filePath ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                              {previewPath === filePath ? t('simple.result.hide') : t('simple.result.view')}
                            </Button>
                            <Button type="button" size="sm" variant="ghost" className="h-7 gap-1 px-2 text-[11px]" onClick={() => void downloadFile(filePath)}>
                              <Download className="h-3.5 w-3.5" />
                              {t('simple.result.download')}
                            </Button>
                          </div>
                          {previewPath === filePath && (
                            <div className="border-t border-border p-2.5">
                              <ResultFilePreview projectId={projectId} filePath={filePath} />
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                    {download && <p className="mt-1 text-xs text-err">{download}</p>}
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        <button type="button" onClick={onShowTeam} className="flex items-center gap-1.5 self-start text-xs text-primary hover:underline" data-testid="office-simple-show-team">
          <Users className="h-3.5 w-3.5" />
          {t('simple.showTeam')}
        </button>
      </div>
    </div>
  );
}
