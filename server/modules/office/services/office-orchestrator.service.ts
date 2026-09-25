import { randomUUID } from 'node:crypto';

import { officeCasesDb, officesDb } from '@/modules/database/index.js';
import { providerSkillsService } from '@/modules/providers/index.js';
import type { AgentTurnResult, OfficeAgentRunner } from '@/modules/office/services/office-agent-runner.service.js';
import {
  broadcastOfficeLog,
  broadcastOfficeUpdate,
  toOfficeLogEntry,
} from '@/modules/office/services/office-events.service.js';
import {
  extractResultSummary,
  parseAuditVerdict,
  parseCoordinatorOutput,
} from '@/modules/office/services/office-plan-parser.service.js';
import type {
  AuditVerdict,
  ParsedCoordinatorOutput,
  ParsedPlanTask,
} from '@/modules/office/services/office-plan-parser.service.js';
import {
  buildAuditPrompt,
  buildAuditRetryPrompt,
  buildCoordinatorCheckpointPrompt,
  buildCoordinatorFinalPrompt,
  buildCoordinatorPlanPrompt,
  buildCoordinatorRetryPrompt,
  buildTaskPrompt,
  buildTaskRevisionPrompt,
} from '@/modules/office/services/office-prompts.service.js';
import type { PromptSkill } from '@/modules/office/services/office-prompts.service.js';
import {
  applyAuditVerdict,
  isCaseFullyResolved,
  MAX_AUDIT_RETRIES,
  planSchedulerStep,
} from '@/modules/office/services/office-scheduler.service.js';
import { officeService } from '@/modules/office/services/office.service.js';
import type {
  LLMProvider,
  Office,
  OfficeAgent,
  OfficeCase,
  OfficeDivision,
  OfficeMessage,
  OfficeMessageKind,
  OfficeTask,
} from '@/shared/types.js';
import { AppError } from '@/shared/utils.js';

const MAX_NOTE_LENGTH = 5000;
const MAX_SESSION_TITLE_LENGTH = 90;

/** User-facing texts the orchestrator writes into cases, tasks and the bus, per office locale. */
const TEXTS = {
  id: {
    coordinatorFailed: 'koordinator gagal jalan: {error}',
    coordinatorNotReady: 'agent koordinator belum punya model',
    planInvalid: 'rencana dari koordinator tetap tidak valid setelah diminta ulang: {error}',
    checkpointInvalid: 'balasan koordinator tidak bisa dibaca, pesannya dilewati: {error}',
    checkpointFailed: 'koordinator tidak bisa dihubungi, pesannya dilewati: {error}',
    taskCrashed: 'sesi agent berhenti dengan error: {error}',
    auditCrashed: 'sesi audit berhenti dengan error: {error}',
    auditInvalid: 'jawaban audit tidak bisa dibaca: {error}',
    auditExhausted: 'gagal audit {count} kali, jatah ulang sudah habis',
    dependencyFailed: 'ada dependensi yang gagal',
    divisionUnavailable: 'divisinya dihapus, agentnya dimatikan, atau belum punya model',
    cancelled: 'dibatalkan oleh user',
    someTasksFailed: 'selesai, tapi ada task yang gagal',
    auditSkipped: 'audit dimatikan, hasil langsung diterima',
  },
  en: {
    coordinatorFailed: 'the coordinator failed to run: {error}',
    coordinatorNotReady: 'the coordinator agent has no model yet',
    planInvalid: 'the coordinator plan was still invalid after asking again: {error}',
    checkpointInvalid: 'could not read the coordinator reply, the message was skipped: {error}',
    checkpointFailed: 'could not reach the coordinator, the message was skipped: {error}',
    taskCrashed: 'the agent session stopped with an error: {error}',
    auditCrashed: 'the audit session stopped with an error: {error}',
    auditInvalid: 'could not read the audit answer: {error}',
    auditExhausted: 'failed the audit {count} times, no retries left',
    dependencyFailed: 'a dependency failed',
    divisionUnavailable: 'the division was deleted, its agent is disabled, or it has no model',
    cancelled: 'cancelled by the user',
    someTasksFailed: 'finished, but some tasks failed',
    auditSkipped: 'audit is disabled, the result was accepted as is',
  },
} as const;

type TextKey = keyof typeof TEXTS.id;

const text = (locale: string, key: TextKey, params: Record<string, string | number> = {}): string => {
  const table = locale.toLowerCase().startsWith('en') ? TEXTS.en : TEXTS.id;
  return table[key].replace(/\{(\w+)\}/g, (_match, name: string) => String(params[name] ?? ''));
};

type RunKind = 'coordinator' | 'task' | 'audit';

/**
 * One provider turn in flight for a case. Kept in memory only: after a restart
 * there are no live runs, and recovery parks the case instead.
 */
type RunHandle = {
  kind: RunKind;
  taskId: string | null;
  provider: LLMProvider;
  sessionId: string | null;
  cancelled: boolean;
};

/** Everything a turn needs to know about its case, loaded fresh for each step. */
type CaseContext = {
  caseItem: OfficeCase;
  office: Office;
  divisions: OfficeDivision[];
  divisionsById: Map<string, OfficeDivision>;
  coordinator: OfficeDivision;
  audit: OfficeDivision | null;
  /** Enabled divisions the coordinator can hand work to. */
  workers: OfficeDivision[];
};

