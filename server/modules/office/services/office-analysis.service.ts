import { randomUUID } from 'node:crypto';

import { officesDb, projectsDb } from '@/modules/database/index.js';
import type { OfficeAgentRunner } from '@/modules/office/services/office-agent-runner.service.js';
import { broadcastOfficeAnalysis, toOfficeLogEntry } from '@/modules/office/services/office-events.service.js';
import { parseAppAnalysis } from '@/modules/office/services/office-plan-parser.service.js';
import { buildAppAnalysisPrompt } from '@/modules/office/services/office-prompts.service.js';
import type { LLMProvider, OfficeAnalysis } from '@/shared/types.js';
import { AppError } from '@/shared/utils.js';

/** Finished analyses are kept this long, so the user can review one they left running in the background. */
const ANALYSIS_TTL_MS = 60 * 60 * 1000;

/** The analysis only reads the repository; on Claude everything else is removed from its toolbox. */
const READ_ONLY_TOOLS = ['Read', 'Glob', 'Grep'];

/** How many recent steps an analysis carries in its frames; older ones only count towards `stepCount`. */
const MAX_STEPS = 40;

type StoredAnalysis = OfficeAnalysis & { expiresAt: number };

/** Analysis runs the Office routes start; clients follow them over `office:analysis` frames. */
export type OfficeAnalyzer = {
  start(input: {
    projectId: string;
    provider: LLMProvider;
    model: string;
    locale: string | null;
    userId: string | number | null;
  }): OfficeAnalysis;
  get(analysisId: string): OfficeAnalysis;
  /**
   * Analyses the add-workspace flow can come back to: running ones, and
   * finished ones whose folder still has no workspace. Newest first.
   */
  list(): OfficeAnalysis[];
  /** Stops a running analysis; its session is aborted like a cancelled case. */
  cancel(analysisId: string): Promise<OfficeAnalysis>;
  /** Forgets a finished analysis the user no longer wants to review. */
  dismiss(analysisId: string): void;
};

const toVisible = ({ expiresAt: _expiresAt, ...visible }: StoredAnalysis): OfficeAnalysis => visible;

/**
 * "Analyse an existing app": one read-only agent turn in the app's folder that
 * summarises the app and proposes the divisions of its workspace. The turn is
 * a normal app session run by the shared runner, on the server, so it keeps
 * going when the browser closes the dialog. Every step it takes (files read,
 * searches) is streamed as progress; the result is held in memory until the
 * user reviews it and creates the workspace.
 */
