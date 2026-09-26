import { ChevronRight, FolderPlus, FolderSearch, Loader2, Plus, Sparkles, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import ModelSelect from '@/modules/office/ModelSelect';
import { WorkspacePathField } from '@/modules/project-creation-wizard';
import { api, readApiJson } from '@/shared/api';
import { useWebSocket } from '@/shared/context/WebSocketContext';
import { Button, Dialog, DialogContent, DialogTitle } from '@/shared/ui';
import type {
  LLMProvider,
  OfficeAnalysis,
  OfficeAnalysisEvent,
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
};

/**
 * "Add workspace": a workspace always works in one folder, so the folder
 * comes first. Either a new, empty folder (default divisions), or an app
 * that already exists, which an agent reads to propose divisions the user
 * reviews before the workspace is created.
 */
export default function AddWorkspaceModal({ open, onOpenChange, locale, groups, onConnectProviders, onReady }: AddWorkspaceModalProps) {
  const { t } = useTranslation('office');
  const { subscribe } = useWebSocket();
  // The dialog page on screen.
  const [step, setStep] = useState<Step>('source');
  // New folder or existing app.
  const [mode, setMode] = useState<'new' | 'existing'>('new');
  // The folder path being typed or browsed.
  const [folderPath, setFolderPath] = useState('');
  // The folder once the server readied it as a project.
  const [folder, setFolder] = useState<OfficePreparedFolder | null>(null);
  // Model the analysis agent runs on.
  const [analysisModel, setAnalysisModel] = useState<{ provider: LLMProvider; model: string } | null>(null);
  // The running or finished analysis.
  const [analysis, setAnalysis] = useState<OfficeAnalysis | null>(null);
  // App summary and divisions under review; editable.
  const [summary, setSummary] = useState('');
  const [proposals, setProposals] = useState<OfficeDivisionProposal[]>([]);
  // Proposal rows unfolded to edit their role.
  const [expanded, setExpanded] = useState<ReadonlySet<number>>(() => new Set());
  // A request in flight.
  const [isBusy, setIsBusy] = useState(false);
  // Error of the last step.
  const [error, setError] = useState<string | null>(null);

  // The analysis reports back over the shared websocket; a reconnect re-reads it once.
  useEffect(() => {
    if (!analysis || analysis.status !== 'running') {
      return undefined;
    }
    const analysisId = analysis.id;
    const apply = (next: OfficeAnalysis) => {
      setAnalysis(next);
      if (next.status === 'done') {
        setSummary(next.summary ?? '');
        setProposals(next.divisions);
        setStep('review');
      } else if (next.status === 'failed') {
        setError(next.error ?? t('addWorkspace.analysisFailed'));
        setStep('setup');
      }
    };
    return subscribe((event) => {
      if (event.kind === 'office:analysis') {
        const frame = event as unknown as OfficeAnalysisEvent;
        if (frame.analysis.id === analysisId) {
          apply(frame.analysis);
        }
      } else if (event.kind === 'websocket_reconnected') {
        void api.office.analysis(analysisId)
          .then((response) => readApiJson<{ data: OfficeAnalysis }>(response))
          .then((body) => apply(body.data))
          .catch(() => {});
      }
    });
  }, [analysis, subscribe, t]);

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
    const body = await readApiJson<{ data: OfficePreparedFolder }>(await api.office.prepareFolder(folderPath.trim(), mode));
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
    setAnalysis(body.data);
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

  const sourceCard = (value: 'new' | 'existing', Icon: typeof FolderPlus, title: string, body: string) => (
    <button
      type="button"
      onClick={() => { setMode(value); setStep('folder'); setError(null); }}
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
          </div>
        )}

        {step === 'folder' && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">{mode === 'new' ? t('addWorkspace.newFolderHint') : t('addWorkspace.existingFolderHint')}</p>
            <WorkspacePathField value={folderPath} onChange={setFolderPath} onAdvanceToConfirm={() => void prepareFolder()} disabled={isBusy} />
            {error && (
              <p className="text-xs text-err">
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
                <p className="text-xs text-warn">
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
            {error && <p className="text-xs text-err">{error}</p>}
          </div>
        )}

        {step === 'analysing' && (
          <div className="flex flex-col items-center gap-2 py-8 text-center" role="status">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <p className="text-sm text-foreground">{t('addWorkspace.analysing', { name: folder?.projectName ?? '' })}</p>
            <p className="max-w-sm text-xs text-muted-foreground">{t('addWorkspace.analysingHint')}</p>
          </div>
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
                      <button type="button" onClick={() => setProposals((current) => current.filter((_, position) => position !== index))} className="rounded-md p-1 text-muted-foreground hover:text-err" aria-label={t('addWorkspace.removeDivision')}>
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
            {error && <p className="text-xs text-err">{error}</p>}
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
