import assert from 'node:assert/strict';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeAll, test, vi } from 'vitest';

import type * as ApiModule from '@/shared/api';

const cloneCalls: Array<Record<string, unknown>> = [];
const prepared: Array<[string, string]> = [];

vi.mock('@/modules/project-creation-wizard', () => ({
  WorkspacePathField: ({ value, onChange }: { value: string; onChange: (value: string) => void }) => (
    <input aria-label="Folder" value={value} onChange={(event) => onChange(event.target.value)} />
  ),
  fetchGithubTokenCredentials: async () => [{ id: 7, credential_name: 'work token', is_active: true }],
  cloneWorkspaceWithProgress: async (params: Record<string, unknown>, handlers: { onProgress: (line: string) => void }) => {
    cloneCalls.push(params);
    handlers.onProgress('Receiving objects: 100%');
    return { projectId: 'p-shop', path: '/srv/work/shop' };
  },
}));

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
          return new Response(JSON.stringify({ success: true, data: { projectId: 'p-shop', projectPath: path, projectName: 'shop', hasWorkspace: false } }), {
            status: 200, headers: { 'content-type': 'application/json' },
          });
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

test('a workspace can start from a GitHub repository cloned with a stored token', async () => {
  render(
    <AddWorkspaceModal
      open
      onOpenChange={() => {}}
      locale="en"
      groups={[]}
      onConnectProviders={() => {}}
      onReady={() => {}}
      analyses={[]}
    />,
  );
  fireEvent.click(screen.getByTestId('office-add-github'));
  fireEvent.change(screen.getByRole('textbox', { name: 'Repository URL' }), { target: { value: 'https://github.com/acme/shop' } });
  fireEvent.change(screen.getByRole('textbox', { name: 'Folder' }), { target: { value: '/srv/work' } });
  await waitFor(() => assert.ok(screen.getByRole('option', { name: 'work token' })));
  fireEvent.change(screen.getByRole('combobox', { name: 'Access' }), { target: { value: '7' } });
  fireEvent.click(screen.getByRole('button', { name: 'Clone' }));

  await waitFor(() => assert.equal(prepared.length, 1));
  assert.equal(cloneCalls[0].githubUrl, 'https://github.com/acme/shop');
  assert.equal(cloneCalls[0].tokenMode, 'stored');
  assert.equal(cloneCalls[0].selectedGithubToken, '7');
  assert.deepEqual(prepared[0], ['/srv/work/shop', 'existing']);
  // The clone continues like an existing app: analyse it or use the default teams.
  await waitFor(() => assert.ok(screen.getByText(/default/i)));
});
