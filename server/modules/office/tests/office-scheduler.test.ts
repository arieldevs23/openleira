import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyAuditVerdict,
  isCaseFullyResolved,
  MAX_AUDIT_RETRIES,
  planSchedulerStep,
} from '@/modules/office/services/office-scheduler.service.js';
import type { OfficeTaskStatus } from '@/shared/types.js';

const task = (id: string, status: OfficeTaskStatus, dependsOn: string[] = []) => ({ id, status, dependsOn });
const idle = { activeRunCount: 0, auditingTaskIds: new Set<string>() };

test('a task starts only once every dependency is done', () => {
  const tasks = [
    task('a', 'running'),
    task('b', 'queued', ['a']),
    task('c', 'queued'),
  ];
  const step = planSchedulerStep(tasks, { ...idle, maxParallel: 3, activeRunCount: 1 });
  assert.deepEqual(step.start, ['c']);
  assert.equal(step.settled, false);

  const later = planSchedulerStep([task('a', 'done'), task('b', 'queued', ['a']), task('c', 'done')], {
    ...idle,
    maxParallel: 3,
  });
  assert.deepEqual(later.start, ['b']);
});

test('the parallel limit counts running tasks and audits together', () => {
  const tasks = [task('a', 'queued'), task('b', 'queued'), task('c', 'queued'), task('d', 'queued')];
  assert.deepEqual(planSchedulerStep(tasks, { ...idle, maxParallel: 2 }).start, ['a', 'b']);
  assert.deepEqual(planSchedulerStep(tasks, { ...idle, maxParallel: 2, activeRunCount: 1 }).start, ['a']);
  assert.deepEqual(planSchedulerStep(tasks, { ...idle, maxParallel: 2, activeRunCount: 2 }).start, []);
  // A nonsensical limit still lets work move.
  assert.deepEqual(planSchedulerStep(tasks, { ...idle, maxParallel: 0 }).start, ['a']);
});

test('finished work is audited before new work starts, and never audited twice', () => {
  const tasks = [task('a', 'review'), task('b', 'review'), task('c', 'queued')];
  const step = planSchedulerStep(tasks, { maxParallel: 2, activeRunCount: 1, auditingTaskIds: new Set(['a']) });
  assert.deepEqual(step.audit, ['b']);
  assert.deepEqual(step.start, []);
});

test('a failed dependency blocks the whole chain in one step', () => {
  const tasks = [
    task('a', 'failed'),
    task('b', 'queued', ['a']),
    task('c', 'queued', ['b']),
    task('d', 'queued'),
    task('e', 'queued', ['missing']),
  ];
  const step = planSchedulerStep(tasks, { ...idle, maxParallel: 5 });
  assert.deepEqual(step.block.sort(), ['b', 'c', 'e']);
  assert.deepEqual(step.start, ['d']);
  assert.equal(step.settled, false);
});

test('a case is settled when nothing is queued, running or in review', () => {
  assert.equal(planSchedulerStep([task('a', 'done'), task('b', 'failed')], { ...idle, maxParallel: 2 }).settled, true);
  assert.equal(planSchedulerStep([task('a', 'done'), task('b', 'review')], { ...idle, maxParallel: 2 }).settled, false);
  const blockedTail = planSchedulerStep([task('a', 'failed'), task('b', 'queued', ['a'])], { ...idle, maxParallel: 2 });
  assert.equal(blockedTail.settled, true);
});

test('audit pass completes the task', () => {
  const transition = applyAuditVerdict({ attempts: 0, instruction: 'do it' }, { pass: true, notes: 'ok', fixes: [] });
  assert.equal(transition.status, 'done');
  assert.equal(transition.attempts, 0);
  assert.equal(transition.instruction, 'do it');
  assert.equal(transition.notifyCoordinator, false);
});

test('audit failure re-queues with the notes appended, at most twice, then fails', () => {
  assert.equal(MAX_AUDIT_RETRIES, 2);
  const verdict = { pass: false, notes: 'no test', fixes: ['add a test'] };

  const first = applyAuditVerdict({ attempts: 0, instruction: 'do it' }, verdict);
  assert.equal(first.status, 'queued');
  assert.equal(first.attempts, 1);
  assert.match(first.instruction, /^do it\n\n\[audit #1\]\nno test\n- add a test$/);

  const second = applyAuditVerdict({ attempts: first.attempts, instruction: first.instruction }, verdict);
  assert.equal(second.status, 'queued');
  assert.equal(second.attempts, 2);
  assert.match(second.instruction, /\[audit #2\]/);

  const third = applyAuditVerdict({ attempts: second.attempts, instruction: second.instruction }, verdict);
  assert.equal(third.status, 'failed');
  assert.equal(third.attempts, 3);
  assert.equal(third.notifyCoordinator, true);
  assert.equal(third.instruction, second.instruction, 'a failed task keeps its last instruction');
});

test('a failed task counts as resolved once a replacement for it is done', () => {
  const done = { id: 'a', status: 'done' as const, parentTaskId: null };
  const failed = { id: 'b', status: 'failed' as const, parentTaskId: null };
  assert.equal(isCaseFullyResolved([done, failed]), false);
  assert.equal(isCaseFullyResolved([done, failed, { id: 'c', status: 'done', parentTaskId: 'b' }]), true);
  assert.equal(isCaseFullyResolved([done, failed, { id: 'c', status: 'failed', parentTaskId: 'b' }]), false);
  assert.equal(isCaseFullyResolved([]), false);
});
