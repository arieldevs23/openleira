import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  closeConnection,
  initializeDatabase,
  officeCasesDb,
  officesDb,
  projectsDb,
} from '@/modules/database/index.js';
import type {
  AgentTurnRequest,
  AgentTurnResult,
  OfficeAgentRunner,
} from '@/modules/office/services/office-agent-runner.service.js';
import { createOfficeOrchestrator } from '@/modules/office/services/office-orchestrator.service.js';
import { officeService } from '@/modules/office/services/office.service.js';
import { connectedClients } from '@/modules/websocket/index.js';
import type { OfficeCase, OfficeSnapshot } from '@/shared/types.js';
import { AppError } from '@/shared/utils.js';

type TurnKind = 'plan' | 'checkpoint' | 'final' | 'task' | 'revision' | 'audit' | 'retry';

type RecordedTurn = { kind: TurnKind; request: AgentTurnRequest; ref: string | null };

/** Classifies a prompt by the section markers the prompt builders write. */
function classify(prompt: string): TurnKind {
  if (prompt.includes('## Divisions you can assign work to')) return 'plan';
  if (prompt.includes('## Office update')) return 'checkpoint';
  if (prompt.includes('## All tasks have settled')) return 'final';
  if (prompt.includes('## Task to audit')) return 'audit';
  if (prompt.includes('rejected your work')) return 'revision';
  if (prompt.includes('could not be used')) return 'retry';
  return 'task';
}

const readRef = (prompt: string): string | null => (
  /## (?:Your task|Task to audit) \((T\d+)/.exec(prompt)?.[1] ?? null
);

type Script = (turn: RecordedTurn, history: RecordedTurn[]) => Partial<AgentTurnResult> | Promise<Partial<AgentTurnResult>>;

/**
 * A runner that answers from a script instead of a provider. It records every
 * turn and the peak number of task/audit turns in flight at once.
 */
function createScriptedRunner(script: Script) {
  const turns: RecordedTurn[] = [];
  const aborted: string[] = [];
  let sessionCounter = 0;
  let inFlight = 0;
  let peakInFlight = 0;

  const runner: OfficeAgentRunner = {
    async runTurn(request) {
      const sessionId = request.sessionId ?? `session-${++sessionCounter}`;
      request.onSessionReady?.(sessionId);
      if (request.isCancelled?.()) {
        return { sessionId, text: '', lastText: '', failed: false, error: null, aborted: true };
      }
      const turn: RecordedTurn = { kind: classify(request.prompt), request: { ...request, sessionId }, ref: readRef(request.prompt) };
      turns.push(turn);
      const isWork = turn.kind === 'task' || turn.kind === 'revision' || turn.kind === 'audit';
      if (isWork) {
        inFlight += 1;
        peakInFlight = Math.max(peakInFlight, inFlight);
      }
      try {
        await new Promise((resolve) => setTimeout(resolve, 2));
        const answer = await script(turn, turns);
        const answerText = answer.text ?? '';
        return {
          sessionId,
          text: answerText,
          lastText: answer.lastText ?? answerText,
          failed: answer.failed ?? false,
          error: answer.error ?? null,
          aborted: answer.aborted ?? false,
        };
      } finally {
        if (isWork) {
          inFlight -= 1;
        }
      }
    },
    async abort(_provider, sessionId) {
      aborted.push(sessionId);
    },
  };

  return { runner, turns, aborted, peak: () => peakInFlight };
}

const json = (value: unknown): string => `\`\`\`json\n${JSON.stringify(value)}\n\`\`\``;

const PLAN = json({
  summary: 'backend, then frontend; docs in parallel',
  tasks: [
    { id: 'T1', division_slug: 'backend', title: 'API', instruction: 'Add the endpoint', depends_on: [] },
    { id: 'T2', division_slug: 'frontend', title: 'Form', instruction: 'Use the endpoint', depends_on: ['T1'] },
    { id: 'T3', division_slug: 'docs', title: 'Docs', instruction: 'Document it', depends_on: [] },
  ],
});

const PASS = json({ pass: true, notes: 'checked', fixes: [] });
const FAIL = json({ pass: false, notes: 'missing test', fixes: ['add a test'] });

