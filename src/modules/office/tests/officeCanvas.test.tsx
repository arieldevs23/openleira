import assert from 'node:assert/strict';

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, test } from 'vitest';

import { i18n } from '@/modules/i18n';
import OfficeCanvas from '@/modules/office/OfficeCanvas';
import type {
  OfficeActions,
  OfficeCase,
  OfficeDivision,
  OfficeFlowEdge,
  OfficeMessage,
  OfficeSelection,
  OfficeSkillNode,
  OfficeTask,
  OfficeTaskStatus,
} from '@/shared/types';

beforeAll(async () => {
  await i18n.changeLanguage('en');
  // jsdom has no PointerEvent; without it fireEvent.pointer* drops clientX/pointerId.
  if (typeof window.PointerEvent === 'undefined') {
    class TestPointerEvent extends MouseEvent {
      pointerId: number;
      pointerType: string;
      constructor(type: string, init: PointerEventInit = {}) {
        super(type, init);
        this.pointerId = init.pointerId ?? 1;
        this.pointerType = init.pointerType ?? 'mouse';
      }
    }
    (window as unknown as { PointerEvent: unknown }).PointerEvent = TestPointerEvent;
  }
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
    position: null,
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
    changedFiles: [],
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
  quickDivisionId: null,
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

type Recorded = { method: string; args: unknown[] };

/** Canvas actions that record their calls and resolve at once. */
function recordingActions(calls: Recorded[]) {
  const record = (method: string) => async (...args: unknown[]) => {
    calls.push({ method, args });
    return { id: 'new-node' } as never;
  };
  return {
    addFlowEdge: record('addFlowEdge'),
    deleteFlowEdge: record('deleteFlowEdge'),
    updateDivision: record('updateDivision'),
    updateAgent: record('updateAgent'),
    addSkillNode: record('addSkillNode'),
    moveSkillNode: record('moveSkillNode'),
    deleteSkillNode: record('deleteSkillNode'),
    linkSkill: record('linkSkill'),
    unlinkSkill: record('unlinkSkill'),
  } as unknown as OfficeActions;
}

const SKILL_NODES: OfficeSkillNode[] = [
  { id: 'n-review', skillName: 'review', position: null, divisionIds: ['div-backend'], createdAt: NOW },
];

function renderTree(overrides: {
  tasks?: OfficeTask[];
  flow?: OfficeFlowEdge[];
  selection?: OfficeSelection;
  onSelect?: (selection: OfficeSelection) => void;
  calls?: Recorded[];
  onAddDivisionAt?: (point: { x: number; y: number }) => void;
  usageByDivision?: Map<string, number>;
  skillNodes?: OfficeSkillNode[];
  skillClipboard?: string | null;
  onCopySkill?: (name: string) => void;
  onAddSkillAt?: (point: { x: number; y: number }) => void;
  caseItem?: OfficeCase;
  messages?: OfficeMessage[];
  onAnswerQuestion?: (text: string) => Promise<void>;
  onQuickTask?: (division: OfficeDivision) => void;
} = {}) {
  return render(
    <OfficeCanvas
      officeId="office-1"
      projectName="shop"
      divisions={DIVISIONS}
      flow={overrides.flow ?? []}
      caseItem={overrides.caseItem ?? CASE}
      tasks={overrides.tasks ?? TASKS}
      messages={overrides.messages ?? MESSAGES}
      selection={overrides.selection ?? { type: 'case' }}
      onSelect={overrides.onSelect ?? (() => {})}
      usageByDivision={overrides.usageByDivision}
      actions={recordingActions(overrides.calls ?? [])}
      onAddDivisionAt={overrides.onAddDivisionAt ?? (() => {})}
      onDeleteDivision={() => {}}
      skillNodes={overrides.skillNodes ?? SKILL_NODES}
      installedSkills={[{ name: 'review', description: 'Reviews code', scope: 'user' }]}
      skillClipboard={overrides.skillClipboard ?? null}
      onCopySkill={overrides.onCopySkill}
      onAddSkillAt={overrides.onAddSkillAt}
      onAnswerQuestion={overrides.onAnswerQuestion}
      onQuickTask={overrides.onQuickTask}
    />,
  );
}

const arrow = (from: string, to: string): OfficeFlowEdge => ({ fromDivisionId: `div-${from}`, toDivisionId: `div-${to}`, createdAt: NOW });

test('renders the case, the coordinator, one node per division, the audit layer and the skill nodes', () => {
  renderTree();
  assert.ok(screen.getByTestId('office-skill-node-review'));
  assert.ok(screen.getByTestId('office-skill-link-review-backend'), 'the linked agent is drawn to its skill');
  for (const slug of ['case', 'coordinator', 'planner', 'designer', 'backend', 'frontend', 'security', 'docs', 'audit']) {
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
  fireEvent.click(screen.getByTestId('office-skill-node-review'));

  assert.deepEqual(selections, [
    { type: 'division', divisionId: 'div-frontend' },
    { type: 'messages', divisionId: 'div-backend' },
    { type: 'skill', nodeId: 'n-review' },
  ]);
});

test('the zoom controls zoom the chart and fit brings it back', () => {
  renderTree();
  const level = () => screen.getByTestId('office-zoom-level').textContent;
  const zoomOf = () => Number(screen.getByTestId('office-tree').getAttribute('data-zoom'));

  const start = zoomOf();
  fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
  assert.ok(zoomOf() > start);
  fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }));
  fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }));
  assert.ok(zoomOf() < start);
  assert.match(level() ?? '', /^\d+%$/);

  // Zoom never goes below the floor, however often it is pressed.
  for (let press = 0; press < 20; press += 1) {
    fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }));
  }
  assert.equal(zoomOf(), 0.3);

  // jsdom has no layout, so "fit" cannot measure; it must at least leave a valid zoom.
  fireEvent.click(screen.getByRole('button', { name: 'Fit to screen' }));
  assert.ok(zoomOf() >= 0.3 && zoomOf() <= 2);
});

