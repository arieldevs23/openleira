import assert from 'node:assert/strict';
import test from 'node:test';

import { applyFlowOrder, planSchedulerStep } from '@/modules/office/services/office-scheduler.service.js';
import { wouldCreateFlowCycle } from '@/modules/office/services/office.service.js';
import type { OfficeTaskStatus } from '@/shared/types.js';

type FlowTask = {
  id: string;
  divisionId: string;
  status: OfficeTaskStatus;
  dependsOn: string[];
  parentTaskId: string | null;
};

const task = (id: string, divisionId: string, dependsOn: string[] = [], overrides: Partial<FlowTask> = {}): FlowTask => ({
  id, divisionId, status: 'queued', dependsOn, parentTaskId: null, ...overrides,
});
const arrow = (fromDivisionId: string, toDivisionId: string) => ({ fromDivisionId, toDivisionId });

const withFlow = (tasks: FlowTask[], flow: Array<ReturnType<typeof arrow>>): Record<string, string[]> => {
  const changes = applyFlowOrder(tasks, flow);
  return Object.fromEntries(tasks.map((item) => [item.id, [...(changes.get(item.id) ?? item.dependsOn)].sort()]));
};

test('an empty flow leaves the plan alone', () => {
  assert.equal(applyFlowOrder([task('a', 'backend'), task('b', 'docs', ['a'])], []).size, 0);
});

test('planner first, then backend and frontend in parallel, then docs', () => {
  const deps: Record<string, string[]> = withFlow(
    [task('p', 'planner'), task('b', 'backend'), task('f', 'frontend'), task('d', 'docs')],
    [arrow('planner', 'backend'), arrow('planner', 'frontend'), arrow('backend', 'docs'), arrow('frontend', 'docs')],
  );
  assert.deepEqual({ ...deps }, { p: [], b: ['p'], f: ['p'], d: ['b', 'f'] });

  // The scheduler then runs the branches side by side once the planner is done.
  const step = planSchedulerStep(
    [{ id: 'p', status: 'done', dependsOn: [] }, ...['b', 'f'].map((id) => ({ id, status: 'queued' as const, dependsOn: deps[id] })),
      { id: 'd', status: 'queued', dependsOn: deps.d }],
    { maxParallel: 3, activeRunCount: 0, auditingTaskIds: new Set() },
  );
  assert.deepEqual(step.start.sort(), ['b', 'f']);
});

test('a division without work in the case is looked through', () => {
  const deps = withFlow(
    [task('p', 'planner'), task('d', 'docs')],
    [arrow('planner', 'backend'), arrow('backend', 'docs')],
  );
  assert.deepEqual(deps.d, ['p']);
});

test('a replaced task stops counting, its replacement counts instead', () => {
  const deps = withFlow(
    [
      task('b1', 'backend', [], { status: 'failed' }),
      task('b2', 'backend', [], { parentTaskId: 'b1' }),
      task('d', 'docs'),
    ],
    [arrow('backend', 'docs')],
  );
  assert.deepEqual(deps.d, ['b2']);
});

test('only queued tasks are reordered', () => {
  const changes = applyFlowOrder(
    [task('p', 'planner', [], { status: 'running' }), task('b', 'backend', [], { status: 'running' })],
    [arrow('planner', 'backend')],
  );
  assert.equal(changes.size, 0);
});

test('when the plan contradicts the flow, the flow wins', () => {
  // The coordinator made the planner wait for the backend; the flow says the opposite.
  const deps = withFlow(
    [task('p', 'planner', ['b']), task('b', 'backend')],
    [arrow('planner', 'backend')],
  );
  assert.deepEqual(deps, { p: [], b: ['p'] });
});

test('a flow arrow that would close a loop is detected', () => {
  const flow = [arrow('planner', 'backend'), arrow('backend', 'docs')];
  assert.equal(wouldCreateFlowCycle(flow, 'docs', 'planner'), true);
  assert.equal(wouldCreateFlowCycle(flow, 'planner', 'docs'), false);
  assert.equal(wouldCreateFlowCycle(flow, 'backend', 'backend'), true);
});
