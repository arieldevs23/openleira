import assert from 'node:assert/strict';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { beforeAll, test } from 'vitest';

import { i18n } from '@/modules/i18n';
import CoordinatorDock, { type CoordinatorDockMode } from '@/modules/office/CoordinatorDock';
import type { OfficeCase, OfficeDivision, OfficeMessage } from '@/shared/types';

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

const NOW = '2026-09-26T10:00:00.000Z';

const CASE = {
  id: 'case-1', officeId: 'o1', title: 'Calculator', description: '', status: 'running', waitingReason: null, phase: 'executing',
  coordinatorBusy: false, coordinatorSessionId: null, finalSummary: null, error: null, createdBy: null, createdAt: NOW,
  updatedAt: NOW, startedAt: NOW, finishedAt: null, quickDivisionId: null,
} as OfficeCase;

const COORDINATOR = { id: 'div-coordinator', name: 'Coordinator', isCoordinator: true, agent: { name: 'Sekar' } } as OfficeDivision;

const message = (id: number, fromDivisionId: string | null, text: string, extra: Partial<OfficeMessage> = {}): OfficeMessage => ({
  id, officeId: 'o1', caseId: 'case-1', taskId: null, fromDivisionId, toDivisionId: fromDivisionId ? null : 'div-coordinator',
  kind: 'note', payload: { text }, readAt: null, createdAt: NOW, ...extra,
} as OfficeMessage);

const MESSAGES = [
  message(1, null, 'add a calculator'),
  message(2, 'div-coordinator', 'on it: planner first'),
  // Team traffic is not part of the chat.
  message(3, 'div-frontend', 'frontend result', { toDivisionId: 'div-coordinator', kind: 'result' }),
];

function Harness({ initial, sent }: { initial: CoordinatorDockMode; sent: string[] }) {
  const [mode, setMode] = useState<CoordinatorDockMode>(initial);
  return (
    <CoordinatorDock
      caseItem={CASE}
      messages={MESSAGES}
      coordinator={COORDINATOR}
      mode={mode}
      onModeChange={setMode}
      onSend={async (text) => { sent.push(text); }}
    />
  );
}

test('collapsed, the dock shows the latest line and sends from its box', async () => {
  const sent: string[] = [];
  render(<Harness initial="collapsed" sent={sent} />);
  assert.match(screen.getByTestId('office-dock-latest').textContent ?? '', /Sekar: on it: planner first/);

  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'use the iOS look' } });
  fireEvent.click(screen.getByRole('button', { name: /send/i }));
  await waitFor(() => assert.deepEqual(sent, ['use the iOS look']));
});

test('expanded shows the whole conversation without team traffic; it can be hidden and shown again', () => {
  render(<Harness initial="collapsed" sent={[]} />);
  fireEvent.click(screen.getByTestId('office-dock-toggle'));
  assert.equal(screen.getByTestId('office-dock').dataset.mode, 'expanded');
  const thread = screen.getByTestId('office-dock-thread');
  assert.match(thread.textContent ?? '', /add a calculator/);
  assert.match(thread.textContent ?? '', /planner first/);
  assert.doesNotMatch(thread.textContent ?? '', /frontend result/);

  fireEvent.click(screen.getByTestId('office-dock-hide'));
  assert.equal(screen.queryByTestId('office-dock'), null);
  fireEvent.click(screen.getByTestId('office-dock-show'));
  assert.equal(screen.getByTestId('office-dock').dataset.mode, 'collapsed');
});
