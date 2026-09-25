import assert from 'node:assert/strict';

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, test } from 'vitest';

import { i18n } from '@/modules/i18n';
import ResultFilesPanel from '@/modules/office/ResultFilesPanel';
import WorkspaceSidebar from '@/modules/office/WorkspaceSidebar';
import type { OfficeAnalysis, OfficeDivision, OfficeTask, OfficeWorkspaceSummary } from '@/shared/types';

beforeAll(async () => {
  await i18n.changeLanguage('en');
  window.localStorage.clear();
});

const NOW = '2026-09-25T10:00:00.000Z';

const division = (slug: string, rolePrompt = ''): OfficeDivision => ({
  id: `div-${slug}`,
  officeId: 'o1',
  name: slug,
  slug,
  description: '',
  color: '#2551BD',
  sortOrder: 0,
  isCoordinator: false,
  isAudit: false,
  createdAt: NOW,
  position: null,
  agent: {
    id: `agent-${slug}`, divisionId: `div-${slug}`, name: `Agent ${slug}`, rolePrompt,
    provider: 'claude', model: 'sonnet', allowedTools: [], skills: [], enabled: true, updatedAt: NOW,
  },
});

const workspace = (projectId: string, name: string, activeCases = 0): OfficeWorkspaceSummary => ({
  office: {
    id: `office-${projectId}`, projectPath: `/srv/${projectId}`, name, locale: 'en', maxParallel: 2,
    permissionMode: 'bypassPermissions', permissionWarningAcknowledged: true, createdAt: NOW, updatedAt: NOW,
  },
  projectId,
  projectName: projectId,
  activeCases,
  totalCases: 3,
});

const renderSidebar = (overrides: {
  onSelectWorkspace?: (id: string) => void;
  analyses?: OfficeAnalysis[];
  onOpenAnalysis?: (id: string) => void;
} = {}) => render(
  <WorkspaceSidebar
    workspaces={[workspace('shop', 'Shop team', 1), workspace('blog', 'Blog team')]}
    workspacesError={null}
    selectedProjectId="shop"
    onSelectWorkspace={overrides.onSelectWorkspace ?? (() => {})}
    onAddWorkspace={() => {}}
    analyses={overrides.analyses ?? []}
    onOpenAnalysis={overrides.onOpenAnalysis ?? (() => {})}
    onDismissAnalysis={() => {}}
    onOpenSettings={() => {}}
    onDeleteWorkspace={() => {}}
    cases={[]}
    divisions={[division('backend', '## Owns\n- `server/`'), division('docs')]}
    selectedCaseId={null}
    onSelectCase={() => {}}
    onCreateCase={async () => {}}
    selectedDivisionId={null}
    onSelectDivision={() => {}}
  />,
);

test('the workspace sidebar lists every workspace and switches between them', () => {
  const picked: string[] = [];
  renderSidebar({ onSelectWorkspace: (id) => picked.push(id) });
  assert.ok(screen.getByText('Shop team'));
  assert.ok(screen.getByText('/srv/blog'));
  fireEvent.click(screen.getByText('Blog team'));
  assert.deepEqual(picked, ['blog']);
});

test('sidebar groups fold, and an agent unfolds to show its role as markdown', () => {
  renderSidebar();
  const agents = screen.getByTestId('office-sidebar-agents');
  assert.equal(agents.getAttribute('data-open'), 'true');

  fireEvent.click(screen.getByRole('button', { name: "Show Agent backend's role" }));
  assert.ok(screen.getByRole('heading', { name: 'Owns' }), 'the role renders as markdown');

  fireEvent.click(screen.getByRole('button', { name: /^Agents/ }));
  assert.equal(screen.getByTestId('office-sidebar-agents').getAttribute('data-open'), 'false');
  assert.equal(screen.queryByText('Agent docs'), null);
});

test('the result files panel says where the work was saved and shows the changed files as a tree', () => {
  const task = (ref: string, divisionId: string, changedFiles: string[]) => ({
    id: ref, ref, divisionId, changedFiles,
  }) as unknown as OfficeTask;
  render(
    <ResultFilesPanel
      projectId="shop"
      projectPath="/srv/shop"
      tasks={[task('T1', 'div-backend', ['server/app.ts', 'README.md']), task('T2', 'div-docs', ['README.md', '/tmp/notes.md'])]}
      divisions={[division('backend'), division('docs')]}
    />,
  );
  assert.equal(screen.getByTestId('office-result-folder').textContent, '/srv/shop');
  assert.ok(screen.getByText('3 files changed'));
  assert.ok(screen.getByRole('button', { name: /server/ }));
  assert.ok(screen.getByText('app.ts'));
  assert.ok(screen.getByText('Outside the folder'));

  fireEvent.click(screen.getByRole('button', { name: /server/ }));
  assert.equal(screen.queryByText('app.ts'), null, 'a folder folds');
});
