import assert from 'node:assert/strict';

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { beforeAll, test } from 'vitest';

import { i18n } from '@/modules/i18n';
import CoordinatorDock, { type CoordinatorDockMode } from '@/modules/office/CoordinatorDock';
import { parseWorkItems, type WorkTarget } from '@/modules/office/utils/workItems';
import type { OfficeCase, OfficeDivision, OfficeMessage } from '@/shared/types';

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

const NOW = '2026-09-26T10:00:00.000Z';

const workItem = (id: string, overrides: Partial<OfficeCase> = {}): OfficeCase => ({
  id, officeId: 'o1', title: id, description: id, status: 'running', waitingReason: null, phase: 'executing',
  coordinatorBusy: false, coordinatorSessionId: null, finalSummary: null, error: null, createdBy: null, createdAt: NOW,
  updatedAt: NOW, startedAt: NOW, finishedAt: null, quickDivisionId: null, followsCaseId: null, ...overrides,
});

const COORDINATOR = { id: 'div-coordinator', name: 'Coordinator', isCoordinator: true, isAudit: false, agent: { name: 'Sekar', enabled: true } } as OfficeDivision;
const FRONTEND = { id: 'div-frontend', name: 'Frontend', isCoordinator: false, isAudit: false, agent: { name: 'Raka', enabled: true } } as OfficeDivision;

// Newest first, as the snapshot sends them.
const CASES = [
  workItem('header', { quickDivisionId: 'div-frontend', status: 'draft', followsCaseId: 'calculator', description: 'the header' }),
  workItem('calculator', { title: 'Calculator', description: 'add a calculator', status: 'waiting_user', waitingReason: 'question' }),
  workItem('readme', { title: 'Readme', description: 'write the readme', status: 'done', finalSummary: 'Readme written.' }),
];

const message = (id: number, fromDivisionId: string | null, text: string, extra: Partial<OfficeMessage> = {}): OfficeMessage => ({
  id, officeId: 'o1', caseId: 'calculator', taskId: null, fromDivisionId, toDivisionId: fromDivisionId ? null : 'div-coordinator',
  kind: 'note', payload: { text }, readAt: null, createdAt: NOW, ...extra,
} as OfficeMessage);

const MESSAGES = [
  message(1, 'div-coordinator', 'Which colours?', { kind: 'question' }),
  // Team traffic is not part of the chat.
  message(2, 'div-frontend', 'frontend result', { toDivisionId: 'div-coordinator', kind: 'result' }),
];

type Sent = { work: Array<{ items: string[]; divisionId: string | null }>; notes: Array<{ caseId: string; text: string }>; opened: string[] };

function Harness({ initial, sent, initialTarget = { kind: 'coordinator' } }: { initial: CoordinatorDockMode; sent: Sent; initialTarget?: WorkTarget }) {
  const [mode, setMode] = useState<CoordinatorDockMode>(initial);
  const [target, setTarget] = useState<WorkTarget>(initialTarget);
  return (
    <CoordinatorDock
      cases={CASES}
      divisions={[COORDINATOR, FRONTEND]}
      selectedCaseId="calculator"
      selectedMessages={MESSAGES}
      mode={mode}
      onModeChange={setMode}
      target={target}
      onTargetChange={setTarget}
      onSelectCase={(caseId) => { sent.opened.push(caseId); }}
      onSubmitWork={async (items, divisionId) => { sent.work.push({ items, divisionId }); }}
      onSendNote={async (caseId, text) => { sent.notes.push({ caseId, text }); }}
    />
  );
}

const emptySent = (): Sent => ({ work: [], notes: [], opened: [] });

test('a list of lines becomes separate work items with shared context; plain text is one item', () => {
  assert.deepEqual(parseWorkItems('fix the login'), { items: ['fix the login'], isList: false });
  assert.deepEqual(parseWorkItems('- only one line'), { items: ['- only one line'], isList: false });
  assert.deepEqual(parseWorkItems('For the shop app:\n- cart page\n  with totals\n2. checkout'), {
    items: ['cart page\n  with totals\n\nFor the shop app:', 'checkout\n\nFor the shop app:'],
    isList: true,
  });
});

