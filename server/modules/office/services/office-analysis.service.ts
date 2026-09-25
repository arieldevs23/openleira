import { randomUUID } from 'node:crypto';

import { officesDb, projectsDb } from '@/modules/database/index.js';
import type { OfficeAgentRunner } from '@/modules/office/services/office-agent-runner.service.js';
import { broadcastOfficeAnalysis } from '@/modules/office/services/office-events.service.js';
import { parseAppAnalysis } from '@/modules/office/services/office-plan-parser.service.js';
import { buildAppAnalysisPrompt } from '@/modules/office/services/office-prompts.service.js';
import type { LLMProvider, OfficeAnalysis } from '@/shared/types.js';
import { AppError } from '@/shared/utils.js';

/** Finished analyses are kept this long for a page that reloads before the user reviews them. */
const ANALYSIS_TTL_MS = 60 * 60 * 1000;

/** The analysis only reads the repository; on Claude everything else is removed from its toolbox. */
const READ_ONLY_TOOLS = ['Read', 'Glob', 'Grep'];

/** Analysis runs the Office routes start and poll-free clients follow over `office:analysis`. */
export type OfficeAnalyzer = {
  start(input: {
    projectId: string;
    provider: LLMProvider;
    model: string;
    locale: string | null;
    userId: string | number | null;
  }): OfficeAnalysis;
  get(analysisId: string): OfficeAnalysis;
};

/**
 * "Analyse an existing app": one read-only agent turn in the app's folder that
 * summarises the app and proposes the divisions of its workspace. The turn is
 * a normal app session run by the shared runner; its result is held in memory
 * until the user reviews it and creates the workspace.
 */
export function createOfficeAnalyzer(dependencies: { runner: OfficeAgentRunner }): OfficeAnalyzer {
  const analyses = new Map<string, OfficeAnalysis & { expiresAt: number }>();

  const publish = (analysis: OfficeAnalysis & { expiresAt: number }) => {
    analyses.set(analysis.id, analysis);
    const { expiresAt: _expiresAt, ...visible } = analysis;
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
        const { expiresAt: _expiresAt, ...visible } = running;
        return visible;
      }

      const projectName = project.custom_project_name?.trim()
        || project.project_path.split(/[\\/]/).filter(Boolean).pop()
        || 'project';
      const locale = input.locale?.toLowerCase().startsWith('en') ? 'en' : 'id';
      const initial = publish({
        id: randomUUID(),
        projectId: input.projectId,
        status: 'running',
        summary: null,
        divisions: [],
        sessionId: null,
        error: null,
        createdAt: new Date().toISOString(),
        expiresAt: Number.POSITIVE_INFINITY,
      });

      const current = () => analyses.get(initial.id) as OfficeAnalysis & { expiresAt: number };
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
        onSessionReady: (sessionId) => {
          publish({ ...current(), sessionId });
        },
      }).then((turn) => {
        const answer = turn.lastText || turn.text;
        const parsed = answer ? parseAppAnalysis(answer) : null;
        if (parsed?.ok) {
          publish({
            ...current(),
            status: 'done',
            summary: parsed.value.summary || null,
            divisions: parsed.value.divisions,
            expiresAt: Date.now() + ANALYSIS_TTL_MS,
          });
          return;
        }
        publish({
          ...current(),
          status: 'failed',
          error: turn.error || (parsed && !parsed.ok ? parsed.error : 'The analysis gave no answer.'),
          expiresAt: Date.now() + ANALYSIS_TTL_MS,
        });
      }).catch((error: unknown) => {
        publish({
          ...current(),
          status: 'failed',
          error: error instanceof Error ? error.message : String(error),
          expiresAt: Date.now() + ANALYSIS_TTL_MS,
        });
      });

      return initial;
    },

    get(analysisId) {
      const analysis = analyses.get(analysisId);
      if (!analysis) {
        throw new AppError('Analysis not found; it may have expired.', { code: 'OFFICE_ANALYSIS_NOT_FOUND', statusCode: 404 });
      }
      const { expiresAt: _expiresAt, ...visible } = analysis;
      return visible;
    },
  };
}
