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

/** The slice of a task the flow rule reads. */
type FlowTask = Pick<OfficeTask, 'id' | 'status' | 'dependsOn' | 'divisionId' | 'parentTaskId'>;

/** One arrow of the workspace flow, between division ids. */
type FlowArrow = { fromDivisionId: string; toDivisionId: string };

/**
 * Applies the workspace flow to a case's tasks. Pure: returns the new
 * `dependsOn` of every queued task whose dependencies change.
 *
 * - A queued task waits for every live task of the divisions directly before
 *   its own division. A division with no task in the case is looked through,
 *   so `planner -> backend -> docs` still orders docs after planner when
 *   backend got no work. A task that was replaced does not count; its
 *   replacement does.
 * - Divisions on separate branches get no dependency on each other, so their
 *   tasks run in parallel.
 * - The flow is the user's rule and wins over the coordinator: when a
 *   dependency from the plan would make tasks wait on each other in a loop,
 *   that plan dependency is dropped. Flow dependencies alone cannot loop,
 *   because the flow itself is kept free of loops.
 */
export function applyFlowOrder(tasks: FlowTask[], flow: FlowArrow[]): Map<string, string[]> {
  if (flow.length === 0) {
    return new Map();
  }
  const replaced = new Set(tasks.map((task) => task.parentTaskId).filter((id): id is string => Boolean(id)));
  const liveTasksByDivision = new Map<string, string[]>();
  for (const task of tasks) {
    if (task.divisionId && !replaced.has(task.id)) {
      liveTasksByDivision.set(task.divisionId, [...(liveTasksByDivision.get(task.divisionId) ?? []), task.id]);
    }
  }
  const predecessors = new Map<string, string[]>();
  for (const arrow of flow) {
    predecessors.set(arrow.toDivisionId, [...(predecessors.get(arrow.toDivisionId) ?? []), arrow.fromDivisionId]);
  }

  const upstreamTaskIds = (divisionId: string): Set<string> => {
    const found = new Set<string>();
    const visited = new Set<string>();
    const stack = [...(predecessors.get(divisionId) ?? [])];
    while (stack.length > 0) {
      const current = stack.pop() as string;
      if (visited.has(current)) {
        continue;
      }
      visited.add(current);
      const live = liveTasksByDivision.get(current) ?? [];
      if (live.length > 0) {
        live.forEach((id) => found.add(id));
      } else {
        stack.push(...(predecessors.get(current) ?? []));
      }
    }
    return found;
  };

  // Dependencies of every queued task: the plan's plus the flow's.
  const planDeps = new Map<string, Set<string>>();
  const flowDeps = new Map<string, Set<string>>();
  for (const task of tasks) {
    if (task.status !== 'queued') {
      continue;
    }
    planDeps.set(task.id, new Set(task.dependsOn));
    const fromFlow = task.divisionId ? upstreamTaskIds(task.divisionId) : new Set<string>();
    fromFlow.delete(task.id);
    flowDeps.set(task.id, fromFlow);
  }
  const dependenciesOf = (taskId: string): string[] => [
    ...new Set([...(planDeps.get(taskId) ?? []), ...(flowDeps.get(taskId) ?? [])]),
  ];

  // Break loops among queued tasks by dropping plan dependencies on them.
  const findLoop = (): string[] | null => {
    const state = new Map<string, 'open' | 'closed'>();
    const path: string[] = [];
    const visit = (taskId: string): string[] | null => {
      state.set(taskId, 'open');
      path.push(taskId);
      for (const dependencyId of dependenciesOf(taskId)) {
        if (!planDeps.has(dependencyId)) {
          continue;
        }
        if (state.get(dependencyId) === 'open') {
          return [...path.slice(path.indexOf(dependencyId)), dependencyId];
        }
        if (!state.has(dependencyId)) {
          const loop = visit(dependencyId);
          if (loop) {
            return loop;
          }
        }
      }
      path.pop();
      state.set(taskId, 'closed');
      return null;
    };
    for (const taskId of planDeps.keys()) {
      if (!state.has(taskId)) {
        const loop = visit(taskId);
        if (loop) {
          return loop;
        }
      }
    }
    return null;
  };
  for (let loop = findLoop(); loop; loop = findLoop()) {
    let dropped = false;
    for (let index = 0; index < loop.length - 1 && !dropped; index += 1) {
      const [taskId, dependencyId] = [loop[index], loop[index + 1]];
      if (!flowDeps.get(taskId)?.has(dependencyId)) {
        planDeps.get(taskId)?.delete(dependencyId);
        dropped = true;
      }
    }
    if (!dropped) {
      break;
    }
  }

  const changes = new Map<string, string[]>();
  for (const task of tasks) {
    if (!planDeps.has(task.id)) {
      continue;
    }
    const next = dependenciesOf(task.id);
    const before = new Set(task.dependsOn);
    if (next.length !== before.size || next.some((id) => !before.has(id))) {
      changes.set(task.id, next);
    }
  }
  return changes;
}