test('collapsed, the dock shows the open work and hands a new prompt to the orchestrator', async () => {
  const sent = emptySent();
  render(<Harness initial="collapsed" sent={sent} />);
  assert.match(screen.getByTestId('office-dock-latest').textContent ?? '', /2 going · header/);

  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'add dark mode' } });
  fireEvent.click(screen.getByRole('button', { name: /send/i }));
  await waitFor(() => assert.deepEqual(sent.work, [{ items: ['add dark mode'], divisionId: null }]));
});

test('a list goes out as separate items to the picked agent, or as one prompt when unticked', async () => {
  const sent = emptySent();
  render(<Harness initial="collapsed" sent={sent} />);
  fireEvent.change(screen.getByTestId('office-work-target'), { target: { value: 'team:div-frontend' } });
  fireEvent.change(screen.getByRole('textbox'), { target: { value: '- header\n- footer' } });
  assert.match(screen.getByTestId('office-work-split').textContent ?? '', /2 separate items/);
  fireEvent.click(screen.getByRole('button', { name: 'Send 2 items' }));
  await waitFor(() => assert.deepEqual(sent.work, [{ items: ['header', 'footer'], divisionId: 'div-frontend' }]));

  fireEvent.change(screen.getByRole('textbox'), { target: { value: '- a\n- b' } });
  fireEvent.click(within(screen.getByTestId('office-work-split')).getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: /send/i }));
  await waitFor(() => assert.deepEqual(sent.work[1], { items: ['- a\n- b'], divisionId: 'div-frontend' }));
});

test('an answer goes to the running work that asked, as a note', async () => {
  const sent = emptySent();
  render(<Harness initial="collapsed" sent={sent} initialTarget={{ kind: 'note', caseId: 'calculator' }} />);
  const options = [...(screen.getByTestId('office-work-target') as HTMLSelectElement).options].map((option) => option.textContent);
  assert.ok(options.includes('Answer: Calculator'), 'full work with a question can be answered');
  assert.ok(!options.some((option) => option?.includes('header')), 'queued or agent-only work takes no notes');

  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'blue and white\n- not a list really\n- ok' } });
  assert.equal(screen.queryByTestId('office-work-split'), null, 'a note is never split');
  fireEvent.click(screen.getByRole('button', { name: /send/i }));
  await waitFor(() => assert.deepEqual(sent.notes, [{ caseId: 'calculator', text: 'blue and white\n- not a list really\n- ok' }]));
});

test('expanded shows every work item oldest first with its status, and the selected one\'s conversation', () => {
  const sent = emptySent();
  render(<Harness initial="collapsed" sent={sent} />);
  fireEvent.click(screen.getByTestId('office-dock-toggle'));
  assert.equal(screen.getByTestId('office-dock').dataset.mode, 'expanded');

  const items = screen.getAllByTestId('office-work-item');
  assert.deepEqual(items.map((item) => item.dataset.status), ['done', 'waiting_user', 'draft']);
  assert.match(items[0].textContent ?? '', /write the readme[\s\S]*Readme written\./);
  assert.match(items[1].textContent ?? '', /You → Sekar[\s\S]*has a question[\s\S]*Which colours\?/);
  assert.match(items[2].textContent ?? '', /You → Raka[\s\S]*waiting for the item before it/);
  assert.doesNotMatch(screen.getByTestId('office-dock-thread').textContent ?? '', /frontend result/);

  fireEvent.click(within(items[0]).getByTestId('office-work-open'));
  assert.deepEqual(sent.opened, ['readme']);

  fireEvent.click(screen.getByTestId('office-dock-hide'));
  assert.equal(screen.queryByTestId('office-dock'), null);
  assert.match(screen.getByTestId('office-dock-show').textContent ?? '', /2 going/);
  fireEvent.click(screen.getByTestId('office-dock-show'));
  assert.equal(screen.getByTestId('office-dock').dataset.mode, 'collapsed');
});
