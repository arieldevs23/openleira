import type { AuditVerdict } from '@/modules/office/services/office-plan-parser.service.js';
import type { OfficeTask, OfficeTaskStatus } from '@/shared/types.js';

/**
 * How many times a task may be sent back after a failed audit. The brief is
 * "maks 2 kali ulang": two re-runs, so the third failed audit fails the task.
 */
export const MAX_AUDIT_RETRIES = 2;

/** The slice of a task the scheduler decides on. */
type SchedulableTask = Pick<OfficeTask, 'id' | 'status' | 'dependsOn'>;

/** What the orchestrator should do next for one case. */
export type SchedulerStep = {
  /** Queued tasks whose dependencies are all done, within the free slots. */
  start: string[];
  /** Tasks waiting in review that should get an audit run now. */
  audit: string[];
  /** Queued tasks that can never run because a dependency failed or is blocked. */
  block: string[];
  /** Nothing is queued, running or in review once `block` is applied. */
  settled: boolean;
};

/**
 * Decides the next scheduling step for a case. Pure: it reads task statuses
 * and in-flight counts and returns ids; the orchestrator applies them.
 *
 * - A queued task starts only when every dependency is `done`.
 * - A dependency that is `failed`/`blocked` (or missing) blocks the task, and
 *   blocking cascades through the whole chain in one step.
 * - `maxParallel` caps task and audit sessions together; audits are served
 *   first so finished work is checked before new work piles up.
 */
export function planSchedulerStep(
  tasks: SchedulableTask[],
  options: { maxParallel: number; activeRunCount: number; auditingTaskIds: ReadonlySet<string> },
): SchedulerStep {
  const statusById = new Map<string, OfficeTaskStatus>(tasks.map((task) => [task.id, task.status]));

  const block: string[] = [];
  let changed = true;
  while (changed) {
    changed = false;
    for (const task of tasks) {
      if (statusById.get(task.id) !== 'queued') {
        continue;
      }
      const hasDeadDependency = task.dependsOn.some((dependencyId) => {
        const status = statusById.get(dependencyId);
        return status === undefined || status === 'failed' || status === 'blocked';
      });
      if (hasDeadDependency) {
        statusById.set(task.id, 'blocked');
        block.push(task.id);
        changed = true;
      }
    }
  }

  let freeSlots = Math.max(0, Math.max(1, options.maxParallel) - options.activeRunCount);

  const audit: string[] = [];
  for (const task of tasks) {
    if (freeSlots === 0) {
      break;
    }
    if (statusById.get(task.id) === 'review' && !options.auditingTaskIds.has(task.id)) {
      audit.push(task.id);
      freeSlots -= 1;
    }
  }

  const start: string[] = [];
  for (const task of tasks) {
    if (freeSlots === 0) {
      break;
    }
    if (statusById.get(task.id) !== 'queued') {
      continue;
    }
    if (task.dependsOn.every((dependencyId) => statusById.get(dependencyId) === 'done')) {
      start.push(task.id);
      freeSlots -= 1;
    }
  }

  const settled = start.length === 0
    && [...statusById.values()].every((status) => status === 'done' || status === 'failed' || status === 'blocked');

  return { start, audit, block, settled };
}

/** The task update an audit verdict leads to. */
export type AuditTransition = {
  status: 'done' | 'queued' | 'failed';
  attempts: number;
  instruction: string;
  auditNotes: string;
  /** True when the task failed for good and the coordinator must be told. */
  notifyCoordinator: boolean;
};

/** Renders a verdict's notes and fixes as the block appended to a task. */
export function formatAuditFeedback(verdict: AuditVerdict): string {
  const lines = [verdict.notes.trim()].filter(Boolean);
  if (verdict.fixes.length > 0) {
    lines.push(verdict.fixes.map((fix) => `- ${fix}`).join('\n'));
  }
  return lines.join('\n');
}

/**
 * Applies an audit verdict to a task. A pass completes it; a failure sends it
 * back to the queue with the audit feedback appended to its instruction,
 * until `MAX_AUDIT_RETRIES` re-runs are used up — then it fails and the
 * coordinator is notified.
 */
export function applyAuditVerdict(
  task: Pick<OfficeTask, 'attempts' | 'instruction'>,
  verdict: AuditVerdict,
): AuditTransition {
  const feedback = formatAuditFeedback(verdict);
  if (verdict.pass) {
    return {
      status: 'done',
      attempts: task.attempts,
      instruction: task.instruction,
      auditNotes: feedback,
      notifyCoordinator: false,
    };
  }

  const attempts = task.attempts + 1;
  if (attempts > MAX_AUDIT_RETRIES) {
    return {
      status: 'failed',
      attempts,
      instruction: task.instruction,
      auditNotes: feedback,
      notifyCoordinator: true,
    };
  }

  return {
    status: 'queued',
    attempts,
    instruction: `${task.instruction}\n\n[audit #${attempts}]\n${feedback}`,
    auditNotes: feedback,
    notifyCoordinator: false,
  };
}

/**
 * A case counts as done when every task is done, or failed/blocked but
 * superseded by a replacement task (its child) that is itself resolved.
 */
export function isCaseFullyResolved(
  tasks: Array<Pick<OfficeTask, 'id' | 'status' | 'parentTaskId'>>,
): boolean {
  const childrenByParent = new Map<string, Array<Pick<OfficeTask, 'id' | 'status' | 'parentTaskId'>>>();
  for (const task of tasks) {
    if (task.parentTaskId) {
      const siblings = childrenByParent.get(task.parentTaskId) ?? [];
      siblings.push(task);
      childrenByParent.set(task.parentTaskId, siblings);
    }
  }

  const resolved = (task: Pick<OfficeTask, 'id' | 'status' | 'parentTaskId'>, depth: number): boolean => {
    if (task.status === 'done') {
      return true;
    }
    if (depth > tasks.length) {
      return false;
    }
    return (childrenByParent.get(task.id) ?? []).some((child) => resolved(child, depth + 1));
  };

  return tasks.length > 0 && tasks.every((task) => resolved(task, 0));
}