export function createOfficeAnalyzer(dependencies: { runner: OfficeAgentRunner }): OfficeAnalyzer {
  const analyses = new Map<string, StoredAnalysis>();

  const publish = (analysis: StoredAnalysis): OfficeAnalysis => {
    const stored = { ...analysis, updatedAt: new Date().toISOString() };
    analyses.set(stored.id, stored);
    const visible = toVisible(stored);
    broadcastOfficeAnalysis(visible);
    return visible;
  };

  const prune = () => {
    const now = Date.now();
    for (const [id, analysis] of analyses) {
      if (analysis.status !== 'running' && analysis.expiresAt < now) {
        analyses.delete(id);
      }
    }
  };

  const requireAnalysis = (analysisId: string): StoredAnalysis => {
    const analysis = analyses.get(analysisId);
    if (!analysis) {
      throw new AppError('Analysis not found; it may have expired.', { code: 'OFFICE_ANALYSIS_NOT_FOUND', statusCode: 404 });
    }
    return analysis;
  };

  return {
    start(input) {
      prune();
      const project = projectsDb.getProjectById(input.projectId);
      if (!project) {
        throw new AppError('Project not found.', { code: 'PROJECT_NOT_FOUND', statusCode: 404 });
      }
      if (officesDb.getOfficeByProjectPath(project.project_path)) {
        throw new AppError('This folder already has a workspace.', { code: 'OFFICE_ALREADY_EXISTS', statusCode: 409 });
      }
      const running = [...analyses.values()].find((analysis) => analysis.projectId === input.projectId && analysis.status === 'running');
      if (running) {
        return toVisible(running);
      }

      const projectName = project.custom_project_name?.trim()
        || project.project_path.split(/[\\/]/).filter(Boolean).pop()
        || 'project';
      const locale = input.locale?.toLowerCase().startsWith('en') ? 'en' : 'id';
      const now = new Date().toISOString();
      const initial = publish({
        id: randomUUID(),
        projectId: input.projectId,
        projectName,
        projectPath: project.project_path,
        provider: input.provider,
        model: input.model,
        status: 'running',
        summary: null,
        divisions: [],
        steps: [],
        stepCount: 0,
        sessionId: null,
        error: null,
        createdAt: now,
        updatedAt: now,
        expiresAt: Number.POSITIVE_INFINITY,
      });

      const current = () => analyses.get(initial.id);
      /** Applies a change unless the analysis was cancelled or dismissed meanwhile. */
      const update = (change: (analysis: StoredAnalysis) => StoredAnalysis) => {
        const analysis = current();
        if (analysis && analysis.status === 'running') {
          publish(change(analysis));
        }
      };

      void dependencies.runner.runTurn({
        sessionId: null,
        sessionTitle: locale === 'en' ? `Workspace · analyse ${projectName}` : `Workspace · analisis ${projectName}`,
        projectPath: project.project_path,
        provider: input.provider,
        model: input.model,
        prompt: buildAppAnalysisPrompt({ locale, projectName }),
        permissionMode: 'default',
        allowedTools: READ_ONLY_TOOLS,
        userId: input.userId,
        isCancelled: () => current()?.status !== 'running',
        onSessionReady: (sessionId) => {
          update((analysis) => ({ ...analysis, sessionId }));
        },
        onEvent: (event) => {
          const entry = toOfficeLogEntry(event);
          // The final JSON answer and the closing marker are not progress.
          if (!entry || entry.type === 'done' || (entry.type === 'text' && entry.text.trimStart().startsWith('```'))) {
            return;
          }
          update((analysis) => ({
            ...analysis,
            steps: [...analysis.steps, entry].slice(-MAX_STEPS),
            stepCount: analysis.stepCount + 1,
          }));
        },
      }).then((turn) => {
        const answer = turn.lastText || turn.text;
        const parsed = answer ? parseAppAnalysis(answer) : null;
        update((analysis) => (parsed?.ok
          ? {
            ...analysis,
            status: 'done',
            summary: parsed.value.summary || null,
            divisions: parsed.value.divisions,
            expiresAt: Date.now() + ANALYSIS_TTL_MS,
          }
          : {
            ...analysis,
            status: 'failed',
            error: turn.error || (parsed && !parsed.ok ? parsed.error : 'The analysis gave no answer.'),
            expiresAt: Date.now() + ANALYSIS_TTL_MS,
          }));
      }).catch((error: unknown) => {
        update((analysis) => ({
          ...analysis,
          status: 'failed',
          error: error instanceof Error ? error.message : String(error),
          expiresAt: Date.now() + ANALYSIS_TTL_MS,
        }));
      });

      return initial;
    },

    get(analysisId) {
      return toVisible(requireAnalysis(analysisId));
    },

    list() {
      prune();
      return [...analyses.values()]
        .filter((analysis) => analysis.status === 'running' || !officesDb.getOfficeByProjectPath(analysis.projectPath))
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
        .map(toVisible);
    },

    async cancel(analysisId) {
      const analysis = requireAnalysis(analysisId);
      if (analysis.status !== 'running') {
        return toVisible(analysis);
      }
      const cancelled = publish({ ...analysis, status: 'cancelled', expiresAt: Date.now() + ANALYSIS_TTL_MS });
      if (analysis.sessionId) {
        await dependencies.runner.abort(analysis.provider, analysis.sessionId).catch(() => {});
      }
      return cancelled;
    },

    dismiss(analysisId) {
      const analysis = requireAnalysis(analysisId);
      if (analysis.status === 'running') {
        throw new AppError('Cancel the analysis before dismissing it.', { code: 'OFFICE_ANALYSIS_RUNNING', statusCode: 409 });
      }
      analyses.delete(analysisId);
      broadcastOfficeAnalysis(toVisible(analysis), true);
    },
  };
}