test('the selected node gets a visible outline', () => {
  renderTree({ selection: { type: 'division', divisionId: 'div-backend' } });
  assert.ok(screen.getByTestId('office-node-backend').className.includes('outline-primary'));
  assert.ok(!screen.getByTestId('office-node-frontend').className.includes('outline-primary'));
});

test('flow arrows join divisions and the coordinator only feeds the start of each branch', () => {
  renderTree({ flow: [arrow('planner', 'backend'), arrow('planner', 'frontend'), arrow('backend', 'docs')] });
  assert.ok(screen.getByTestId('office-flow-planner-backend'));
  assert.ok(screen.getByTestId('office-flow-planner-frontend'));
  assert.ok(screen.getByTestId('office-flow-backend-docs'));
  // Divisions that wait for another one get no line from the coordinator.
  assert.equal(screen.queryByTestId('office-edge-backend'), null);
  assert.equal(screen.queryByTestId('office-edge-docs'), null);
  // The start of the flow and divisions outside it still do.
  assert.ok(screen.getByTestId('office-edge-planner'));
  assert.ok(screen.getByTestId('office-edge-security'));
});

test('dragging a node moves it and saves where it was dropped', () => {
  const calls: Recorded[] = [];
  const selections: OfficeSelection[] = [];
  renderTree({ calls, onSelect: (selection) => selections.push(selection) });
  const node = screen.getByTestId('office-node-backend');
  const startLeft = Number.parseFloat(node.style.left);

  fireEvent.pointerDown(node, { pointerId: 1, button: 0, pointerType: 'mouse', clientX: 100, clientY: 100 });
  fireEvent.pointerMove(node, { pointerId: 1, pointerType: 'mouse', clientX: 160, clientY: 130 });
  fireEvent.pointerUp(node, { pointerId: 1, pointerType: 'mouse', clientX: 160, clientY: 130 });
  // The click that follows a drag does not select the node.
  fireEvent.click(node);

  const zoom = Number(screen.getByTestId('office-tree').getAttribute('data-zoom'));
  assert.ok(Math.abs(Number.parseFloat(node.style.left) - (startLeft + 60 / zoom)) < 1, 'the node follows the pointer');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, 'updateDivision');
  assert.equal(calls[0].args[0], 'div-backend');
  assert.deepEqual(selections, []);
});

