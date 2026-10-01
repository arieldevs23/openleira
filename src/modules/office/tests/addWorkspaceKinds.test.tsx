import assert from 'node:assert/strict';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeAll, test, vi } from 'vitest';

import type * as ApiModule from '@/shared/api';

const prepared: Array<[string, string]> = [];
const created: Array<[string, string, unknown]> = [];

vi.mock('@/modules/project-creation-wizard', () => ({
  WorkspacePathField: ({ value, onChange }: { value: string; onChange: (value: string) => void }) => (
    <input aria-label="Folder" value={value} onChange={(event) => onChange(event.target.value)} />
  ),
  fetchGithubTokenCredentials: async () => [],
  cloneWorkspaceWithProgress: async () => ({}),
}));

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });

vi.mock('@/shared/api', async (importOriginal) => {
  const original = await importOriginal<typeof ApiModule>();
  return {
    ...original,
    api: {
      ...original.api,
      office: {
        ...original.api.office,
        prepareFolder: async (path: string, mode: string) => {
          prepared.push([path, mode]);
          return json({ success: true, data: { projectId: 'p-docs', projectPath: path, projectName: 'docs', hasWorkspace: false } });
        },
        create: async (projectId: string, locale: string, extra: unknown) => {
          created.push([projectId, locale, extra]);
          return json({ success: true, data: {} });
        },
      },
    },
  };
});

const { i18n } = await import('@/modules/i18n');
const { default: AddWorkspaceModal } = await import('@/modules/office/modals/AddWorkspaceModal');

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

test('a finance workspace on an existing folder is created right away with its kind, after a privacy note', async () => {
  const ready: string[] = [];
  render(
    <AddWorkspaceModal
      open
      onOpenChange={() => {}}
      locale="en"
      groups={[]}
      onConnectProviders={() => {}}
      onReady={(projectId) => ready.push(projectId)}
      analyses={[]}
    />,
  );

  fireEvent.click(screen.getByTestId('office-kind-finance'));
  // No git clone and no app analysis outside coding; the data leaves the server, so say so.
  assert.equal(screen.queryByTestId('office-add-github'), null);
  assert.ok(screen.getByTestId('office-kind-privacy').textContent?.includes('AI provider'));

  fireEvent.click(screen.getByTestId('office-add-existing'));
  fireEvent.change(screen.getByRole('textbox', { name: 'Folder' }), { target: { value: '/srv/work/finance' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create workspace' }));

  await waitFor(() => assert.deepEqual(ready, ['p-docs']));
  assert.deepEqual(prepared, [['/srv/work/finance', 'existing']]);
  assert.deepEqual(created, [['p-docs', 'en', { kind: 'finance' }]]);
});

test('every kind is offered, and a custom workspace is built from the teams the user writes', async () => {
  prepared.length = 0;
  created.length = 0;
  const ready: string[] = [];
  render(
    <AddWorkspaceModal
      open
      onOpenChange={() => {}}
      locale="en"
      groups={[]}
      onConnectProviders={() => {}}
      onReady={(projectId) => ready.push(projectId)}
      analyses={[]}
    />,
  );
  assert.equal(screen.getAllByRole('radio').length, 13);
  fireEvent.click(screen.getByTestId('office-kind-custom'));
  fireEvent.click(screen.getByTestId('office-add-new'));
  fireEvent.change(screen.getByRole('textbox', { name: 'Folder' }), { target: { value: '/srv/work/studio' } });
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));

  await waitFor(() => assert.ok(screen.getByTestId('office-custom-team')));
  const names = screen.getAllByRole('textbox', { name: /^Name$|^Team name$/ });
  fireEvent.change(names[0], { target: { value: 'Script Writer' } });
  fireEvent.change(screen.getAllByRole('textbox', { name: 'Role (markdown)' })[0], { target: { value: 'Write 60-second scripts.' } });
  fireEvent.change(screen.getByRole('textbox', { name: 'What should QA check? (optional)' }), { target: { value: 'Max 60 seconds.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create workspace' }));

  await waitFor(() => assert.deepEqual(ready, ['p-docs']));
  assert.deepEqual(prepared, [['/srv/work/studio', 'new']]);
  const [, , extra] = created[0] as [string, string, { kind: string; divisions: Array<{ name: string; rolePrompt: string }>; auditChecks: string }];
  assert.equal(extra.kind, 'custom');
  assert.deepEqual(extra.divisions.map((division) => [division.name, division.rolePrompt]), [['Script Writer', 'Write 60-second scripts.']]);
  assert.equal(extra.auditChecks, 'Max 60 seconds.');
});

