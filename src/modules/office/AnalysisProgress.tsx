import { AlertTriangle, Check, FileText, Loader2, MessageSquare, Search, Wrench } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ANALYSIS_STAGES, analysisStage } from '@/modules/office/utils/officeAnalysis';
import type { OfficeAnalysis, OfficeLogEntry } from '@/shared/types';
import { cn } from '@/shared/utils';

const formatElapsed = (milliseconds: number): string => {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(seconds / 60);
  return minutes > 0 ? `${minutes}m ${String(seconds % 60).padStart(2, '0')}s` : `${seconds}s`;
};

const stepIcon = (step: OfficeLogEntry) => {
  if (step.type === 'error') return AlertTriangle;
  if (step.type === 'text') return MessageSquare;
  if (step.toolName === 'Read') return FileText;
  if (step.toolName === 'Grep' || step.toolName === 'Glob') return Search;
  return Wrench;
};

type AnalysisProgressProps = {
  analysis: OfficeAnalysis;
  onOpenSession?: (sessionId: string) => void;
};

/**
 * Live progress of an "analyse an existing app" run in the add-workspace
 * dialog: the stage it is in, how long it has run, and every file it read or
 * search it made, as the agent reports them.
 */
export default function AnalysisProgress({ analysis, onOpenSession }: AnalysisProgressProps) {
  const { t } = useTranslation('office');
  // The current time, ticking once a second while the analysis runs, for the elapsed clock.
  const [now, setNow] = useState(() => Date.now());
  const listRef = useRef<HTMLOListElement | null>(null);
  const stage = analysisStage(analysis);
  const isRunning = analysis.status === 'running';

  useEffect(() => {
    if (!isRunning) {
      return undefined;
    }
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [isRunning]);

  // Follows the newest step, like a terminal.
  useEffect(() => {
    const list = listRef.current;
    if (list) {
      list.scrollTop = list.scrollHeight;
    }
  }, [analysis.stepCount]);

  const endedAt = isRunning ? now : new Date(analysis.updatedAt).getTime();
  const elapsed = formatElapsed(endedAt - new Date(analysis.createdAt).getTime());
  const hiddenSteps = analysis.stepCount - analysis.steps.length;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3" data-testid="office-analysis-progress" data-stage={stage}>
      <div className="flex items-start gap-2.5">
        {isRunning ? <Loader2 className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-primary" /> : <Check className="mt-0.5 h-5 w-5 shrink-0 text-ok" />}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">{t('addWorkspace.analysing', { name: analysis.projectName })}</p>
          <p className="text-[11px] text-muted-foreground">
            <span data-testid="office-analysis-elapsed">{elapsed}</span>
            {' · '}
            {t('addWorkspace.stepCount', { count: analysis.stepCount })}
            {' · '}
            <span className="font-mono">{analysis.model}</span>
          </p>
        </div>
        {analysis.sessionId && onOpenSession && (
          <button type="button" onClick={() => onOpenSession(analysis.sessionId as string)} className="shrink-0 text-[11px] text-primary hover:underline">
            {t('addWorkspace.openSession')}
          </button>
        )}
      </div>

      <ol className="grid grid-cols-4 gap-1" aria-label={t('addWorkspace.stagesLabel')}>
        {ANALYSIS_STAGES.map((candidate, index) => {
          const reached = ANALYSIS_STAGES.indexOf(stage) >= index;
          const current = candidate === stage && isRunning;
          return (
            <li key={candidate} className="space-y-1" aria-current={current ? 'step' : undefined}>
              <div className={cn('h-1 rounded-full', reached ? 'bg-primary' : 'bg-muted', current && 'animate-pulse')} />
              <span className={cn('block text-[10.5px]', reached ? 'text-foreground' : 'text-muted-foreground')}>
                {t(`addWorkspace.stage.${candidate}`)}
              </span>
            </li>
          );
        })}
      </ol>

      <ol
        ref={listRef}
        className="max-h-64 min-h-[7rem] space-y-0.5 overflow-y-auto rounded-[10px] border border-border bg-muted/30 p-2 font-mono text-[11px]"
        aria-label={t('addWorkspace.stepsLabel')}
        aria-live="polite"
        data-testid="office-analysis-steps"
      >
        {hiddenSteps > 0 && <li className="text-muted-foreground">{t('addWorkspace.earlierSteps', { count: hiddenSteps })}</li>}
        {analysis.steps.length === 0 && <li className="text-muted-foreground">{t('addWorkspace.waitingForAgent')}</li>}
        {analysis.steps.map((step) => {
          const Icon = stepIcon(step);
          return (
            <li key={step.id} className={cn('flex min-w-0 items-start gap-1.5', step.type === 'error' && 'text-err')}>
              <Icon className="mt-[2px] h-3 w-3 shrink-0 text-muted-foreground" />
              {step.toolName && <span className="shrink-0 text-primary">{step.toolName}</span>}
              <span className={cn('min-w-0', step.type === 'text' ? 'line-clamp-2 font-sans' : 'truncate')} title={step.text}>{step.text}</span>
            </li>
          );
        })}
      </ol>
      <p className="text-[11px] text-muted-foreground">{t('addWorkspace.backgroundHint')}</p>
    </div>
  );
}