/** The orchestrator surface used by the Office routes and the server entrypoint. */
export type OfficeOrchestrator = {
  startCase(officeId: string, caseId: string): OfficeCase;
  pauseCase(officeId: string, caseId: string): OfficeCase;
  resumeCase(officeId: string, caseId: string): OfficeCase;
  cancelCase(officeId: string, caseId: string): Promise<OfficeCase>;
  postNote(officeId: string, caseId: string, noteText: string): OfficeMessage;
  recoverInterruptedCases(): number;
};

/** Failure reports travel as notes too; everything else addressed to the coordinator is the user's. */
const isFailureNote = (note: OfficeMessage): boolean => note.payload.type === 'task_failed';

const conflict = (message: string, code: string, details?: unknown): AppError =>
  new AppError(message, { code, statusCode: 409, details });

const clipTitle = (title: string): string => (
  title.length > MAX_SESSION_TITLE_LENGTH ? `${title.slice(0, MAX_SESSION_TITLE_LENGTH - 1)}…` : title
);

/** An agent that can run: enabled and with a model picked. */
const readyModel = (agent: OfficeAgent): { provider: LLMProvider; model: string } | null => (
  agent.enabled && agent.provider && agent.model ? { provider: agent.provider, model: agent.model } : null
);

/**
 * An allow-list without `Skill` would hide the skills the agent is meant to
 * use, so an agent with skills always gets it.
 */
const effectiveAllowedTools = (agent: OfficeAgent): string[] => (
  agent.allowedTools.length > 0 && agent.skills.length > 0 && !agent.allowedTools.includes('Skill')
    ? [...agent.allowedTools, 'Skill']
    : agent.allowedTools
);

/**
 * Creates the Kantor AI orchestrator.
 *
 * The flow per case: the coordinator plans (JSON) → tasks run as provider
 * sessions once their dependencies are done, at most `maxParallel` at a time →
 * each finished task is audited → a failed audit sends it back up to twice →
 * user notes and permanent failures give the coordinator a check-in turn →
 * once everything settles the coordinator writes the final summary.
 *
 * All state lives in the database; `tick` re-derives what to do from it after
 * every change, so the flow survives pauses, notes and restarts. Only the
 * in-flight provider turns are held in memory.
 */