test('a small press on a node is still a click', () => {
  const calls: Recorded[] = [];
  const selections: OfficeSelection[] = [];
  renderTree({ calls, onSelect: (selection) => selections.push(selection) });
  const node = screen.getByTestId('office-node-docs');
  fireEvent.pointerDown(node, { pointerId: 1, button: 0, pointerType: 'mouse', clientX: 100, clientY: 100 });
  fireEvent.pointerMove(node, { pointerId: 1, pointerType: 'mouse', clientX: 102, clientY: 101 });
  fireEvent.pointerUp(node, { pointerId: 1, pointerType: 'mouse', clientX: 102, clientY: 101 });
  fireEvent.click(node);
  assert.deepEqual(calls, []);
  assert.deepEqual(selections, [{ type: 'division', divisionId: 'div-docs' }]);
});

test('right-click on a node opens its menu; entries jump to a section or draw an arrow', () => {
  const calls: Recorded[] = [];
  const selections: OfficeSelection[] = [];
  renderTree({ calls, onSelect: (selection) => selections.push(selection) });

  fireEvent.contextMenu(screen.getByTestId('office-node-backend'), { clientX: 50, clientY: 50 });
  fireEvent.click(screen.getByRole('menuitem', { name: 'Role (markdown)' }));
  assert.deepEqual(selections, [{ type: 'division', divisionId: 'div-backend', focus: 'role' }]);

  fireEvent.contextMenu(screen.getByTestId('office-node-backend'), { clientX: 50, clientY: 50 });
  fireEvent.click(screen.getByRole('menuitem', { name: 'Connect to…' }));
  fireEvent.click(screen.getByTestId('office-node-docs'));
  assert.deepEqual(calls, [{ method: 'addFlowEdge', args: ['div-backend', 'div-docs'] }]);
});

test('a working team menu offers a quick task; the coordinator menu does not', () => {
  const picked: string[] = [];
  renderTree({ onQuickTask: (division) => picked.push(division.id) });
  fireEvent.contextMenu(screen.getByTestId('office-node-backend'), { clientX: 50, clientY: 50 });
  fireEvent.click(screen.getByRole('menuitem', { name: 'Quick task' }));
  assert.deepEqual(picked, ['div-backend']);

  fireEvent.contextMenu(screen.getByTestId('office-node-coordinator'), { clientX: 50, clientY: 50 });
  assert.ok(!screen.getAllByRole('menuitem').some((item) => item.textContent === 'Quick task'));
});

test('the coordinator menu offers no flow or delete entries', () => {
  renderTree();
  fireEvent.contextMenu(screen.getByTestId('office-node-coordinator'), { clientX: 50, clientY: 50 });
  const labels = screen.getAllByRole('menuitem').map((item) => item.textContent);
  assert.ok(labels.includes('Model'));
  assert.ok(!labels.includes('Connect to…'));
  assert.ok(!labels.includes('Delete team'));
  assert.ok(!labels.includes('Disable'));
});

test('right-click on empty canvas offers to add an agent at that spot', () => {
  const added: Array<{ x: number; y: number }> = [];
  renderTree({ onAddDivisionAt: (point) => added.push(point) });
  fireEvent.contextMenu(screen.getByRole('region', { name: 'Workspace canvas' }), { clientX: 300, clientY: 200 });
  fireEvent.click(screen.getByRole('menuitem', { name: 'Add agent here' }));
  assert.equal(added.length, 1);
  assert.ok(Number.isFinite(added[0].x) && Number.isFinite(added[0].y));
});

test('each node shows the tokens its division spent in the case', () => {
  renderTree({ usageByDivision: new Map([['div-backend', 12_345], ['div-coordinator', 900]]) });
  assert.equal(screen.getByTestId('office-node-tokens-backend').textContent, '12k');
  assert.equal(screen.getByTestId('office-node-tokens-coordinator').textContent, '900');
  assert.equal(screen.queryByTestId('office-node-tokens-docs'), null);
});

