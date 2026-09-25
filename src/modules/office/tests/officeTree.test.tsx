import assert from 'node:assert/strict';

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, test } from 'vitest';

import { i18n } from '@/modules/i18n';
import OfficeTree from '@/modules/office/OfficeTree';
import type { OfficeCase, OfficeDivision, OfficeMessage, OfficeSelection, OfficeTask, OfficeTaskStatus } from '@/shared/types';

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

const NOW = '2026-09-25T10:00:00.000Z';

function division(slug: string, overrides: Partial<OfficeDivision> = {}, model: string | null = 'sonnet'): OfficeDivision {
  const id = `div-${slug}`;
  return {
    id,
    officeId: 'office-1',
    name: slug[0].toUpperCase() + slug.slice(1),
    slug,
    description: '',
    color: '#2551BD',
    sortOrder: 0,
    isCoordinator: false,
    isAudit: false,
    createdAt: NOW,
    agent: {
      id: `agent-${slug}`,
      divisionId: id,
      name: `Agent ${slug}`,
      rolePrompt: '',
      provider: model ? 'claude' : null,
      model,
      allowedTools: [],
      skills: [],
      enabled: true,
      updatedAt: NOW,
    },
    ...overrides,
  };
}

function task(ref: string, slug: string, status: OfficeTaskStatus, overrides: Partial<OfficeTask> = {}): OfficeTask {
  return {
    id: `task-${ref}`,
    caseId: 'case-1',
    divisionId: `div-${slug}`,
    parentTaskId: null,
    ref,
    title: `Task ${ref}`,
    instruction: '',
    dependsOn: [],
    status,
    attempts: 0,
    resultSummary: null,
    auditNotes: null,
    sessionId: null,
    auditSessionId: null,
    error: null,
    sortOrder: 0,
    createdAt: NOW,
    updatedAt: NOW,
    startedAt: null,
    finishedAt: null,
    ...overrides,
  };
}

const DIVISIONS: OfficeDivision[] = [
  division('coordinator', { isCoordinator: true }),
  division('planner'),
  division('designer', {}, null),
  division('backend'),
  division('frontend'),
  division('security'),
  division('docs'),
  division('audit', { isAudit: true }),
];

const CASE: OfficeCase = {
  id: 'case-1',
  officeId: 'office-1',
  title: 'Add login',
  description: '',
  status: 'running',
  waitingReason: null,
  phase: 'executing',
  coordinatorBusy: true,
  coordinatorSessionId: 'coord-session',
  finalSummary: null,
  error: null,
  createdBy: null,
  createdAt: NOW,
  updatedAt: NOW,
  startedAt: NOW,
  finishedAt: null,
};

const TASKS: OfficeTask[] = [
  task('T1', 'planner', 'done'),
  task('T2', 'backend', 'running'),
  task('T3', 'frontend', 'review'),
  task('T4', 'security', 'blocked'),
  task('T5', 'docs', 'failed'),
  task('T6', 'designer', 'queued'),
];

const MESSAGES: OfficeMessage[] = [
  {
    id: 1,
    caseId: 'case-1',
    taskId: 'task-T2',
    fromDivisionId: 'div-coordinator',
    toDivisionId: 'div-backend',
    kind: 'assign',
    payload: { ref: 'T2', title: 'Task T2' },
    readAt: null,
    createdAt: NOW,
  },
];

function renderTree(overrides: { tasks?: OfficeTask[]; onSelect?: (selection: OfficeSelection) => void } = {}) {
  return render(
    <OfficeTree
      projectName="shop"
      divisions={DIVISIONS}
      caseItem={CASE}
      tasks={overrides.tasks ?? TASKS}
      messages={MESSAGES}
      selection={{ type: 'case' }}
      onSelect={overrides.onSelect ?? (() => {})}
    />,
  );
}

test('renders the case, the coordinator, one node per division and the skills/audit layer', () => {
  renderTree();
  for (const slug of ['case', 'coordinator', 'planner', 'designer', 'backend', 'frontend', 'security', 'docs', 'skills', 'audit']) {
    assert.ok(screen.getByTestId(`office-node-${slug}`), `node ${slug}`);
  }
  assert.ok(screen.getByText('Add login'));
  assert.ok(screen.getByText('Agent backend'));
});

test('each division node shows the live status of its tasks', () => {
  renderTree();
  const statusOf = (slug: string) => screen.getByTestId(`office-node-${slug}`).getAttribute('data-status');

  assert.equal(statusOf('planner'), 'done');
  assert.equal(statusOf('backend'), 'running');
  assert.equal(statusOf('frontend'), 'review');
  assert.equal(statusOf('security'), 'blocked');
  assert.equal(statusOf('docs'), 'failed');
  assert.equal(statusOf('designer'), 'idle', 'queued work is idle until it starts');
  assert.equal(statusOf('coordinator'), 'running', 'the coordinator is busy');
  assert.equal(statusOf('audit'), 'running', 'a task in review keeps the audit layer working');

  // Running nodes pulse; the others do not.
  assert.ok(screen.getByTestId('office-node-backend').className.includes('office-node-running'));
  assert.ok(!screen.getByTestId('office-node-planner').className.includes('office-node-running'));

  // Status pills carry the palette tone of the state.
  assert.ok(screen.getByTestId('office-node-docs').querySelector('[data-tone="failed"]'));
  assert.ok(screen.getByTestId('office-node-planner').querySelector('[data-tone="done"]'));
});

test('an agent without a model is flagged on its node', () => {
  renderTree();
  assert.ok(screen.getByTestId('office-node-designer').textContent?.includes('no model'));
  assert.ok(screen.getByTestId('office-node-backend').textContent?.includes('sonnet'));
});

test('a failed task that has a replacement no longer marks its division as failed', () => {
  renderTree({
    tasks: [
      task('T1', 'docs', 'failed'),
      task('T2', 'docs', 'done', { parentTaskId: 'task-T1' }),
    ],
  });
  assert.equal(screen.getByTestId('office-node-docs').getAttribute('data-status'), 'done');
});

test('the edge to a division with running work flows', () => {
  renderTree();
  assert.equal(screen.getByTestId('office-edge-backend').getAttribute('data-active'), 'true');
  assert.equal(screen.getByTestId('office-edge-planner').getAttribute('data-active'), 'false');
});

test('clicking a node selects its division and the message chip opens the message list', () => {
  const selections: OfficeSelection[] = [];
  renderTree({ onSelect: (selection) => selections.push(selection) });

  fireEvent.click(screen.getByTestId('office-node-frontend'));
  fireEvent.click(screen.getByRole('button', { name: 'Messages with Backend' }));
  fireEvent.click(screen.getByTestId('office-node-skills'));

  assert.deepEqual(selections, [
    { type: 'division', divisionId: 'div-frontend' },
    { type: 'messages', divisionId: 'div-backend' },
    { type: 'skills' },
  ]);
});
