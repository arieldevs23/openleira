import type { OfficeAnalysis } from '@/shared/types';

/** The stages an app analysis goes through, as shown in its progress bar. */
export type AnalysisStage = 'session' | 'reading' | 'writing' | 'done';

export const ANALYSIS_STAGES: AnalysisStage[] = ['session', 'reading', 'writing', 'done'];

/** Where an analysis stands, read from what it has reported so far. */
export function analysisStage(analysis: Pick<OfficeAnalysis, 'status' | 'sessionId' | 'steps' | 'stepCount'>): AnalysisStage {
  if (analysis.status === 'done') return 'done';
  if (!analysis.sessionId || analysis.stepCount === 0) return 'session';
  const last = analysis.steps[analysis.steps.length - 1];
  return last?.type === 'text' ? 'writing' : 'reading';
}