test('a drag whose trailing click never comes does not swallow the next click', () => {
  const calls: Recorded[] = [];
  const selections: OfficeSelection[] = [];
  renderTree({ calls, onSelect: (selection) => selections.push(selection) });
  const backend = screen.getByTestId('office-node-backend');
  fireEvent.pointerDown(backend, { pointerId: 1, button: 0, pointerType: 'mouse', clientX: 100, clientY: 100 });
  fireEvent.pointerMove(backend, { pointerId: 1, pointerType: 'mouse', clientX: 180, clientY: 140 });
  fireEvent.pointerUp(backend, { pointerId: 1, pointerType: 'mouse', clientX: 180, clientY: 140 });

  const docs = screen.getByTestId('office-node-docs');
  fireEvent.pointerDown(docs, { pointerId: 2, button: 0, pointerType: 'mouse', clientX: 10, clientY: 10 });
  fireEvent.pointerUp(docs, { pointerId: 2, pointerType: 'mouse', clientX: 10, clientY: 10 });
  fireEvent.click(docs);
  assert.deepEqual(selections, [{ type: 'division', divisionId: 'div-docs' }]);
});

test('an agent gets a skill by being connected to the skill node', () => {
  const calls: Recorded[] = [];
  renderTree({ calls });
  fireEvent.contextMenu(screen.getByTestId('office-skill-node-review'), { clientX: 40, clientY: 40 });
  fireEvent.click(screen.getByRole('menuitem', { name: 'Connect to an agent…' }));
  fireEvent.click(screen.getByTestId('office-node-docs'));
  assert.deepEqual(calls, [{ method: 'linkSkill', args: ['n-review', 'div-docs'] }]);

  // A link can be cut from its line.
  fireEvent.contextMenu(screen.getByTestId('office-skill-link-review-backend').nextElementSibling as Element, { clientX: 40, clientY: 40 });
  fireEvent.click(screen.getByRole('menuitem', { name: 'Remove skill from agent' }));
  assert.deepEqual(calls[1], { method: 'unlinkSkill', args: ['n-review', 'div-backend'] });
});

test('skills are added from the canvas menu and copied with Ctrl+C / Ctrl+V', async () => {
  const calls: Recorded[] = [];
  const copied: string[] = [];
  const addAt: Array<{ x: number; y: number }> = [];
  const view = renderTree({ calls, onCopySkill: (name) => copied.push(name), onAddSkillAt: (point) => addAt.push(point), selection: { type: 'skill', nodeId: 'n-review' } });
  const canvas = screen.getByRole('region', { name: 'Workspace canvas' });

  fireEvent.contextMenu(canvas, { clientX: 200, clientY: 200 });
  fireEvent.click(screen.getByRole('menuitem', { name: 'Add skill here' }));
  assert.equal(addAt.length, 1);

  fireEvent.keyDown(canvas, { key: 'c', ctrlKey: true });
  assert.deepEqual(copied, ['review']);

  view.unmount();
  renderTree({ calls, skillClipboard: 'review' });
  fireEvent.keyDown(screen.getByRole('region', { name: 'Workspace canvas' }), { key: 'v', ctrlKey: true });
  await Promise.resolve();
  assert.equal(calls[0].method, 'addSkillNode');
  assert.equal((calls[0].args[0] as { skillName: string }).skillName, 'review');
});

