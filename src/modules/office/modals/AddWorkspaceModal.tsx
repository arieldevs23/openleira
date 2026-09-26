import { ChevronRight, FolderPlus, FolderSearch, GitBranch, Loader2, Plus, Sparkles, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import ModelSelect from '@/modules/office/ModelSelect';
import { cloneWorkspaceWithProgress, fetchGithubTokenCredentials, WorkspacePathField } from '@/modules/project-creation-wizard';
import AnalysisProgress from '@/modules/office/AnalysisProgress';
import { api, readApiJson } from '@/shared/api';
import { Button, Dialog, DialogContent, DialogTitle } from '@/shared/ui';
import type {
  GithubTokenCredential,
  LLMProvider,
  OfficeAnalysis,
  OfficeDivisionProposal,
  OfficeModelGroup,
  OfficePreparedFolder,
} from '@/shared/types';
import { cn } from '@/shared/utils';

type Step = 'source' | 'folder' | 'setup' | 'analysing' | 'review';

const inputClass = 'w-full rounded-md border border-input bg-background px-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring';

const emptyProposal = (): OfficeDivisionProposal => ({
  name: '', slug: '', description: '', color: '#2551BD', agentName: '', rolePrompt: '',
});

type AddWorkspaceModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locale: string;
  /** Models of the connected providers, for the analysis agent. */
  groups: OfficeModelGroup[];
  /** Opens the provider setup when no provider is connected yet. */
  onConnectProviders: () => void;
  /** A workspace exists for this folder now (created, or it already had one). */
  onReady: (projectId: string) => void;
  /** Live analyses (from the page's `office:analysis` subscription). */
  analyses: OfficeAnalysis[];
  /** Reopens an analysis that kept running (or finished) while the dialog was closed. */
  resumeAnalysisId?: string | null;
  /** Opens the analysis session in the regular chat view. */
  onOpenSession?: (sessionId: string) => void;
};

/** Where a reopened analysis puts the dialog. */
const stepFor = (analysis: OfficeAnalysis): Step => (
  analysis.status === 'running' ? 'analysing' : analysis.status === 'done' ? 'review' : 'setup'
);

/**
 * "Add workspace": a workspace always works in one folder, so the folder
 * comes first. Either a new, empty folder (default divisions), or an app
 * that already exists, which an agent reads to propose divisions the user
 * reviews before the workspace is created.
 */