async function withOffice(run: (snapshot: OfficeSnapshot) => Promise<void>): Promise<void> {
  const previousDatabasePath = process.env.DATABASE_PATH;
  const directory = await mkdtemp(path.join(tmpdir(), 'office-orchestrator-'));
  closeConnection();
  process.env.DATABASE_PATH = path.join(directory, 'auth.db');
  await initializeDatabase();

  try {
    const { project } = projectsDb.createProjectPath(path.join(directory, 'project'));
    assert.ok(project);
    const snapshot = officeService.createOffice({ projectId: project.project_id, locale: 'en' });
    for (const division of snapshot.divisions) {
      officesDb.updateAgent(division.agent.id, { provider: 'claude', model: 'sonnet' });
    }
    await run(officeService.getSnapshot(snapshot.office.id));
    // Let the last scheduled tick of the case run against this database
    // before it is closed underneath it.
    await new Promise((resolve) => setTimeout(resolve, 30));
  } finally {
    connectedClients.clear();
    closeConnection();
    if (previousDatabasePath === undefined) {
      delete process.env.DATABASE_PATH;
    } else {
      process.env.DATABASE_PATH = previousDatabasePath;
    }
    await rm(directory, { recursive: true, force: true });
  }
}

/** Lets the event loop run until the case satisfies `done`, or fails the test. */
async function waitFor(caseId: string, done: (caseItem: OfficeCase) => boolean): Promise<OfficeCase> {
  for (let attempt = 0; attempt < 2000; attempt += 1) {
    const caseItem = officeCasesDb.getCase(caseId);
    if (caseItem && done(caseItem)) {
      return caseItem;
    }
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
  throw new Error(`Case ${caseId} never reached the expected state: ${JSON.stringify(officeCasesDb.getCase(caseId))}`);
}

const isFinished = (caseItem: OfficeCase) => caseItem.status === 'done' || caseItem.status === 'failed';

test('a case runs plan → tasks by dependency → audit → final summary, streaming updates', async () => {
  await withOffice(async ({ office }) => {
    const frames: Array<Record<string, unknown>> = [];
    connectedClients.add({ readyState: 1, send: (data: string) => frames.push(JSON.parse(data)) } as never);

    const doneWhenStarted = new Map<string, string[]>();
    const { runner, turns, peak } = createScriptedRunner((turn) => {
      if (turn.kind === 'plan') return { text: PLAN };
      if (turn.kind === 'task') {
        const caseTasks = officeCasesDb.listTasks(officeCasesDb.listCases(office.id)[0].id);
        doneWhenStarted.set(turn.ref ?? '', caseTasks.filter((task) => task.status === 'done').map((task) => task.ref));
        return { text: `working...\n\n## Summary\nresult of ${turn.ref}` };
      }
      if (turn.kind === 'audit') return { text: PASS };
      if (turn.kind === 'final') return { text: 'All three tasks are done. Check the endpoint and the docs.' };
      throw new Error(`unexpected turn ${turn.kind}`);
    });
    const orchestrator = createOfficeOrchestrator({ runner, listSkills: async () => [] });

    const created = officeService.createCase(office.id, { title: 'Login', description: 'Add login', createdBy: '7' });
    orchestrator.startCase(office.id, created.id);
    const finished = await waitFor(created.id, isFinished);

    assert.equal(finished.status, 'done');
    assert.equal(finished.finalSummary, 'All three tasks are done. Check the endpoint and the docs.');
    assert.equal(finished.coordinatorBusy, false);

    const tasks = officeCasesDb.listTasks(created.id);
    assert.deepEqual(tasks.map((task) => [task.ref, task.status]), [['T1', 'done'], ['T2', 'done'], ['T3', 'done']]);
    assert.equal(tasks[0].resultSummary, 'result of T1');
    assert.ok(tasks.every((task) => task.sessionId && task.auditSessionId));

    // T2 depends on T1: it only started after T1 passed its audit, and it was
    // handed T1's result through the coordinator.
    assert.ok(doneWhenStarted.get('T2')?.includes('T1'));
    const t2Prompt = turns.find((turn) => turn.kind === 'task' && turn.ref === 'T2')?.request.prompt ?? '';
    assert.match(t2Prompt, /Results from other divisions[\s\S]*result of T1/);
    assert.ok(peak() <= office.maxParallel, `at most ${office.maxParallel} sessions ran at once`);

    // The coordinator kept one session across its plan and final turns.
    const coordinatorSessions = new Set(turns.filter((turn) => turn.kind === 'plan' || turn.kind === 'final')
      .map((turn) => turn.request.sessionId));
    assert.equal(coordinatorSessions.size, 1);
    assert.equal(turns.find((turn) => turn.kind === 'task')?.request.permissionMode, 'bypassPermissions');

    const kinds = officeCasesDb.listMessages(created.id).map((message) => message.kind);
    for (const kind of ['assign', 'result', 'audit_pass', 'note'] as const) {
      assert.ok(kinds.includes(kind), `message bus has ${kind}`);
    }
    assert.ok(frames.some((frame) => frame.kind === 'office:update'));
  });
});

test('a new case is planned with the workspace folder and what earlier cases did', async () => {
  await withOffice(async ({ office }) => {
    const { runner, turns } = createScriptedRunner((turn) => {
      if (turn.kind === 'plan') return { text: PLAN };
      if (turn.kind === 'task') return { text: `## Summary\nresult of ${turn.ref}` };
      if (turn.kind === 'audit') return { text: PASS };
      if (turn.kind === 'final') return { text: 'Calculator built in calculator/index.html.' };
      throw new Error(`unexpected turn ${turn.kind}`);
    });
    const orchestrator = createOfficeOrchestrator({ runner, listSkills: async () => [] });

    const first = officeService.createCase(office.id, { title: 'Kalkulator', description: 'buat kalkulator simple', createdBy: null });
    orchestrator.startCase(office.id, first.id);
    await waitFor(first.id, isFinished);
    const [firstTask] = officeCasesDb.listTasks(first.id);
    officeCasesDb.updateTask(firstTask.id, { changedFiles: ['calculator/index.html', 'calculator/script.js'] });

    const second = officeService.createCase(office.id, { title: 'tambahin fitur', description: 'fitur kaya iphone', createdBy: null });
    orchestrator.startCase(office.id, second.id);
    await waitFor(second.id, isFinished);

    const plans = turns.filter((turn) => turn.kind === 'plan').map((turn) => turn.request.prompt);
    assert.equal(plans.length, 2);
    assert.match(plans[0], new RegExp(`Folder \\(your working directory\\): ${office.projectPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
    assert.doesNotMatch(plans[0], /Earlier cases in this workspace/, 'the first case has no history');
    assert.match(plans[1], /Earlier cases in this workspace[\s\S]*"Kalkulator" \(done\)/);
    assert.match(plans[1], /Result: Calculator built in calculator\/index\.html\./);
    assert.match(plans[1], /Files changed: calculator\/index\.html, calculator\/script\.js/);
    assert.match(plans[1], /Do not ask the user which project or app they mean/);
  });
});

test('a quick task goes straight to one team: no plan, no audit, its result is the summary', async () => {
  await withOffice(async ({ office }) => {
    const { runner, turns } = createScriptedRunner((turn) => {
      if (turn.kind === 'task') return { text: 'Changed the button.\n\n## Summary\nButton is blue now.' };
      throw new Error(`unexpected turn ${turn.kind}`);
    });
    const orchestrator = createOfficeOrchestrator({ runner, listSkills: async () => [] });
    const frontend = officesDb.listDivisions(office.id).find((division) => division.slug === 'frontend');
    assert.ok(frontend);

    const created = officeService.createCase(office.id, {
      title: 'Blue button', description: 'make the submit button blue', createdBy: null, quickDivisionId: frontend.id,
    });
    assert.equal(created.quickDivisionId, frontend.id);
    orchestrator.startCase(office.id, created.id);
    const finished = await waitFor(created.id, isFinished);

    assert.equal(finished.status, 'done');
    assert.equal(finished.finalSummary, 'Button is blue now.');
    assert.deepEqual(turns.map((turn) => turn.kind), ['task'], 'only the one agent ran');
    assert.match(turns[0].request.prompt, /make the submit button blue/);
    const [task] = officeCasesDb.listTasks(created.id);
    assert.equal(task.divisionId, frontend.id);
    assert.equal(task.status, 'done');

    assert.throws(() => orchestrator.postNote(office.id, created.id, 'hi'), /finished|quick task/);
    const draft = officeService.createCase(office.id, { title: 'x', createdBy: null, quickDivisionId: frontend.id });
    assert.throws(() => orchestrator.postNote(office.id, draft.id, 'hi'), /quick task/);
    const coordinator = officesDb.listDivisions(office.id).find((division) => division.isCoordinator);
    assert.throws(
      () => officeService.createCase(office.id, { title: 'x', createdBy: null, quickDivisionId: coordinator?.id }),
      /working team/,
    );
  });
});

test('a failed audit re-runs the task in its session with the notes, and passes on the retry', async () => {
  await withOffice(async ({ office }) => {
    let audits = 0;
    const { runner, turns } = createScriptedRunner((turn) => {
      if (turn.kind === 'plan') {
        return { text: json({ tasks: [{ division_slug: 'backend', title: 'API', instruction: 'Add it' }] }) };
      }
      if (turn.kind === 'task' || turn.kind === 'revision') return { text: '## Summary\ndone' };
      if (turn.kind === 'audit') return { text: ++audits === 1 ? FAIL : PASS };
      return { text: 'final report for the user' };
    });
    const orchestrator = createOfficeOrchestrator({ runner, listSkills: async () => [] });
    const created = officeService.createCase(office.id, { title: 'x', createdBy: null });
    orchestrator.startCase(office.id, created.id);
    const finished = await waitFor(created.id, isFinished);

    assert.equal(finished.status, 'done');
    const [task] = officeCasesDb.listTasks(created.id);
    assert.equal(task.attempts, 1);
    assert.match(task.instruction, /\[audit #1\]\nmissing test\n- add a test/);

    const work = turns.filter((turn) => turn.kind === 'task' || turn.kind === 'revision');
    assert.deepEqual(work.map((turn) => turn.kind), ['task', 'revision']);
    assert.equal(work[0].request.sessionId, work[1].request.sessionId, 'the revision continues the same session');
    assert.match(work[1].request.prompt, /add a test/);
    assert.deepEqual(
      officeCasesDb.listMessages(created.id).filter((message) => message.kind.startsWith('audit')).map((message) => message.kind),
      ['audit_fail', 'audit_pass'],
    );
  });
});

test('a third failed audit fails the task, blocks its dependants and tells the coordinator', async () => {
  await withOffice(async ({ office }) => {
    const { runner, turns } = createScriptedRunner((turn) => {
      if (turn.kind === 'plan') {
        return {
          text: json({
            tasks: [
              { id: 'T1', division_slug: 'backend', title: 'API', instruction: 'Add it' },
              { id: 'T2', division_slug: 'frontend', title: 'UI', instruction: 'Use it', depends_on: ['T1'] },
            ],
          }),
        };
      }
      if (turn.kind === 'task' || turn.kind === 'revision') return { text: '## Summary\ntried' };
      if (turn.kind === 'audit') return { text: FAIL };
      if (turn.kind === 'checkpoint') return { text: json({ reply: 'the API keeps failing its audit', tasks: [] }) };
      return { text: 'final: the API task failed its audit three times' };
    });
    const orchestrator = createOfficeOrchestrator({ runner, listSkills: async () => [] });
    const created = officeService.createCase(office.id, { title: 'x', createdBy: null });
    orchestrator.startCase(office.id, created.id);
    const finished = await waitFor(created.id, isFinished);

    assert.equal(finished.status, 'failed');
    const [api, ui] = officeCasesDb.listTasks(created.id);
    assert.equal(api.status, 'failed');
    assert.equal(api.attempts, 3);
    assert.equal(ui.status, 'blocked');
    assert.equal(turns.filter((turn) => turn.kind === 'audit').length, 3);

    const checkpoint = turns.find((turn) => turn.kind === 'checkpoint');
    assert.ok(checkpoint, 'the coordinator got a check-in turn about the failure');
    assert.match(checkpoint.request.prompt, /T1 API/);
    assert.ok(officeCasesDb.listMessages(created.id).some((message) => message.payload.type === 'task_failed'));
  });
});

test('the coordinator can replace a failed task and unblock its dependants', async () => {
  await withOffice(async ({ office }) => {
    const { runner } = createScriptedRunner((turn) => {
      if (turn.kind === 'plan') {
        return {
          text: json({
            tasks: [
              { id: 'T1', division_slug: 'backend', title: 'API', instruction: 'Add it' },
              { id: 'T2', division_slug: 'frontend', title: 'UI', instruction: 'Use it', depends_on: ['T1'] },
            ],
          }),
        };
      }
      if (turn.kind === 'task' && turn.ref === 'T1') return { failed: true, error: 'process exited 1' };
      if (turn.kind === 'task') return { text: '## Summary\nok' };
      if (turn.kind === 'audit') return { text: PASS };
      if (turn.kind === 'checkpoint') {
        return { text: json({ reply: 'retrying', tasks: [{ id: 'T3', division_slug: 'backend', title: 'API again', instruction: 'retry', replaces: 'T1' }] }) };
      }
      return { text: 'final report: replaced the crashed API task' };
    });
    const orchestrator = createOfficeOrchestrator({ runner, listSkills: async () => [] });
    const created = officeService.createCase(office.id, { title: 'x', createdBy: null });
    orchestrator.startCase(office.id, created.id);
    const finished = await waitFor(created.id, isFinished);

    const tasks = officeCasesDb.listTasks(created.id);
    const byRef = new Map(tasks.map((task) => [task.ref, task]));
    assert.equal(byRef.get('T1')?.status, 'failed');
    assert.match(byRef.get('T1')?.error ?? '', /process exited 1/);
    assert.equal(byRef.get('T3')?.parentTaskId, byRef.get('T1')?.id);
    assert.equal(byRef.get('T2')?.status, 'done');
    assert.deepEqual(byRef.get('T2')?.dependsOn, [byRef.get('T3')?.id]);
    assert.equal(finished.status, 'done', 'a failed task that was replaced does not fail the case');
  });
});

test('an invalid plan is retried once with stricter wording, then fails the case clearly', async () => {
  await withOffice(async ({ office }) => {
    const { runner, turns } = createScriptedRunner(() => ({ text: 'I think we should do backend work first.' }));
    const orchestrator = createOfficeOrchestrator({ runner, listSkills: async () => [] });
    const created = officeService.createCase(office.id, { title: 'x', createdBy: null });
    orchestrator.startCase(office.id, created.id);
    const finished = await waitFor(created.id, isFinished);

    assert.equal(finished.status, 'failed');
    assert.match(finished.error ?? '', /still invalid after asking again/);
    assert.deepEqual(turns.map((turn) => turn.kind), ['plan', 'retry']);
    assert.equal(turns[0].request.sessionId, turns[1].request.sessionId);
    assert.equal(officeCasesDb.listTasks(created.id).length, 0);
  });
});

test('a note from the user reaches the coordinator on its next turn', async () => {
  await withOffice(async ({ office }) => {
    let releaseTask: () => void = () => {};
    const taskGate = new Promise<void>((resolve) => { releaseTask = resolve; });
    const { runner, turns } = createScriptedRunner(async (turn) => {
      if (turn.kind === 'plan') return { text: json({ tasks: [{ division_slug: 'docs', title: 'Docs', instruction: 'Write' }] }) };
      if (turn.kind === 'task') {
        await taskGate;
        return { text: '## Summary\nwritten' };
      }
      if (turn.kind === 'audit') return { text: PASS };
      if (turn.kind === 'checkpoint') return { text: json({ reply: 'noted, keeping it short', tasks: [] }) };
      return { text: 'final report for the user' };
    });
    const orchestrator = createOfficeOrchestrator({ runner, listSkills: async () => [] });
    const created = officeService.createCase(office.id, { title: 'x', createdBy: null });
    orchestrator.startCase(office.id, created.id);
    await waitFor(created.id, (caseItem) => caseItem.phase === 'executing');

    orchestrator.postNote(office.id, created.id, 'please keep the docs short');
    await waitFor(created.id, () => turns.some((turn) => turn.kind === 'checkpoint'));
    releaseTask();
    const finished = await waitFor(created.id, isFinished);

    assert.equal(finished.status, 'done');
    const checkpoint = turns.find((turn) => turn.kind === 'checkpoint');
    assert.match(checkpoint?.request.prompt ?? '', /please keep the docs short/);
    const replies = officeCasesDb.listMessages(created.id)
      .filter((message) => message.kind === 'note' && message.toDivisionId === null)
      .map((message) => message.payload.text);
    assert.ok(replies.includes('noted, keeping it short'));
  });
});

test('pausing stops new work, resuming continues, and cancelling aborts live sessions', async () => {
  await withOffice(async ({ office }) => {
    let releaseFirst: () => void = () => {};
    const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const { runner, turns, aborted } = createScriptedRunner(async (turn) => {
      if (turn.kind === 'plan') {
        return {
          text: json({
            tasks: [
              { id: 'T1', division_slug: 'backend', title: 'A', instruction: 'a' },
              { id: 'T2', division_slug: 'frontend', title: 'B', instruction: 'b', depends_on: ['T1'] },
            ],
          }),
        };
      }
      if (turn.kind === 'task' && turn.ref === 'T1') {
        await firstGate;
        return { text: '## Summary\na' };
      }
      if (turn.kind === 'task') {
        return new Promise(() => {}); // T2 hangs until the case is cancelled.
      }
      return { text: PASS };
    });
    const orchestrator = createOfficeOrchestrator({ runner, listSkills: async () => [] });
    const created = officeService.createCase(office.id, { title: 'x', createdBy: null });
    orchestrator.startCase(office.id, created.id);
    await waitFor(created.id, () => turns.some((turn) => turn.ref === 'T1'));

    const paused = orchestrator.pauseCase(office.id, created.id);
    assert.equal(paused.status, 'waiting_user');
    assert.equal(paused.waitingReason, 'paused');
    releaseFirst();
    // T1 still finishes and is recorded, but nothing new starts while paused.
    await waitFor(created.id, () => officeCasesDb.listTasks(created.id)[0].status === 'review');
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(turns.filter((turn) => turn.kind === 'audit').length, 0);

    orchestrator.resumeCase(office.id, created.id);
    await waitFor(created.id, () => turns.some((turn) => turn.ref === 'T2' && turn.kind === 'task'));

    const cancelled = await orchestrator.cancelCase(office.id, created.id);
    assert.equal(cancelled.status, 'failed');
    assert.match(cancelled.error ?? '', /cancelled/);
    const t2 = officeCasesDb.listTasks(created.id)[1];
    assert.equal(t2.status, 'failed');
    assert.deepEqual(aborted, [t2.sessionId]);
  });
});

test('a case cannot start while an enabled agent has no model', async () => {
  await withOffice(async ({ office, divisions }) => {
    const backend = divisions.find((division) => division.slug === 'backend');
    assert.ok(backend);
    officesDb.updateAgent(backend.agent.id, { provider: null, model: null });
    const { runner } = createScriptedRunner(() => ({ text: '' }));
    const orchestrator = createOfficeOrchestrator({ runner, listSkills: async () => [] });
    const created = officeService.createCase(office.id, { title: 'x', createdBy: null });

    assert.throws(() => orchestrator.startCase(office.id, created.id), (error: unknown) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.code, 'OFFICE_MODELS_MISSING');
      assert.deepEqual((error.details as { agents: Array<{ divisionName: string }> }).agents.map((agent) => agent.divisionName), ['Backend']);
      return true;
    });
    assert.equal(officeCasesDb.getCase(created.id)?.status, 'draft');

    // Disabling the agent is the other way out.
    officesDb.updateAgent(backend.agent.id, { enabled: false });
    assert.equal(orchestrator.startCase(office.id, created.id).status, 'running');
    await waitFor(created.id, isFinished);
  });
});

test('a restart parks running cases and re-queues their running tasks', async () => {
  await withOffice(async ({ office, divisions }) => {
    const backend = divisions.find((division) => division.slug === 'backend');
    assert.ok(backend);
    const created = officeService.createCase(office.id, { title: 'x', createdBy: null });
    officeCasesDb.updateCase(created.id, { status: 'running', phase: 'executing', coordinatorBusy: true });
    officeCasesDb.createTasks(created.id, [{
      id: 'task-1',
      divisionId: backend.id,
      parentTaskId: null,
      ref: 'T1',
      title: 'API',
      instruction: 'x',
      dependsOn: [],
      status: 'running',
    }]);
    officeCasesDb.updateTask('task-1', { sessionId: 'kept-session' });

    const { runner } = createScriptedRunner(() => ({ text: '' }));
    const orchestrator = createOfficeOrchestrator({ runner, listSkills: async () => [] });
    assert.equal(orchestrator.recoverInterruptedCases(), 1);

    const parked = officeCasesDb.getCase(created.id);
    assert.equal(parked?.status, 'waiting_user');
    assert.equal(parked?.waitingReason, 'interrupted');
    assert.equal(parked?.coordinatorBusy, false);
    const task = officeCasesDb.getTask('task-1');
    assert.equal(task?.status, 'queued');
    assert.equal(task?.sessionId, 'kept-session');
  });
});
