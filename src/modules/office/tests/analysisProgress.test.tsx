import assert from 'node:assert/strict';

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, test } from 'vitest';

import { i18n } from '@/modules/i18n';
import AnalysisProgress from '@/modules/office/AnalysisProgress';
import WorkspaceSidebar from '@/modules/office/WorkspaceSidebar';
import AddWorkspaceModal from '@/modules/office/modals/AddWorkspaceModal';
import type { OfficeAnalysis } from '@/shared/types';

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

const analysis = (overrides: Partial<OfficeAnalysis> = {}): OfficeAnalysis => ({
  id: 'a1',
  projectId: 'p1',
  projectName: 'shop',
  projectPath: '/srv/shop',
  provider: 'claude',
  model: 'sonnet',
  status: 'running',
  summary: null,
  divisions: [],
  steps: [
    { id: 's1', type: 'tool', toolName: 'Read', text: 'README.md', timestamp: '2026-09-25T10:00:01.000Z' },
    { id: 's2', type: 'tool', toolName: 'Grep', text: 'express', timestamp: '2026-09-25T10:00:02.000Z' },
  ],
  stepCount: 45,
  sessionId: 'sess-1',
  error: null,
  createdAt: new Date(Date.now() - 83_000).toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

test('progress shows the stage, the elapsed time and what the agent read', () => {
  const opened: string[] = [];
  render(<AnalysisProgress analysis={analysis()} onOpenSession={(id) => opened.push(id)} />);
  assert.equal(screen.getByTestId('office-analysis-progress').getAttribute('data-stage'), 'reading');
  assert.match(screen.getByTestId('office-analysis-elapsed').textContent ?? '', /^1m 2\ds$/);
  assert.ok(screen.getByText('45 steps', { exact: false }));
  assert.ok(screen.getByText('README.md'));
  assert.ok(screen.getByText('… 43 earlier steps'), 'steps beyond the cap are counted');
  fireEvent.click(screen.getByRole('button', { name: 'Open session' }));
  assert.deepEqual(opened, ['sess-1']);
});

test('the sidebar lists background analyses and reopens them', () => {
  const opened: string[] = [];
  render(
    <WorkspaceSidebar
      workspaces={[]}
      workspacesError={null}
      selectedProjectId={null}
      onSelectWorkspace={() => {}}
      onAddWorkspace={() => {}}
      analyses={[analysis(), analysis({ id: 'a2', projectName: 'blog', status: 'done' })]}
      onOpenAnalysis={(id) => opened.push(id)}
      onDismissAnalysis={() => {}}
      onOpenSettings={() => {}}
      onDeleteWorkspace={() => {}}
      divisions={[]}
      selectedDivisionId={null}
      onSelectDivision={() => {}}
    />,
  );
  assert.ok(screen.getByText('Reading the code · 45 steps'));
  assert.ok(screen.getByText('Ready to review'));
  fireEvent.click(screen.getByText('Analysis: blog'));
  assert.deepEqual(opened, ['a2']);
});

test('the dialog follows a background analysis, can be closed, and moves to review when it finishes', () => {
  const closed: boolean[] = [];
  const props = {
    open: true,
    onOpenChange: (open: boolean) => closed.push(open),
    locale: 'en',
    groups: [],
    onConnectProviders: () => {},
    onReady: () => {},
    resumeAnalysisId: 'a1',
  };
  const { rerender } = render(<AddWorkspaceModal {...props} analyses={[analysis()]} />);
  assert.ok(screen.getByTestId('office-analysis-progress'));
  fireEvent.click(screen.getByTestId('office-analysis-background'));
  assert.deepEqual(closed, [false]);

  rerender(
    <AddWorkspaceModal
      {...props}
      analyses={[analysis({ status: 'done', summary: 'A shop.', divisions: [{ name: 'API', slug: 'api', description: '', color: '#123456', agentName: 'Ana', rolePrompt: '' }] })]}
    />,
  );
  assert.ok(screen.getByDisplayValue('A shop.'));
  assert.ok(screen.getByDisplayValue('API'));
  assert.ok(screen.getByRole('button', { name: 'Create workspace' }));
});
