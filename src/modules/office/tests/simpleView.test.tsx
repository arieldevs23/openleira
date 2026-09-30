import assert from 'node:assert/strict';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeAll, test } from 'vitest';

import { i18n } from '@/modules/i18n';
import SimpleView from '@/modules/office/SimpleView';
import type { LLMProvider, Office, OfficeCase, OfficeDivision, OfficeMessage, OfficeTask, ProviderAuthStatusMap } from '@/shared/types';

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

const NOW = '2026-09-30T10:00:00.000Z';

const office = (kind: Office['kind']): Office => ({
  id: 'o1', projectPath: '/srv/toko', name: 'toko', locale: 'en', kind, maxParallel: 2,
  permissionMode: 'bypassPermissions', permissionWarningAcknowledged: true, createdAt: NOW, updatedAt: NOW,
});

const statuses = (connected: LLMProvider[]): ProviderAuthStatusMap => Object.fromEntries(
  ['claude', 'codex', 'cursor', 'opencode'].map((provider) => [provider, {
    authenticated: connected.includes(provider as LLMProvider), email: null, method: null, error: null, loading: false,
  }]),
) as unknown as ProviderAuthStatusMap;

const division = (id: string, name: string): OfficeDivision => ({
  id, officeId: 'o1', name, slug: id, description: '', color: '#2551BD', sortOrder: 0, isCoordinator: false, isAudit: false,
  createdAt: NOW, position: null,
  agent: { id: `a-${id}`, divisionId: id, name: 'Ana', rolePrompt: '', provider: 'claude', model: 'sonnet', allowedTools: [], skills: [], enabled: true, updatedAt: NOW },
});

const work = (extra: Partial<OfficeCase>): OfficeCase => ({
  id: 'c1', officeId: 'o1', title: 'Sales report', description: '', status: 'running', waitingReason: null, phase: 'executing',
  coordinatorBusy: false, coordinatorSessionId: null, finalSummary: null, error: null, quickDivisionId: null, followsCaseId: null,
  createdBy: null, createdAt: NOW, updatedAt: NOW, startedAt: NOW, finishedAt: null, ...extra,
});

const task = (extra: Partial<OfficeTask>): OfficeTask => ({
  id: 't1', caseId: 'c1', divisionId: 'data', parentTaskId: null, ref: 'T1', title: 'Clean data', instruction: '', dependsOn: [],
  status: 'done', attempts: 0, resultSummary: null, auditNotes: null, sessionId: null, auditSessionId: null, error: null,
  changedFiles: [], sortOrder: 0, createdAt: NOW, updatedAt: NOW, startedAt: null, finishedAt: null, ...extra,
});

const baseSetup = (over: Partial<Parameters<typeof SimpleView>[0]['setup']> = {}) => ({
  connected: ['claude'] as LLMProvider[], statuses: statuses(['claude']), isChecking: false, missingModels: 0,
  isAutoSetting: false, error: null, onConnect: () => {}, onRefresh: () => {}, onAutoSetup: () => {}, ...over,
});

const renderView = (over: Partial<Parameters<typeof SimpleView>[0]> = {}) => render(
  <SimpleView
    office={office('finance')}
    projectId="toko"
    divisions={[division('data', 'Data Prep')]}
    cases={[]}
    selectedCaseId={null}
    tasks={[]}
    messages={[]}
    setup={baseSetup()}
    onSubmitWork={async () => {}}
    onAnswer={async () => {}}
    onSelectCase={() => {}}
    onShowTeam={() => {}}
    {...over}
  />,
);

test('with no AI connected the view walks through connecting one, and the job cannot be sent yet', () => {
  const connected: LLMProvider[] = [];
  renderView({ setup: baseSetup({ connected, statuses: statuses(connected), onConnect: (provider) => connected.push(provider) }) });
  assert.ok(screen.getByTestId('office-simple-connect'));
  assert.ok(screen.getByText(/A login window opens/));
  assert.equal((screen.getByTestId('office-simple-send') as HTMLButtonElement).disabled, true);
  fireEvent.click(screen.getAllByRole('button', { name: 'Connect' })[0]);
  assert.deepEqual(connected, ['claude']);
});

test('once connected, an example fills the job and sending hands the list items to the team', async () => {
  const sent: string[][] = [];
  renderView({ onSubmitWork: async (items) => { sent.push(items); } });
  assert.ok(screen.getByTestId('office-simple-ready'));
  assert.ok(screen.getByTestId('office-simple-materials'), 'finance work asks for material');
  fireEvent.click(screen.getByRole('button', { name: /Build this month's sales report/ }));
  fireEvent.click(screen.getByTestId('office-simple-send'));
  await waitFor(() => assert.equal(sent.length, 1));
  assert.match(sent[0][0], /sales report/);

  fireEvent.change(screen.getByRole('textbox', { name: 'Write your job' }), { target: { value: '- one\n- two' } });
  fireEvent.click(screen.getByTestId('office-simple-send'));
  await waitFor(() => assert.deepEqual(sent[1], ['one', 'two']));
});

test('a coding workspace does not ask for material', () => {
  renderView({ office: office('coding') });
  assert.equal(screen.queryByTestId('office-simple-materials'), null);
});

test('models are prepared automatically while they are missing', () => {
  const calls: string[] = [];
  renderView({ setup: baseSetup({ missingModels: 3, onAutoSetup: () => calls.push('auto') }) });
  assert.ok(screen.getByTestId('office-simple-models'));
  fireEvent.click(screen.getByRole('button', { name: 'Set up automatically' }));
  assert.deepEqual(calls, ['auto']);
});

test('a finished job shows the plain summary, the team steps and the result files with a preview toggle', () => {
  renderView({
    cases: [work({ status: 'done', phase: null, finalSummary: 'Report is ready.' })],
    selectedCaseId: 'c1',
    tasks: [task({ changedFiles: ['hasil/laporan.docx', '/tmp/outside.md'] })],
  });
  assert.equal(screen.getByTestId('office-simple-headline').textContent, 'Done! The results are below.');
  assert.ok(screen.getByText('Report is ready.'));
  assert.ok(screen.getByText('Data Prep'));
  assert.equal(screen.getByText('done').tagName, 'SPAN');
  const files = screen.getByTestId('office-simple-files');
  assert.ok(files.textContent?.includes('hasil/laporan.docx'));
  assert.ok(!files.textContent?.includes('/tmp/outside.md'), 'files outside the folder are left out');
  assert.ok(screen.getByRole('button', { name: 'Download' }));
});

test('a question from the coordinator can be answered right there', async () => {
  const answers: Array<[string, string]> = [];
  const question = { id: 1, caseId: 'c1', taskId: null, fromDivisionId: 'coordinator', toDivisionId: null, kind: 'question', payload: { text: 'Which month?' }, readAt: null, createdAt: NOW } as unknown as OfficeMessage;
  renderView({
    cases: [work({ status: 'waiting_user', waitingReason: 'question' })],
    selectedCaseId: 'c1',
    messages: [question],
    onAnswer: async (caseId, text) => { answers.push([caseId, text]); },
  });
  assert.ok(screen.getByText('Which month?'));
  fireEvent.change(screen.getByRole('textbox', { name: 'Your answer' }), { target: { value: 'September' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send answer' }));
  await waitFor(() => assert.deepEqual(answers, [['c1', 'September']]));
});

test('"see the team" leaves for the full view', () => {
  let opened = 0;
  renderView({ onShowTeam: () => { opened += 1; } });
  fireEvent.click(screen.getByTestId('office-simple-show-team'));
  assert.equal(opened, 1);
});