export default function AddWorkspaceModal({
  open,
  onOpenChange,
  locale,
  groups,
  onConnectProviders,
  onReady,
  analyses,
  resumeAnalysisId,
  onOpenSession,
}: AddWorkspaceModalProps) {
  const { t } = useTranslation('office');
  const resumed = analyses.find((candidate) => candidate.id === resumeAnalysisId) ?? null;
  // The dialog page on screen; a reopened analysis starts where it stands.
  const [step, setStep] = useState<Step>(() => (resumed ? stepFor(resumed) : 'source'));
  // New folder or existing app.
  const [mode, setMode] = useState<'new' | 'existing' | 'github'>(resumed ? 'existing' : 'new');
  // The repository to clone (https, or git@host:owner/repo over the server's SSH keys).
  const [repoUrl, setRepoUrl] = useState('');
  // Stored GitHub tokens the clone can use, loaded when the GitHub source is picked.
  const [tokens, setTokens] = useState<GithubTokenCredential[] | null>(null);
  // Which token the clone uses: a stored one (its id), a pasted one, or none (public repo or SSH).
  const [tokenChoice, setTokenChoice] = useState<string>('none');
  // A token pasted for this clone only; it is not stored.
  const [newToken, setNewToken] = useState('');
  // Progress lines git reports while cloning.
  const [cloneLog, setCloneLog] = useState<string[]>([]);
  // The folder path being typed or browsed.
  const [folderPath, setFolderPath] = useState(resumed?.projectPath ?? '');
  // The folder once the server readied it as a project.
  const [folder, setFolder] = useState<OfficePreparedFolder | null>(() => (resumed
    ? { projectId: resumed.projectId, projectPath: resumed.projectPath, projectName: resumed.projectName, hasWorkspace: false }
    : null));
  // Model the analysis agent runs on.
  const [analysisModel, setAnalysisModel] = useState<{ provider: LLMProvider; model: string } | null>(
    resumed ? { provider: resumed.provider, model: resumed.model } : null,
  );
  // The analysis this dialog follows, and its state as returned by the start request (until frames arrive).
  const [analysisId, setAnalysisId] = useState<string | null>(resumed?.id ?? null);
  const [startedAnalysis, setStartedAnalysis] = useState<OfficeAnalysis | null>(null);
  // App summary and divisions under review; editable.
  const [summary, setSummary] = useState(resumed?.status === 'done' ? resumed.summary ?? '' : '');
  const [proposals, setProposals] = useState<OfficeDivisionProposal[]>(resumed?.status === 'done' ? resumed.divisions : []);
  // Proposal rows unfolded to edit their role.
  const [expanded, setExpanded] = useState<ReadonlySet<number>>(() => new Set());
  // A request in flight.
  const [isBusy, setIsBusy] = useState(false);
  // Error of the last step; a reopened failed analysis starts with its reason.
  const [error, setError] = useState<string | null>(
    resumed?.status === 'failed' ? resumed.error : resumed?.status === 'cancelled' ? t('addWorkspace.analysisCancelled') : null,
  );

  const analysis = analyses.find((candidate) => candidate.id === analysisId)
    ?? (startedAnalysis?.id === analysisId ? startedAnalysis : null);
  const lastStatusRef = useRef(analysis?.status ?? null);

  // The analysis runs on the server and reports over the page's websocket subscription;
  // when it finishes while this dialog is open, the dialog moves on by itself.
  useEffect(() => {
    const status = analysis?.status ?? null;
    if (status === lastStatusRef.current) {
      return;
    }
    lastStatusRef.current = status;
    if (!analysis || step !== 'analysing') {
      return;
    }
    if (analysis.status === 'done') {
      setSummary(analysis.summary ?? '');
      setProposals(analysis.divisions);
      setStep('review');
    } else if (analysis.status === 'failed' || analysis.status === 'cancelled') {
      setError(analysis.status === 'failed' ? analysis.error ?? t('addWorkspace.analysisFailed') : t('addWorkspace.analysisCancelled'));
      setStep('setup');
    }
  }, [analysis, step, t]);

  const run = async (work: () => Promise<void>) => {
    setIsBusy(true);
    setError(null);
    try {
      await work();
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : String(runError));
    } finally {
      setIsBusy(false);
    }
  };

  const prepareFolder = () => run(async () => {
    const body = await readApiJson<{ data: OfficePreparedFolder }>(await api.office.prepareFolder(folderPath.trim(), mode === 'new' ? 'new' : 'existing'));
    const prepared = body.data;
    if (prepared.hasWorkspace) {
      setFolder(prepared);
      setError(t('addWorkspace.alreadyHasWorkspace'));
      return;
    }
    setFolder(prepared);
    if (mode === 'new') {
      await readApiJson(await api.office.create(prepared.projectId, locale));
      onReady(prepared.projectId);
      onOpenChange(false);
      return;
    }
    setStep('setup');
  });

  const loadTokens = () => {
    if (tokens !== null) {
      return;
    }
    fetchGithubTokenCredentials()
      .then((loaded) => {
        setTokens(loaded);
        if (loaded.length > 0) {
          setTokenChoice(String(loaded[0].id));
        }
      })
      .catch(() => setTokens([]));
  };

  /** Clones the repository into the picked folder, then continues like an existing app (analysis or default teams). */
  const cloneRepository = () => run(async () => {
    setCloneLog([]);
    const project = await cloneWorkspaceWithProgress({
      workspacePath: folderPath,
      githubUrl: repoUrl,
      tokenMode: tokenChoice === 'new' ? 'new' : tokenChoice === 'none' ? 'none' : 'stored',
      selectedGithubToken: tokenChoice !== 'new' && tokenChoice !== 'none' ? tokenChoice : '',
      newGithubToken: newToken,
    }, { onProgress: (message) => setCloneLog((current) => [...current.slice(-40), message]) });
    const clonedPath = String(project?.fullPath ?? project?.path ?? '');
    if (!clonedPath) {
      throw new Error(t('addWorkspace.cloneNoPath'));
    }
    const body = await readApiJson<{ data: OfficePreparedFolder }>(await api.office.prepareFolder(clonedPath, 'existing'));
    setFolder(body.data);
    if (body.data.hasWorkspace) {
      setError(t('addWorkspace.alreadyHasWorkspace'));
      return;
    }
    setStep('setup');
  });

  const startAnalysis = () => run(async () => {
    if (!folder || !analysisModel) {
      return;
    }
    const body = await readApiJson<{ data: OfficeAnalysis }>(await api.office.startAnalysis({
      projectId: folder.projectId,
      provider: analysisModel.provider,
      model: analysisModel.model,
      locale,
    }));
    setStartedAnalysis(body.data);
    setAnalysisId(body.data.id);
    lastStatusRef.current = body.data.status;
    setStep('analysing');
  });

  const createWith = (divisions: OfficeDivisionProposal[] | null) => run(async () => {
    if (!folder) {
      return;
    }
    await readApiJson(await api.office.create(folder.projectId, locale, divisions
      ? { divisions: divisions.filter((proposal) => proposal.name.trim()), appSummary: summary }
      : {}));
    onReady(folder.projectId);
    onOpenChange(false);
  });

  const updateProposal = (index: number, changes: Partial<OfficeDivisionProposal>) => {
    setProposals((current) => current.map((proposal, position) => (position === index ? { ...proposal, ...changes } : proposal)));
  };

  const sourceCard = (value: 'new' | 'existing' | 'github', Icon: typeof FolderPlus, title: string, body: string) => (
    <button
      type="button"
      onClick={() => {
        setMode(value);
        setStep('folder');
        setError(null);
        if (value === 'github') loadTokens();
      }}
      className="flex w-full items-start gap-3 rounded-[12px] border border-border p-3 text-left hover:border-primary/60 hover:bg-primary/5"
      data-testid={`office-add-${value}`}
    >
      <Icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-foreground">{title}</span>
        <span className="block text-xs text-muted-foreground">{body}</span>
      </span>
    </button>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[88vh] max-w-2xl flex-col gap-3 p-5">
        <DialogTitle className="not-sr-only text-base font-semibold text-foreground">{t('addWorkspace.title')}</DialogTitle>

        {step === 'source' && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">{t('addWorkspace.intro')}</p>
            {sourceCard('new', FolderPlus, t('addWorkspace.newTitle'), t('addWorkspace.newBody'))}
            {sourceCard('existing', FolderSearch, t('addWorkspace.existingTitle'), t('addWorkspace.existingBody'))}
            {sourceCard('github', GitBranch, t('addWorkspace.githubTitle'), t('addWorkspace.githubBody'))}
          </div>
        )}

        {step === 'folder' && mode === 'github' && (
          <div className="space-y-2" data-testid="office-add-github-form">
            <label className="block space-y-1">
              <span className="text-xs font-medium text-foreground">{t('addWorkspace.repoUrl')}</span>
              <input
                value={repoUrl}
                onChange={(event) => setRepoUrl(event.target.value)}
                placeholder="https://github.com/owner/repo  ·  git@github.com:owner/repo.git"
                className={cn(inputClass, 'h-9 font-mono text-xs')}
                aria-label={t('addWorkspace.repoUrl')}
                disabled={isBusy}
              />
            </label>
            <div className="space-y-1">
              <span className="text-xs font-medium text-foreground">{t('addWorkspace.cloneInto')}</span>
              <WorkspacePathField value={folderPath} onChange={setFolderPath} onAdvanceToConfirm={() => void cloneRepository()} disabled={isBusy} />
            </div>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-foreground">{t('addWorkspace.token')}</span>
              <select
                value={tokenChoice}
                onChange={(event) => setTokenChoice(event.target.value)}
                className={cn(inputClass, 'h-9')}
                aria-label={t('addWorkspace.token')}
                disabled={isBusy}
              >
                <option value="none">{t('addWorkspace.tokenNone')}</option>
                {(tokens ?? []).map((token) => <option key={token.id} value={String(token.id)}>{token.credential_name}</option>)}
                <option value="new">{t('addWorkspace.tokenNew')}</option>
              </select>
            </label>
            {tokenChoice === 'new' && (
              <input
                type="password"
                value={newToken}
                onChange={(event) => setNewToken(event.target.value)}
                placeholder="ghp_…"
                autoComplete="off"
                className={cn(inputClass, 'h-9 font-mono text-xs')}
                aria-label={t('addWorkspace.tokenNew')}
                disabled={isBusy}
              />
            )}
            <p className="text-[11px] text-muted-foreground">{t('addWorkspace.githubHint')}</p>
            {cloneLog.length > 0 && (
              <ol className="max-h-32 overflow-y-auto rounded-[10px] border border-border bg-muted/30 p-2 font-mono text-[11px]" aria-live="polite" data-testid="office-clone-log">
                {cloneLog.map((line, index) => <li key={index} className="truncate">{line}</li>)}
              </ol>
            )}
            {error && (
              <p className="text-xs text-red-600 dark:text-red-300">
                {error}
                {folder?.hasWorkspace && (
                  <button type="button" className="ml-1 font-medium underline" onClick={() => { onReady(folder.projectId); onOpenChange(false); }}>
                    {t('addWorkspace.openIt')}
                  </button>
                )}
              </p>
            )}
            <div className="flex justify-between gap-2 pt-1">
              <Button type="button" variant="ghost" size="sm" className="h-8 px-3 text-xs" onClick={() => { setStep('source'); setError(null); }}>{t('addWorkspace.back')}</Button>
              <Button
                type="button"
                size="sm"
                className="h-8 gap-1.5 px-3 text-xs"
                disabled={!repoUrl.trim() || !folderPath.trim() || (tokenChoice === 'new' && !newToken.trim()) || isBusy}
                onClick={() => void cloneRepository()}
              >
                {isBusy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {t('addWorkspace.clone')}
              </Button>
            </div>
          </div>
        )}

        {step === 'folder' && mode !== 'github' && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">{mode === 'new' ? t('addWorkspace.newFolderHint') : t('addWorkspace.existingFolderHint')}</p>
            <WorkspacePathField value={folderPath} onChange={setFolderPath} onAdvanceToConfirm={() => void prepareFolder()} disabled={isBusy} />
            {error && (
              <p className="text-xs text-red-600 dark:text-red-300">
                {error}
                {folder?.hasWorkspace && (
                  <button type="button" className="ml-1 font-medium underline" onClick={() => { onReady(folder.projectId); onOpenChange(false); }}>
                    {t('addWorkspace.openIt')}
                  </button>
                )}
              </p>
            )}
            <div className="flex justify-between gap-2 pt-1">
              <Button type="button" variant="ghost" size="sm" className="h-8 px-3 text-xs" onClick={() => { setStep('source'); setError(null); }}>{t('addWorkspace.back')}</Button>
              <Button type="button" size="sm" className="h-8 gap-1.5 px-3 text-xs" disabled={!folderPath.trim() || isBusy} onClick={() => void prepareFolder()}>
                {isBusy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {mode === 'new' ? t('addWorkspace.createFolder') : t('addWorkspace.next')}
              </Button>
            </div>
          </div>
        )}

        {step === 'setup' && folder && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">{t('addWorkspace.setupIntro', { name: folder.projectName })}</p>
            <div className="space-y-2 rounded-[12px] border border-border p-3">
              <span className="flex items-center gap-1.5 text-sm font-medium text-foreground"><Sparkles className="h-4 w-4 text-primary" />{t('addWorkspace.analyseTitle')}</span>
              <p className="text-xs text-muted-foreground">{t('addWorkspace.analyseBody')}</p>
              {groups.length === 0 ? (
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  {t('addWorkspace.noProvider')}
                  <button type="button" className="ml-1 font-medium underline" onClick={onConnectProviders}>{t('providers.connectAction')}</button>
                </p>
              ) : (
                <div className="flex items-center gap-2">
                  <ModelSelect value={analysisModel} groups={groups} onChange={setAnalysisModel} ariaLabel={t('addWorkspace.analysisModel')} />
                  <Button type="button" size="sm" className="h-9 shrink-0 px-3 text-xs" disabled={!analysisModel || isBusy} onClick={() => void startAnalysis()}>
                    {t('addWorkspace.analyse')}
                  </Button>
                </div>
              )}
            </div>
            <button type="button" className="text-xs text-primary hover:underline" disabled={isBusy} onClick={() => void createWith(null)}>
              {t('addWorkspace.useDefaults')}
            </button>
            {error && <p className="text-xs text-red-600 dark:text-red-300">{error}</p>}
          </div>
        )}

        {step === 'analysing' && (
          analysis ? (
            <div className="flex min-h-0 flex-1 flex-col gap-3">
              <AnalysisProgress analysis={analysis} onOpenSession={onOpenSession} />
              {error && <p className="text-xs text-red-600 dark:text-red-300">{error}</p>}
              <div className="flex justify-between gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 px-3 text-xs text-red-600 hover:text-red-700 dark:text-red-300"
                  disabled={isBusy}
                  onClick={() => void run(async () => { await readApiJson(await api.office.cancelAnalysis(analysis.id)); })}
                >
                  {t('addWorkspace.cancelAnalysis')}
                </Button>
                <Button type="button" size="sm" className="h-8 px-3 text-xs" onClick={() => onOpenChange(false)} data-testid="office-analysis-background">
                  {t('addWorkspace.runInBackground')}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground" role="status">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t('loading')}
            </div>
          )
        )}

        {step === 'review' && (
          <div className="flex min-h-0 flex-1 flex-col gap-2">
            <p className="text-xs text-muted-foreground">{t('addWorkspace.reviewIntro')}</p>
            <label className="block space-y-1">
              <span className="text-[11px] text-muted-foreground">{t('addWorkspace.summary')}</span>
              <textarea value={summary} onChange={(event) => setSummary(event.target.value)} rows={3} className={`${inputClass} py-1.5 text-xs`} />
            </label>
            <ul className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1" data-testid="office-proposals">
              {proposals.map((proposal, index) => {
                const isOpen = expanded.has(index);
                return (
                  <li key={index} className="rounded-[10px] border border-border">
                    <div className="flex items-center gap-2 p-2">
                      <button
                        type="button"
                        aria-expanded={isOpen}
                        aria-label={t('addWorkspace.editRole')}
                        onClick={() => setExpanded((current) => {
                          const next = new Set(current);
                          if (next.has(index)) next.delete(index); else next.add(index);
                          return next;
                        })}
                        className="rounded-md p-0.5 text-muted-foreground hover:text-foreground"
                      >
                        <ChevronRight className={cn('h-3.5 w-3.5 transition-transform', isOpen && 'rotate-90')} />
                      </button>
                      <input type="color" value={proposal.color} onChange={(event) => updateProposal(index, { color: event.target.value })} className="h-6 w-7 shrink-0 cursor-pointer rounded border border-input" aria-label={t('division.color')} />
                      <input value={proposal.name} onChange={(event) => updateProposal(index, { name: event.target.value })} placeholder={t('division.name')} aria-label={t('division.name')} className={`${inputClass} h-7 min-w-0 flex-1`} />
                      <input value={proposal.agentName} onChange={(event) => updateProposal(index, { agentName: event.target.value })} placeholder={t('agent.name')} aria-label={t('agent.name')} className={`${inputClass} h-7 w-28 shrink-0`} />
                      <button type="button" onClick={() => setProposals((current) => current.filter((_, position) => position !== index))} className="rounded-md p-1 text-muted-foreground hover:text-red-600" aria-label={t('addWorkspace.removeDivision')}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {isOpen && (
                      <div className="space-y-1.5 px-2 pb-2">
                        <input value={proposal.description} onChange={(event) => updateProposal(index, { description: event.target.value })} placeholder={t('division.description')} className={`${inputClass} h-7 text-xs`} />
                        <textarea value={proposal.rolePrompt} onChange={(event) => updateProposal(index, { rolePrompt: event.target.value })} rows={6} placeholder={t('agent.rolePromptPlaceholder')} aria-label={t('agent.rolePrompt')} className={`${inputClass} py-1.5 font-mono text-[11.5px]`} />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
            <button type="button" className="flex items-center gap-1 self-start text-xs text-primary hover:underline" onClick={() => setProposals((current) => [...current, emptyProposal()])}>
              <Plus className="h-3.5 w-3.5" />{t('addWorkspace.addDivision')}
            </button>
            {error && <p className="text-xs text-red-600 dark:text-red-300">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" className="h-8 px-3 text-xs" onClick={() => setStep('setup')}>{t('addWorkspace.back')}</Button>
              <Button type="button" size="sm" className="h-8 px-3 text-xs" disabled={isBusy || !proposals.some((proposal) => proposal.name.trim())} onClick={() => void createWith(proposals)}>
                {isBusy ? t('common.saving') : t('addWorkspace.create')}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