test('an open question from the coordinator shows on the canvas and can be answered there', async () => {
  const answers: string[] = [];
  renderTree({
    caseItem: { ...CASE, status: 'waiting_user', waitingReason: 'question', coordinatorBusy: false },
    messages: [...MESSAGES, {
      id: 2, caseId: 'case-1', taskId: null, fromDivisionId: 'div-coordinator', toDivisionId: null,
      kind: 'question', payload: { text: 'Which app, HR or payroll?' }, readAt: null, createdAt: NOW,
    }],
    onAnswerQuestion: async (text) => { answers.push(text); },
  });
  const bubble = screen.getByTestId('office-question-bubble');
  assert.ok(bubble.textContent?.includes('Which app, HR or payroll?'));
  fireEvent.change(screen.getByRole('textbox', { name: 'Answer the orchestrator' }), { target: { value: 'payroll' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send answer' }));
  await Promise.resolve();
  assert.deepEqual(answers, ['payroll']);

  // The bubble folds into a chip so it does not cover the nodes behind it, and unfolds again.
  fireEvent.click(screen.getByRole('button', { name: 'Minimize' }));
  assert.equal(screen.queryByTestId('office-question-bubble'), null);
  fireEvent.click(screen.getByTestId('office-question-chip'));
  assert.ok(screen.getByTestId('office-question-bubble'));
});

test('no question, no bubble', () => {
  renderTree();
  assert.equal(screen.queryByTestId('office-question-bubble'), null);
});

/** The canvas pixels of a node as rendered (the chart is not fitted in jsdom, so they are client pixels too). */
const boxOf = (element: HTMLElement) => ({ x: Number.parseFloat(element.style.left), y: Number.parseFloat(element.style.top) });

test('Shift+drag on empty canvas selects the nodes fully inside the rectangle', () => {
  renderTree();
  const canvas = screen.getByRole('region', { name: 'Workspace canvas' });
  const backend = boxOf(screen.getByTestId('office-node-backend'));

  fireEvent.pointerDown(canvas, { pointerId: 1, button: 0, pointerType: 'mouse', shiftKey: true, clientX: backend.x - 4, clientY: backend.y - 4 });
  // Only touching a node is not enough.
  fireEvent.pointerMove(canvas, { pointerId: 1, pointerType: 'mouse', shiftKey: true, clientX: backend.x + 20, clientY: backend.y + 20 });
  assert.ok(screen.getByTestId('office-marquee'));
  assert.equal(screen.getByTestId('office-node-backend').dataset.marked, undefined);
  fireEvent.pointerMove(canvas, { pointerId: 1, pointerType: 'mouse', shiftKey: true, clientX: backend.x + 180, clientY: backend.y + 100 });
  fireEvent.pointerUp(canvas, { pointerId: 1, pointerType: 'mouse', clientX: backend.x + 180, clientY: backend.y + 100 });

  assert.equal(screen.queryByTestId('office-marquee'), null);
  assert.equal(screen.getByTestId('office-node-backend').dataset.marked, 'true');
  assert.equal(screen.getByTestId('office-node-docs').dataset.marked, undefined);

  // A plain click on empty canvas drops the selection.
  fireEvent.pointerDown(canvas, { pointerId: 2, button: 0, pointerType: 'mouse', clientX: 5, clientY: 5 });
  fireEvent.pointerUp(canvas, { pointerId: 2, pointerType: 'mouse', clientX: 5, clientY: 5 });
  assert.equal(screen.getByTestId('office-node-backend').dataset.marked, undefined);
});

test('Shift+click picks nodes, and dragging one moves and saves all of them', () => {
  const calls: Recorded[] = [];
  const selections: OfficeSelection[] = [];
  renderTree({ calls, onSelect: (selection) => selections.push(selection) });
  const backend = screen.getByTestId('office-node-backend');
  const skill = screen.getByTestId('office-skill-node-review');
  const skillStart = boxOf(skill);

  fireEvent.click(backend, { shiftKey: true });
  fireEvent.click(skill, { shiftKey: true });
  assert.equal(backend.dataset.marked, 'true');
  assert.equal(skill.dataset.marked, 'true');
  assert.deepEqual(selections, [], 'Shift+click marks without opening the panel');

  fireEvent.pointerDown(backend, { pointerId: 1, button: 0, pointerType: 'mouse', clientX: 100, clientY: 100 });
  fireEvent.pointerMove(backend, { pointerId: 1, pointerType: 'mouse', clientX: 150, clientY: 120 });
  fireEvent.pointerUp(backend, { pointerId: 1, pointerType: 'mouse', clientX: 150, clientY: 120 });
  // The click the browser fires after a drag neither opens the panel nor drops the selection.
  fireEvent.click(backend);
  assert.equal(screen.getByTestId('office-node-backend').dataset.marked, 'true');
  assert.deepEqual(selections, []);

  assert.deepEqual(calls.map((call) => [call.method, call.args[0]]).sort(), [['moveSkillNode', 'n-review'], ['updateDivision', 'div-backend']]);
  assert.ok(Math.abs(boxOf(screen.getByTestId('office-skill-node-review')).x - (skillStart.x + 50)) < 1, 'the other node follows');

  // Shift+click again takes a node out; Escape clears the rest.
  fireEvent.click(skill, { shiftKey: true });
  assert.equal(screen.getByTestId('office-skill-node-review').dataset.marked, undefined);
  fireEvent.keyDown(screen.getByRole('region', { name: 'Workspace canvas' }), { key: 'Escape' });
  assert.equal(screen.getByTestId('office-node-backend').dataset.marked, undefined);
});

test('Ctrl+A selects every node and Delete removes the selected skill nodes only', () => {
  const calls: Recorded[] = [];
  renderTree({ calls });
  const canvas = screen.getByRole('region', { name: 'Workspace canvas' });

  fireEvent.keyDown(canvas, { key: 'a', ctrlKey: true });
  assert.equal(screen.getByTestId('office-node-coordinator').dataset.marked, 'true');
  assert.equal(screen.getByTestId('office-skill-node-review').dataset.marked, 'true');

  fireEvent.keyDown(canvas, { key: 'Delete' });
  assert.deepEqual(calls, [{ method: 'deleteSkillNode', args: ['n-review'] }]);
  assert.equal(screen.getByTestId('office-node-backend').dataset.marked, 'true', 'teams stay: they are deleted one by one');
});

test('a selected arrow is cut with Delete', async () => {
  const calls: Recorded[] = [];
  const selections: OfficeSelection[] = [];
  renderTree({
    calls,
    flow: [arrow('backend', 'frontend')],
    selection: { type: 'edge', fromDivisionId: 'div-backend', toDivisionId: 'div-frontend' },
    onSelect: (selection) => selections.push(selection),
  });
  fireEvent.keyDown(screen.getByRole('region', { name: 'Workspace canvas' }), { key: 'Delete' });
  assert.deepEqual(calls, [{ method: 'deleteFlowEdge', args: ['div-backend', 'div-frontend'] }]);
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(selections, [{ type: 'case' }]);
});

test('dragging an end of a selected arrow off every node cuts it; onto another team moves it', async () => {
  const calls: Recorded[] = [];
  renderTree({
    calls,
    flow: [arrow('backend', 'frontend')],
    selection: { type: 'edge', fromDivisionId: 'div-backend', toDivisionId: 'div-frontend' },
  });
  const end = screen.getByTestId('office-flow-end-to-backend-frontend');

  fireEvent.pointerDown(end, { pointerId: 1, button: 0, pointerType: 'mouse', clientX: 10, clientY: 10 });
  // The arrow's own end handle goes away while it is dragged; the canvas holds the pointer (capture).
  const canvas = screen.getByRole('region', { name: 'Workspace canvas' });
  fireEvent.pointerMove(canvas, { pointerId: 1, pointerType: 'mouse', clientX: 40, clientY: 40 });
  assert.ok(screen.getByTestId('office-reconnect-line'));
  fireEvent.pointerUp(canvas, { pointerId: 1, pointerType: 'mouse', clientX: 40, clientY: 40 });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(calls, [{ method: 'deleteFlowEdge', args: ['div-backend', 'div-frontend'] }]);

  calls.length = 0;
  const docs = screen.getByTestId('office-node-docs');
  const original = document.elementFromPoint;
  document.elementFromPoint = () => docs;
  try {
    fireEvent.pointerDown(screen.getByTestId('office-flow-end-to-backend-frontend'), { pointerId: 2, button: 0, pointerType: 'mouse', clientX: 10, clientY: 10 });
    fireEvent.pointerUp(canvas, { pointerId: 2, pointerType: 'mouse', clientX: 50, clientY: 50 });
    await new Promise((resolve) => setTimeout(resolve, 0));
  } finally {
    document.elementFromPoint = original;
  }
  assert.deepEqual(calls, [
    { method: 'deleteFlowEdge', args: ['div-backend', 'div-frontend'] },
    { method: 'addFlowEdge', args: ['div-backend', 'div-docs'] },
  ]);
});

test('a clicked skill line is cut with Delete', () => {
  const calls: Recorded[] = [];
  renderTree({ calls });
  fireEvent.click(screen.getByTestId('office-skill-link-review-backend').nextElementSibling as Element);
  fireEvent.keyDown(screen.getByRole('region', { name: 'Workspace canvas' }), { key: 'Delete' });
  assert.deepEqual(calls, [{ method: 'unlinkSkill', args: ['n-review', 'div-backend'] }]);
});
