import assert from 'node:assert/strict';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeAll, test } from 'vitest';

import { i18n } from '@/modules/i18n';
import CasePanel from '@/modules/office/CasePanel';
import type { OfficeActions, OfficeCase } from '@/shared/types';

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

const NOW = '2026-09-25T10:00:00.000Z';

const CASE: OfficeCase = {
  id: 'case-1',
  officeId: 'office-1',
  title: 'Add a calculator',
  description: '',
  status: 'failed',
  waitingReason: null,
  phase: null,
  coordinatorBusy: false,
  coordinatorSessionId: null,
  finalSummary: null,
  error: 'finished, but some tasks failed',
  createdBy: null,
  createdAt: NOW,
  updatedAt: NOW,
  startedAt: NOW,
  finishedAt: NOW,
  quickDivisionId: null,
};

const renderPanel = (caseItem: OfficeCase, calls: string[] = []) => {
  const actions = {
    caseAction: async (_caseId: string, action: string) => {
      calls.push(action);
      return caseItem;
    },
  } as unknown as OfficeActions;
  render(
    <CasePanel
      caseItem={caseItem}
      tasks={[]}
      messages={[]}
      divisions={[]}
      missingModelAgents={[]}
      disconnectedProviders={[]}
      onConnectProviders={() => {}}
      actions={actions}
      onStart={async () => {}}
      onOpenWizard={() => {}}
      onSelectTask={() => {}}
      onOpenSession={() => {}}
    />,
  );
  return calls;
};

test('a failed case offers to retry what failed', async () => {
  const calls = renderPanel(CASE);
  fireEvent.click(screen.getByRole('button', { name: 'Retry failed' }));
  await waitFor(() => assert.deepEqual(calls, ['retry']));
});

test('a case parked on a provider limit says so and offers resume, not retry', () => {
  renderPanel({
    ...CASE,
    status: 'waiting_user',
    waitingReason: 'provider_limit',
    error: "the claude provider limit was reached: You've hit your session limit · resets 6pm (UTC)",
  });
  assert.match(screen.getByTestId('office-provider-limit').textContent ?? '', /session limit/);
  assert.ok(screen.getByText(/ran out of quota/));
  assert.ok(screen.getByRole('button', { name: 'Resume' }));
  assert.equal(screen.queryByRole('button', { name: 'Retry failed' }), null);
});