export function createOfficeOrchestrator(dependencies: {
  runner: OfficeAgentRunner;
  /** Skill lookup; defaults to the providers module's skill discovery. */
  listSkills?: (provider: LLMProvider, projectPath: string) => Promise<PromptSkill[]>;
}): OfficeOrchestrator {
  const handlesByCase = new Map<string, Set<RunHandle>>();
  const pendingTicks = new Set<string>();

  const listSkills = dependencies.listSkills ?? (async (provider: LLMProvider, projectPath: string) => {
    const skills = await providerSkillsService.listProviderSkills(provider, { workspacePath: projectPath });
    return skills.map((skill) => ({ name: skill.name, description: skill.description, command: skill.command }));
  });

  // ----- persistence helpers that also broadcast -----

  const saveCase = (caseId: string, patch: Parameters<typeof officeCasesDb.updateCase>[1]): OfficeCase | null => {
    const updated = officeCasesDb.updateCase(caseId, patch);
    if (updated) {
      broadcastOfficeUpdate(updated.officeId, { entity: 'case', id: updated.id, case: updated });
    }
    return updated;
  };

  const saveTask = (
    officeId: string,
    taskId: string,
    patch: Parameters<typeof officeCasesDb.updateTask>[1],
  ): OfficeTask | null => {
    const updated = officeCasesDb.updateTask(taskId, patch);
    if (updated) {
      broadcastOfficeUpdate(officeId, { entity: 'task', task: updated });
    }
    return updated;
  };

  /**
   * Writes one message-bus row. Messages that need no reaction are stored as
   * already read; only notes addressed to the coordinator stay unread until
   * its next turn picks them up.
   */
  const postMessage = (
    officeId: string,
    input: {
      caseId: string;
      taskId?: string | null;
      fromDivisionId: string | null;
      toDivisionId: string | null;
      kind: OfficeMessageKind;
      payload: Record<string, unknown>;
    },
    options: { unread?: boolean } = {},
  ): OfficeMessage => {
    const message = officeCasesDb.addMessage(input);
    if (!options.unread) {
      officeCasesDb.markMessagesRead([message.id]);
    }
    broadcastOfficeUpdate(officeId, { entity: 'message', message });
    return message;
  };

  const loadContext = (caseId: string): CaseContext | null => {
    const caseItem = officeCasesDb.getCase(caseId);
    if (!caseItem) {
      return null;
    }
    const office = officesDb.getOfficeById(caseItem.officeId);
    if (!office) {
      return null;
    }
    const divisions = officesDb.listDivisions(office.id);
    const coordinator = divisions.find((division) => division.isCoordinator);
    if (!coordinator) {
      return null;
    }
    return {
      caseItem,
      office,
      divisions,
      divisionsById: new Map(divisions.map((division) => [division.id, division])),
      coordinator,
      audit: divisions.find((division) => division.isAudit) ?? null,
      workers: divisions.filter((division) => !division.isCoordinator && !division.isAudit && readyModel(division.agent)),
    };
  };

  // ----- in-flight run bookkeeping -----

  const handlesFor = (caseId: string): Set<RunHandle> => {
    let handles = handlesByCase.get(caseId);
    if (!handles) {
      handles = new Set();
      handlesByCase.set(caseId, handles);
    }
    return handles;
  };

  const registerHandle = (caseId: string, kind: RunKind, taskId: string | null, provider: LLMProvider): RunHandle => {
    const handle: RunHandle = { kind, taskId, provider, sessionId: null, cancelled: false };
    handlesFor(caseId).add(handle);
    return handle;
  };

  const releaseHandle = (caseId: string, handle: RunHandle): void => {
    const handles = handlesByCase.get(caseId);
    handles?.delete(handle);
    if (handles && handles.size === 0) {
      handlesByCase.delete(caseId);
    }
  };

  const hasCoordinatorRun = (caseId: string): boolean =>
    [...(handlesByCase.get(caseId) ?? [])].some((handle) => handle.kind === 'coordinator');

  /**
   * Re-evaluates a case on the next turn of the event loop. Every state change
   * funnels through here; the dedupe keeps a burst of changes to one pass and
   * keeps `tick` from ever re-entering itself.
   */
  const scheduleTick = (caseId: string): void => {
    if (pendingTicks.has(caseId)) {
      return;
    }
    pendingTicks.add(caseId);
    setImmediate(() => {
      pendingTicks.delete(caseId);
      tick(caseId);
    });
  };

  /**
   * Runs one agent turn and streams its transcript lines to the Office page.
   * The session id is recorded as soon as it exists so the UI can open the
   * session in chat while the turn is still running.
   */
  const runAgentTurn = async (
    context: CaseContext,
    handle: RunHandle,
    input: {
      division: OfficeDivision;
      sessionId: string | null;
      sessionTitle: string;
      prompt: string;
      onSessionReady: (sessionId: string) => void;
    },
  ): Promise<AgentTurnResult> => {
    const model = readyModel(input.division.agent);
    if (!model) {
      return {
        sessionId: input.sessionId ?? '',
        text: '',
        lastText: '',
        failed: true,
        error: text(context.office.locale, 'divisionUnavailable'),
        aborted: false,
      };
    }

    let logSessionId = input.sessionId ?? '';
    return dependencies.runner.runTurn({
      sessionId: input.sessionId,
      sessionTitle: clipTitle(input.sessionTitle),
      projectPath: context.office.projectPath,
      provider: model.provider,
      model: model.model,
      prompt: input.prompt,
      permissionMode: context.office.permissionMode,
      allowedTools: effectiveAllowedTools(input.division.agent),
      userId: context.caseItem.createdBy,
      isCancelled: () => handle.cancelled,
      onSessionReady: (sessionId) => {
        handle.sessionId = sessionId;
        logSessionId = sessionId;
        input.onSessionReady(sessionId);
      },
      onEvent: (event) => {
        const entry = toOfficeLogEntry(event);
        if (entry && logSessionId) {
          broadcastOfficeLog({
            officeId: context.office.id,
            caseId: context.caseItem.id,
            taskId: handle.taskId,
            role: handle.kind,
            logSessionId,
            entry,
          });
        }
      },
    });
  };

  const resolvePromptSkills = async (agent: OfficeAgent, projectPath: string): Promise<PromptSkill[]> => {
    if (agent.skills.length === 0 || !agent.provider) {
      return [];
    }
    try {
      const installed = await listSkills(agent.provider, projectPath);
      return agent.skills.map((name) => (
        installed.find((skill) => skill.name === name) ?? { name, description: '', command: `/${name}` }
      ));
    } catch (error) {
      console.warn('[Office] Could not list skills; using names only', error);
      return agent.skills.map((name) => ({ name, description: '', command: `/${name}` }));
    }
  };

  // ----- failure paths -----

  /** Tells the coordinator a task failed for good; its next check-in reacts. */
  const notifyCoordinatorOfFailure = (context: CaseContext, task: OfficeTask, error: string): void => {
    postMessage(context.office.id, {
      caseId: context.caseItem.id,
      taskId: task.id,
      fromDivisionId: task.divisionId,
      toDivisionId: context.coordinator.id,
      kind: 'note',
      payload: { type: 'task_failed', ref: task.ref, title: task.title, error },
    }, { unread: true });
  };

  const failTask = (context: CaseContext, taskId: string, error: string): void => {
    const task = saveTask(context.office.id, taskId, {
      status: 'failed',
      error,
      finishedAt: new Date().toISOString(),
    });
    if (task) {
      notifyCoordinatorOfFailure(context, task, error);
    }
  };

  const failCase = (caseId: string, error: string): void => {
    saveCase(caseId, {
      status: 'failed',
      error,
      phase: null,
      waitingReason: null,
      coordinatorBusy: false,
      finishedAt: new Date().toISOString(),
    });
  };

  // ----- coordinator turns -----

  /** Runs one coordinator turn in the case's single coordinator session. */
  const coordinatorTurn = async (context: CaseContext, handle: RunHandle, prompt: string): Promise<AgentTurnResult> => {
    const current = officeCasesDb.getCase(context.caseItem.id);
    return runAgentTurn(context, handle, {
      division: context.coordinator,
      sessionId: current?.coordinatorSessionId ?? null,
      sessionTitle: `${context.office.name} · ${context.coordinator.name} · ${context.caseItem.title}`,
      prompt,
      onSessionReady: (sessionId) => {
        if (current?.coordinatorSessionId !== sessionId) {
          saveCase(context.caseItem.id, { coordinatorSessionId: sessionId });
        }
      },
    });
  };

  /**
   * Asks the coordinator for JSON, and once more with stricter wording if the
   * first answer does not parse. Returns the parse result and whether the
   * turn crashed.
   */
  const coordinatorJsonTurn = async (
    context: CaseContext,
    handle: RunHandle,
    prompt: string,
    parse: (answer: string) => ReturnType<typeof parseCoordinatorOutput>,
    mode: 'plan' | 'checkpoint',
  ): Promise<{ output: ParsedCoordinatorOutput | null; error: string | null; crashed: boolean }> => {
    const parseTurn = (turn: AgentTurnResult) => {
      const fromLast = parse(turn.lastText);
      return fromLast.ok || !turn.text || turn.text === turn.lastText ? fromLast : parse(turn.text);
    };

    let turn = await coordinatorTurn(context, handle, prompt);
    if (handle.cancelled) {
      return { output: null, error: null, crashed: false };
    }
    if (turn.failed && !turn.text) {
      return { output: null, error: turn.error, crashed: true };
    }
    let parsed = parseTurn(turn);
    if (parsed.ok) {
      return { output: parsed.value, error: null, crashed: false };
    }

    turn = await coordinatorTurn(context, handle, buildCoordinatorRetryPrompt(parsed.error, mode));
    if (handle.cancelled) {
      return { output: null, error: null, crashed: false };
    }
    if (turn.failed && !turn.text) {
      return { output: null, error: turn.error, crashed: true };
    }
    parsed = parseTurn(turn);
    return parsed.ok
      ? { output: parsed.value, error: null, crashed: false }
      : { output: null, error: parsed.error, crashed: false };
  };

  /**
   * Turns parsed tasks into rows. Refs are resolved to ids; a task that
   * replaces a failed one takes over the dependants that were blocked by it.
   */
  const createTasks = (context: CaseContext, parsedTasks: ParsedPlanTask[]): void => {
    if (parsedTasks.length === 0) {
      return;
    }
    const existing = officeCasesDb.listTasks(context.caseItem.id);
    const idByRef = new Map(existing.map((task) => [task.ref, task.id]));
    const slugToDivision = new Map(context.workers.map((division) => [division.slug, division]));
    for (const parsed of parsedTasks) {
      idByRef.set(parsed.ref, randomUUID());
    }

    const created = officeCasesDb.createTasks(context.caseItem.id, parsedTasks.map((parsed) => ({
      id: idByRef.get(parsed.ref) as string,
      divisionId: (slugToDivision.get(parsed.divisionSlug) as OfficeDivision).id,
      parentTaskId: parsed.replaces ? idByRef.get(parsed.replaces) ?? null : null,
      ref: parsed.ref,
      title: parsed.title,
      instruction: parsed.instruction,
      dependsOn: parsed.dependsOn.map((ref) => idByRef.get(ref) as string),
      status: 'queued',
    })));
    for (const task of created) {
      broadcastOfficeUpdate(context.office.id, { entity: 'task', task });
    }

    for (const parsed of parsedTasks) {
      if (!parsed.replaces) {
        continue;
      }
      const replacedId = idByRef.get(parsed.replaces) as string;
      const replacementId = idByRef.get(parsed.ref) as string;
      for (const dependant of existing) {
        if (!dependant.dependsOn.includes(replacedId) || (dependant.status !== 'blocked' && dependant.status !== 'queued')) {
          continue;
        }
        saveTask(context.office.id, dependant.id, {
          dependsOn: dependant.dependsOn.map((id) => (id === replacedId ? replacementId : id)),
          status: 'queued',
          error: null,
        });
      }
    }
  };

  /** Posts the coordinator's reply/question and applies its new tasks. */
  const applyCoordinatorOutput = (context: CaseContext, output: ParsedCoordinatorOutput): void => {
    const caseId = context.caseItem.id;
    if (output.message) {
      postMessage(context.office.id, {
        caseId,
        fromDivisionId: context.coordinator.id,
        toDivisionId: null,
        kind: 'note',
        payload: { text: output.message },
      });
    }
    createTasks(context, output.tasks);
    if (output.question) {
      postMessage(context.office.id, {
        caseId,
        fromDivisionId: context.coordinator.id,
        toDivisionId: null,
        kind: 'question',
        payload: { text: output.question },
      });
      const current = officeCasesDb.getCase(caseId);
      // A question only parks a case that is still running; a pause or
      // cancel that happened during the turn wins.
      if (current?.status === 'running') {
        saveCase(caseId, { status: 'waiting_user', waitingReason: 'question' });
      }
    }
  };

  const runCoordinatorPlan = async (caseId: string, handle: RunHandle): Promise<void> => {
    const context = loadContext(caseId);
    if (!context) {
      return;
    }
    const notes = officeCasesDb.listUnreadNotes(caseId, context.coordinator.id);
    officeCasesDb.markMessagesRead(notes.map((note) => note.id));

    const skills = await resolvePromptSkills(context.coordinator.agent, context.office.projectPath);
    const prompt = buildCoordinatorPlanPrompt({
      locale: context.office.locale,
      coordinator: context.coordinator,
      caseItem: context.caseItem,
      workers: context.workers,
      notes: notes.filter((note) => !isFailureNote(note)),
      skills,
    });
    const allowedDivisionSlugs = context.workers.map((division) => division.slug);
    const result = await coordinatorJsonTurn(
      context,
      handle,
      prompt,
      (answer) => parseCoordinatorOutput(answer, { mode: 'plan', allowedDivisionSlugs }),
      'plan',
    );
    if (handle.cancelled) {
      return;
    }
    if (!result.output) {
      failCase(caseId, result.crashed
        ? text(context.office.locale, 'coordinatorFailed', { error: result.error ?? '' })
        : text(context.office.locale, 'planInvalid', { error: result.error ?? '' }));
      return;
    }

    applyCoordinatorOutput(context, result.output);
    if (result.output.tasks.length > 0) {
      saveCase(caseId, { phase: 'executing' });
    }
  };

  const runCoordinatorCheckpoint = async (caseId: string, handle: RunHandle, notes: OfficeMessage[]): Promise<void> => {
    const context = loadContext(caseId);
    if (!context) {
      return;
    }
    const tasks = officeCasesDb.listTasks(caseId);
    const prompt = buildCoordinatorCheckpointPrompt({
      locale: context.office.locale,
      tasks,
      divisionsById: context.divisionsById,
      workers: context.workers,
      userNotes: notes.filter((note) => !isFailureNote(note)),
      failureNotes: notes.filter(isFailureNote),
    });
    const allowedDivisionSlugs = context.workers.map((division) => division.slug);
    const result = await coordinatorJsonTurn(
      context,
      handle,
      prompt,
      (answer) => parseCoordinatorOutput(answer, {
        mode: 'checkpoint',
        allowedDivisionSlugs,
        existingRefs: tasks.map((task) => task.ref),
        failedRefs: tasks.filter((task) => task.status === 'failed').map((task) => task.ref),
      }),
      'checkpoint',
    );
    if (handle.cancelled) {
      return;
    }
    if (!result.output) {
      // A check-in that goes wrong must not sink the case; the work already
      // queued carries on and the final summary will report the failures.
      postMessage(context.office.id, {
        caseId,
        fromDivisionId: context.coordinator.id,
        toDivisionId: null,
        kind: 'note',
        payload: {
          text: text(context.office.locale, result.crashed ? 'checkpointFailed' : 'checkpointInvalid', {
            error: result.error ?? '',
          }),
          system: true,
        },
      });
      return;
    }
    applyCoordinatorOutput(context, result.output);
  };

  const runCoordinatorFinal = async (caseId: string, handle: RunHandle): Promise<void> => {
    const context = loadContext(caseId);
    if (!context) {
      return;
    }
    const notes = officeCasesDb.listUnreadNotes(caseId, context.coordinator.id);
    officeCasesDb.markMessagesRead(notes.map((note) => note.id));
    const tasks = officeCasesDb.listTasks(caseId);

    const turn = await coordinatorTurn(context, handle, buildCoordinatorFinalPrompt({
      locale: context.office.locale,
      tasks,
      divisionsById: context.divisionsById,
      userNotes: notes.filter((note) => !isFailureNote(note)),
    }));
    if (handle.cancelled) {
      return;
    }

    // The report is normally the last block; earlier blocks are the agent
    // thinking aloud while it checks the repository.
    const report = turn.lastText.length >= 40 ? turn.lastText : turn.text;
    const fallback = tasks
      .map((task) => `- ${task.ref} ${task.title}: ${task.status}${task.error ? ` (${task.error})` : ''}`)
      .join('\n');
    const summary = report.trim() || [
      turn.failed ? text(context.office.locale, 'coordinatorFailed', { error: turn.error ?? '' }) : '',
      fallback,
    ].filter(Boolean).join('\n\n');

    const resolved = isCaseFullyResolved(tasks);
    postMessage(context.office.id, {
      caseId,
      fromDivisionId: context.coordinator.id,
      toDivisionId: null,
      kind: 'note',
      payload: { text: summary, final: true },
    });
    saveCase(caseId, {
      status: resolved ? 'done' : 'failed',
      finalSummary: summary,
      error: resolved ? null : text(context.office.locale, 'someTasksFailed'),
      phase: null,
      waitingReason: null,
      finishedAt: new Date().toISOString(),
    });
  };

  const launchCoordinator = (
    context: CaseContext,
    kind: 'plan' | 'checkpoint' | 'final',
    notes: OfficeMessage[] = [],
  ): void => {
    const caseId = context.caseItem.id;
    const model = readyModel(context.coordinator.agent);
    if (!model) {
      failCase(caseId, text(context.office.locale, 'coordinatorNotReady'));
      return;
    }
    const handle = registerHandle(caseId, 'coordinator', null, model.provider);
    // Marked read now, synchronously, so the next tick cannot start a second
    // check-in for the same notes.
    officeCasesDb.markMessagesRead(notes.map((note) => note.id));
    saveCase(caseId, { coordinatorBusy: true });

    const run = kind === 'plan'
      ? runCoordinatorPlan(caseId, handle)
      : kind === 'checkpoint'
        ? runCoordinatorCheckpoint(caseId, handle, notes)
        : runCoordinatorFinal(caseId, handle);

    void run
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        console.error('[Office] Coordinator turn failed', { caseId, kind, error: message });
        if (!handle.cancelled && kind !== 'checkpoint') {
          failCase(caseId, text(context.office.locale, 'coordinatorFailed', { error: message }));
        }
      })
      .finally(() => {
        releaseHandle(caseId, handle);
        if (officeCasesDb.getCase(caseId)?.coordinatorBusy && !hasCoordinatorRun(caseId)) {
          saveCase(caseId, { coordinatorBusy: false });
        }
        scheduleTick(caseId);
      });
  };

  // ----- task and audit turns -----

  const runTask = async (caseId: string, taskId: string, handle: RunHandle): Promise<void> => {
    const context = loadContext(caseId);
    const task = officeCasesDb.getTask(taskId);
    const division = task?.divisionId ? context?.divisionsById.get(task.divisionId) : null;
    if (!context || !task || !division) {
      return;
    }

    const dependencyResults = task.dependsOn
      .map((dependencyId) => officeCasesDb.getTask(dependencyId))
      .filter((dependency): dependency is OfficeTask => dependency?.status === 'done')
      .map((dependency) => ({
        divisionName: (dependency.divisionId && context.divisionsById.get(dependency.divisionId)?.name) || '?',
        ref: dependency.ref,
        title: dependency.title,
        summary: dependency.resultSummary ?? '',
      }));
    const skills = await resolvePromptSkills(division.agent, context.office.projectPath);
    const isRevision = task.attempts > 0 && Boolean(task.sessionId);
    const prompt = isRevision
      ? buildTaskRevisionPrompt({ locale: context.office.locale, attempt: task.attempts, feedback: task.auditNotes ?? '' })
      : buildTaskPrompt({
        locale: context.office.locale,
        division,
        caseItem: context.caseItem,
        task,
        dependencyResults,
        skills,
        resumedAfterRestart: Boolean(task.sessionId),
      });

    const turn = await runAgentTurn(context, handle, {
      division,
      sessionId: task.sessionId,
      sessionTitle: `${context.office.name} · ${division.name} · ${task.ref} ${task.title}`,
      prompt,
      onSessionReady: (sessionId) => {
        if (task.sessionId !== sessionId) {
          saveTask(context.office.id, taskId, { sessionId });
        }
      },
    });
    if (handle.cancelled) {
      return;
    }
    if (turn.failed) {
      failTask(context, taskId, text(context.office.locale, 'taskCrashed', { error: turn.error ?? '' }));
      return;
    }

    const summary = extractResultSummary(turn.text);
    saveTask(context.office.id, taskId, { status: 'review', resultSummary: summary, error: null });
    postMessage(context.office.id, {
      caseId,
      taskId,
      fromDivisionId: division.id,
      toDivisionId: context.coordinator.id,
      kind: 'result',
      payload: { ref: task.ref, title: task.title, summary, attempt: task.attempts },
    });
  };

  const runAudit = async (caseId: string, taskId: string, handle: RunHandle): Promise<void> => {
    const context = loadContext(caseId);
    const task = officeCasesDb.getTask(taskId);
    if (!context || !task || !context.audit) {
      return;
    }
    const auditDivision = context.audit;
    const workerDivision = task.divisionId ? context.divisionsById.get(task.divisionId) ?? null : null;
    const skills = await resolvePromptSkills(auditDivision.agent, context.office.projectPath);
    const sessionTitle = `${context.office.name} · ${auditDivision.name} · ${task.ref} ${task.title}`;
    let auditSessionId = task.auditSessionId;
    const onSessionReady = (sessionId: string) => {
      if (auditSessionId !== sessionId) {
        auditSessionId = sessionId;
        saveTask(context.office.id, taskId, { auditSessionId: sessionId });
      }
    };

    let turn = await runAgentTurn(context, handle, {
      division: auditDivision,
      sessionId: auditSessionId,
      sessionTitle,
      prompt: buildAuditPrompt({
        locale: context.office.locale,
        auditDivision,
        workerDivision,
        caseItem: context.caseItem,
        task,
        skills,
      }),
      onSessionReady,
    });
    if (handle.cancelled) {
      return;
    }
    if (turn.failed) {
      failTask(context, taskId, text(context.office.locale, 'auditCrashed', { error: turn.error ?? '' }));
      return;
    }

    const parseTurn = (result: AgentTurnResult) => {
      const fromLast = parseAuditVerdict(result.lastText);
      return fromLast.ok ? fromLast : parseAuditVerdict(result.text);
    };
    let parsed = parseTurn(turn);
    if (!parsed.ok) {
      turn = await runAgentTurn(context, handle, {
        division: auditDivision,
        sessionId: auditSessionId,
        sessionTitle,
        prompt: buildAuditRetryPrompt(parsed.error),
        onSessionReady,
      });
      if (handle.cancelled) {
        return;
      }
      if (turn.failed) {
        failTask(context, taskId, text(context.office.locale, 'auditCrashed', { error: turn.error ?? '' }));
        return;
      }
      parsed = parseTurn(turn);
    }

    // An unreadable verdict fails closed: it counts as a failed audit, so
    // nothing unchecked is ever marked done.
    const verdict: AuditVerdict = parsed.ok
      ? parsed.value
      : { pass: false, notes: text(context.office.locale, 'auditInvalid', { error: parsed.error }), fixes: [] };
    const transition = applyAuditVerdict(task, verdict);
    const finished = transition.status === 'done' || transition.status === 'failed';
    const updated = saveTask(context.office.id, taskId, {
      status: transition.status,
      attempts: transition.attempts,
      instruction: transition.instruction,
      auditNotes: transition.auditNotes,
      error: transition.status === 'failed'
        ? text(context.office.locale, 'auditExhausted', { count: MAX_AUDIT_RETRIES + 1 })
        : null,
      finishedAt: finished ? new Date().toISOString() : null,
    });
    postMessage(context.office.id, {
      caseId,
      taskId,
      fromDivisionId: auditDivision.id,
      toDivisionId: task.divisionId,
      kind: verdict.pass ? 'audit_pass' : 'audit_fail',
      payload: {
        ref: task.ref,
        title: task.title,
        notes: verdict.notes,
        fixes: verdict.fixes,
        attempt: transition.attempts,
      },
    });
    if (transition.notifyCoordinator && updated) {
      notifyCoordinatorOfFailure(context, updated, updated.error ?? '');
    }
  };

  const launchTask = (context: CaseContext, task: OfficeTask): void => {
    const division = task.divisionId ? context.divisionsById.get(task.divisionId) : null;
    const model = division ? readyModel(division.agent) : null;
    if (!division || !model) {
      failTask(context, task.id, text(context.office.locale, 'divisionUnavailable'));
      return;
    }

    const caseId = context.caseItem.id;
    const handle = registerHandle(caseId, 'task', task.id, model.provider);
    saveTask(context.office.id, task.id, {
      status: 'running',
      error: null,
      startedAt: new Date().toISOString(),
      finishedAt: null,
    });
    postMessage(context.office.id, {
      caseId,
      taskId: task.id,
      fromDivisionId: context.coordinator.id,
      toDivisionId: division.id,
      kind: 'assign',
      payload: {
        ref: task.ref,
        title: task.title,
        instruction: task.instruction,
        attempt: task.attempts,
        context: task.dependsOn,
      },
    });

    void runTask(caseId, task.id, handle)
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        console.error('[Office] Task turn failed', { caseId, taskId: task.id, error: message });
        if (!handle.cancelled) {
          failTask(context, task.id, text(context.office.locale, 'taskCrashed', { error: message }));
        }
      })
      .finally(() => {
        releaseHandle(caseId, handle);
        scheduleTick(caseId);
      });
  };

  const launchAudit = (context: CaseContext, task: OfficeTask): void => {
    const caseId = context.caseItem.id;
    const auditModel = context.audit ? readyModel(context.audit.agent) : null;
    if (!context.audit || !auditModel) {
      // With the audit layer switched off, a finished task is accepted as is.
      saveTask(context.office.id, task.id, { status: 'done', finishedAt: new Date().toISOString() });
      postMessage(context.office.id, {
        caseId,
        taskId: task.id,
        fromDivisionId: context.audit?.id ?? null,
        toDivisionId: task.divisionId,
        kind: 'audit_pass',
        payload: { ref: task.ref, title: task.title, notes: text(context.office.locale, 'auditSkipped'), fixes: [], skipped: true },
      });
      scheduleTick(caseId);
      return;
    }

    const handle = registerHandle(caseId, 'audit', task.id, auditModel.provider);
    void runAudit(caseId, task.id, handle)
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        console.error('[Office] Audit turn failed', { caseId, taskId: task.id, error: message });
        if (!handle.cancelled) {
          failTask(context, task.id, text(context.office.locale, 'auditCrashed', { error: message }));
        }
      })
      .finally(() => {
        releaseHandle(caseId, handle);
        scheduleTick(caseId);
      });
  };

  /**
   * Derives and starts the next work for a case from its stored state. Only
   * running cases move; a paused case lets in-flight turns finish (their
   * results are recorded) but starts nothing new.
   */
  function tick(caseId: string): void {
    try {
      const context = loadContext(caseId);
      if (!context || context.caseItem.status !== 'running') {
        return;
      }

      const { caseItem } = context;
      const coordinatorRunning = hasCoordinatorRun(caseId);
      if (caseItem.phase === 'planning' || caseItem.phase === 'finalizing' || caseItem.phase === null) {
        if (!coordinatorRunning) {
          launchCoordinator(context, caseItem.phase === 'finalizing' ? 'final' : 'plan');
        }
        return;
      }

      const unreadNotes = officeCasesDb.listUnreadNotes(caseId, context.coordinator.id);
      let checkpointRunning = coordinatorRunning;
      if (unreadNotes.length > 0 && !coordinatorRunning) {
        launchCoordinator(context, 'checkpoint', unreadNotes);
        checkpointRunning = true;
      }

      const handles = [...(handlesByCase.get(caseId) ?? [])];
      const workHandles = handles.filter((handle) => handle.kind !== 'coordinator');
      const auditingTaskIds = new Set(
        workHandles.filter((handle) => handle.kind === 'audit' && handle.taskId).map((handle) => handle.taskId as string),
      );
      const tasks = officeCasesDb.listTasks(caseId);
      const step = planSchedulerStep(tasks, {
        maxParallel: context.office.maxParallel,
        activeRunCount: workHandles.length,
        auditingTaskIds,
      });

      const tasksById = new Map(tasks.map((task) => [task.id, task]));
      for (const taskId of step.block) {
        saveTask(context.office.id, taskId, {
          status: 'blocked',
          error: text(context.office.locale, 'dependencyFailed'),
        });
      }
      for (const taskId of step.audit) {
        launchAudit(context, tasksById.get(taskId) as OfficeTask);
      }
      for (const taskId of step.start) {
        launchTask(context, tasksById.get(taskId) as OfficeTask);
      }

      if (step.settled && !checkpointRunning && workHandles.length === 0) {
        saveCase(caseId, { phase: 'finalizing' });
        launchCoordinator(context, 'final');
      }
    } catch (error) {
      console.error('[Office] Tick failed', { caseId, error });
    }
  }

  const requireRunnableModels = (officeId: string): void => {
    const missing = officeService.findAgentsMissingModel(officeId);
    if (missing.length > 0) {
      throw conflict('Every enabled agent needs a model before a case can run.', 'OFFICE_MODELS_MISSING', {
        agents: missing.map((division) => ({
          divisionId: division.id,
          divisionName: division.name,
          agentName: division.agent.name,
        })),
      });
    }
  };

  return {
    startCase(officeId, caseId) {
      const caseItem = officeService.requireCase(officeId, caseId);
      if (caseItem.status !== 'draft') {
        throw conflict('Only a draft case can be started.', 'OFFICE_CASE_NOT_DRAFT');
      }
      requireRunnableModels(officeId);
      const hasWorkers = officesDb.listDivisions(officeId)
        .some((division) => !division.isCoordinator && !division.isAudit && division.agent.enabled);
      if (!hasWorkers) {
        throw conflict('The office has no enabled division to hand work to.', 'OFFICE_NO_DIVISIONS');
      }

      const started = saveCase(caseId, {
        status: 'running',
        phase: 'planning',
        waitingReason: null,
        error: null,
        startedAt: new Date().toISOString(),
      }) as OfficeCase;
      scheduleTick(caseId);
      return started;
    },

    pauseCase(officeId, caseId) {
      const caseItem = officeService.requireCase(officeId, caseId);
      if (caseItem.status !== 'running') {
        throw conflict('Only a running case can be paused.', 'OFFICE_CASE_NOT_RUNNING');
      }
      return saveCase(caseId, { status: 'waiting_user', waitingReason: 'paused' }) as OfficeCase;
    },

    resumeCase(officeId, caseId) {
      const caseItem = officeService.requireCase(officeId, caseId);
      if (caseItem.status !== 'waiting_user') {
        throw conflict('Only a waiting case can be resumed.', 'OFFICE_CASE_NOT_WAITING');
      }
      requireRunnableModels(officeId);
      const resumed = saveCase(caseId, { status: 'running', waitingReason: null }) as OfficeCase;
      scheduleTick(caseId);
      return resumed;
    },

    async cancelCase(officeId, caseId) {
      const caseItem = officeService.requireCase(officeId, caseId);
      if (caseItem.status !== 'running' && caseItem.status !== 'waiting_user') {
        throw conflict('Only a running or waiting case can be cancelled.', 'OFFICE_CASE_NOT_ACTIVE');
      }
      const office = officeService.requireOffice(officeId);
      const reason = text(office.locale, 'cancelled');

      const handles = [...(handlesByCase.get(caseId) ?? [])];
      for (const handle of handles) {
        handle.cancelled = true;
      }
      const now = new Date().toISOString();
      for (const task of officeCasesDb.listTasks(caseId)) {
        if (task.status === 'queued' || task.status === 'running' || task.status === 'review') {
          saveTask(officeId, task.id, { status: 'failed', error: reason, finishedAt: now });
        }
      }
      failCase(caseId, reason);

      await Promise.all(handles
        .filter((handle) => handle.sessionId)
        .map((handle) => dependencies.runner.abort(handle.provider, handle.sessionId as string)));
      return officeService.requireCase(officeId, caseId);
    },

    postNote(officeId, caseId, noteText) {
      const caseItem = officeService.requireCase(officeId, caseId);
      if (caseItem.status === 'done' || caseItem.status === 'failed') {
        throw conflict('This case has already finished.', 'OFFICE_CASE_FINISHED');
      }
      const trimmed = noteText.trim();
      if (!trimmed || trimmed.length > MAX_NOTE_LENGTH) {
        throw new AppError(`A note must be 1 to ${MAX_NOTE_LENGTH} characters.`, {
          code: 'INVALID_OFFICE_INPUT',
          statusCode: 400,
        });
      }
      const coordinator = officesDb.listDivisions(officeId).find((division) => division.isCoordinator);
      if (!coordinator) {
        throw conflict('The office has no coordinator.', 'OFFICE_NO_COORDINATOR');
      }

      const message = postMessage(officeId, {
        caseId,
        fromDivisionId: null,
        toDivisionId: coordinator.id,
        kind: 'note',
        payload: { text: trimmed },
      }, { unread: true });

      // Answering the coordinator's question is what un-parks the case.
      if (caseItem.status === 'waiting_user' && caseItem.waitingReason === 'question') {
        saveCase(caseId, { status: 'running', waitingReason: null });
      }
      scheduleTick(caseId);
      return message;
    },

    recoverInterruptedCases() {
      const cases = officeCasesDb.listCasesByStatus(['running', 'waiting_user']);
      for (const caseItem of cases) {
        for (const task of officeCasesDb.listTasks(caseItem.id)) {
          if (task.status === 'running') {
            // The session is kept, so the task resumes in the same conversation.
            officeCasesDb.updateTask(task.id, { status: 'queued' });
          }
        }
        officeCasesDb.updateCase(caseItem.id, {
          coordinatorBusy: false,
          ...(caseItem.status === 'running' ? { status: 'waiting_user', waitingReason: 'interrupted' } : {}),
        });
      }
      return cases.length;
    },
  };
}
