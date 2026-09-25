import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { closeConnection, initializeDatabase, projectsDb } from '@/modules/database/index.js';
import type { AgentTurnRequest, AgentTurnResult, OfficeAgentRunner } from '@/modules/office/services/office-agent-runner.service.js';
import { createOfficeAnalyzer } from '@/modules/office/services/office-analysis.service.js';
import { officeService } from '@/modules/office/services/office.service.js';
import type { NormalizedMessage } from '@/shared/types.js';

async function withProject(run: (projectId: string) => Promise<void>): Promise<void> {
  const previousDatabasePath = process.env.DATABASE_PATH;
  const directory = await mkdtemp(path.join(tmpdir(), 'office-analysis-'));
  closeConnection();
  process.env.DATABASE_PATH = path.join(directory, 'auth.db');
  await initializeDatabase();
  try {
    const { project } = projectsDb.createProjectPath(path.join(directory, 'shop'));
    assert.ok(project);
    await run(project.project_id);
  } finally {
    closeConnection();
    if (previousDatabasePath === undefined) {
      delete process.env.DATABASE_PATH;
    } else {
      process.env.DATABASE_PATH = previousDatabasePath;
    }
    await rm(directory, { recursive: true, force: true });
  }
}

const toolEvent = (id: string, toolName: string, filePath: string) => ({
  id, sessionId: 'analysis-session', provider: 'claude', kind: 'tool_use', toolName, toolInput: { file_path: filePath },
  timestamp: '2026-09-25T10:00:00.000Z',
}) as unknown as NormalizedMessage;

/**
 * A runner that reports two tool steps, then answers with the given text.
 * `hold` keeps the turn open until released, to look at it mid-run.
 */
function scriptedRunner(
  answer: Partial<AgentTurnResult>,
  requests: AgentTurnRequest[],
  options: { hold?: Promise<void>; aborted?: string[] } = {},
): OfficeAgentRunner {
  return {
    async runTurn(request) {
      requests.push(request);
      request.onSessionReady?.('analysis-session');
      request.onEvent?.(toolEvent('e1', 'Read', 'README.md'));
      request.onEvent?.(toolEvent('e2', 'Glob', 'src/**'));
      await (options.hold ?? new Promise((resolve) => setImmediate(resolve)));
      return { sessionId: 'analysis-session', text: '', lastText: '', failed: false, error: null, aborted: false, ...answer };
    },
    async abort(_provider, sessionId) {
      options.aborted?.push(sessionId);
    },
  };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

test('an analysis reads the app read-only and proposes divisions for review', async () => {
  await withProject(async (projectId) => {
    const requests: AgentTurnRequest[] = [];
    const answer = [
      'Looked around.',
      '```json',
      JSON.stringify({
        summary: 'A Next.js shop.',
        divisions: [
          { name: 'Storefront', slug: 'storefront', description: 'pages', color: '#123456', agent_name: 'Rina', role_prompt: 'owns app/' },
          { name: 'Coordinator', role_prompt: 'dropped: the workspace has one' },
          { name: 'API', role_prompt: 'owns app/api' },
        ],
      }),
      '```',
    ].join('\n');
    const analyzer = createOfficeAnalyzer({ runner: scriptedRunner({ text: answer, lastText: answer }, requests) });

    const started = analyzer.start({ projectId, provider: 'claude', model: 'sonnet', locale: 'en', userId: '1' });
    assert.equal(started.status, 'running');
    assert.equal(analyzer.start({ projectId, provider: 'claude', model: 'sonnet', locale: 'en', userId: '1' }).id, started.id,
      'a second start while one runs returns the running one');
    await settle();

    const done = analyzer.get(started.id);
    assert.equal(done.status, 'done');
    assert.equal(done.projectName, 'shop');
    assert.equal(done.stepCount, 2, 'every tool step is reported as progress');
    assert.deepEqual(done.steps.map((step) => step.toolName), ['Read', 'Glob']);
    assert.deepEqual(analyzer.list().map((analysis) => analysis.id), [started.id], 'a finished analysis waits for review');
    assert.equal(done.summary, 'A Next.js shop.');
    assert.equal(done.sessionId, 'analysis-session');
    assert.deepEqual(done.divisions.map((division) => [division.slug, division.agentName]), [['storefront', 'Rina'], ['api', 'API']]);

    assert.equal(requests.length, 1);
    assert.deepEqual(requests[0].allowedTools, ['Read', 'Glob', 'Grep']);
    assert.equal(requests[0].permissionMode, 'default');

    // The reviewed proposal becomes the workspace; a folder with a workspace cannot be analysed again.
    officeService.createOffice({ projectId, locale: 'en', divisions: done.divisions, appSummary: done.summary });
    assert.deepEqual(analyzer.list(), [], 'once the folder has a workspace the analysis is no longer offered');
    assert.throws(() => analyzer.start({ projectId, provider: 'claude', model: 'sonnet', locale: 'en', userId: '1' }), /already has a workspace/);
  });
});

test('an analysis without usable JSON fails with the reason', async () => {
  await withProject(async (projectId) => {
    const analyzer = createOfficeAnalyzer({ runner: scriptedRunner({ text: 'no idea', lastText: 'no idea' }, []) });
    const started = analyzer.start({ projectId, provider: 'claude', model: 'sonnet', locale: 'id', userId: null });
    await settle();
    const failed = analyzer.get(started.id);
    assert.equal(failed.status, 'failed');
    assert.match(failed.error ?? '', /No JSON object/);
    assert.throws(() => analyzer.get('missing'), /expired/);
  });
});

test('an analysis keeps running on its own, can be cancelled, and a finished one can be dismissed', async () => {
  await withProject(async (projectId) => {
    let release: () => void = () => {};
    const hold = new Promise<void>((resolve) => { release = resolve; });
    const aborted: string[] = [];
    const answer = '```json\n{"summary":"s","divisions":[{"name":"API"}]}\n```';
    const analyzer = createOfficeAnalyzer({ runner: scriptedRunner({ text: answer, lastText: answer }, [], { hold, aborted }) });

    const started = analyzer.start({ projectId, provider: 'claude', model: 'sonnet', locale: 'en', userId: null });
    await settle();
    const running = analyzer.list();
    assert.equal(running.length, 1);
    assert.equal(running[0].status, 'running');
    assert.equal(running[0].stepCount, 2, 'progress is visible while it runs');
    assert.throws(() => analyzer.dismiss(started.id), /Cancel the analysis/);

    const cancelled = await analyzer.cancel(started.id);
    assert.equal(cancelled.status, 'cancelled');
    assert.deepEqual(aborted, ['analysis-session']);

    // The turn finishing after the cancel does not bring the analysis back.
    release();
    await settle();
    assert.equal(analyzer.get(started.id).status, 'cancelled');

    analyzer.dismiss(started.id);
    assert.deepEqual(analyzer.list(), []);
    assert.throws(() => analyzer.get(started.id), /expired/);
  });
});
