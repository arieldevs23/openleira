import assert from 'node:assert/strict';

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, test } from 'vitest';

import { i18n } from '@/modules/i18n';
import WorkspaceSettingsTab from '@/modules/settings/tabs/WorkspaceSettingsTab';
import { OFFICE_CHAT_DOCK_STORAGE_KEY, OFFICE_COLLAPSED_PANELS_STORAGE_KEY } from '@/shared/constants';
import type { SettingsMainTab } from '@/shared/types';

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

test('the Node Design tab sets the canvas chat dock, shows the panels again and links to the GitHub tokens', () => {
  window.localStorage.setItem(OFFICE_COLLAPSED_PANELS_STORAGE_KEY, JSON.stringify({ left: true, right: true }));
  const opened: SettingsMainTab[] = [];
  render(<WorkspaceSettingsTab onOpenTab={(tab) => opened.push(tab)} />);

  fireEvent.change(screen.getByRole('combobox', { name: 'Work chat' }), { target: { value: 'hidden' } });
  assert.equal(window.localStorage.getItem(OFFICE_CHAT_DOCK_STORAGE_KEY), 'hidden');

  fireEvent.click(screen.getByRole('button', { name: 'Show both' }));
  assert.equal(window.localStorage.getItem(OFFICE_COLLAPSED_PANELS_STORAGE_KEY), null);

  fireEvent.click(screen.getByRole('button', { name: 'Manage in Git' }));
  assert.deepEqual(opened, ['git']);
  assert.ok(screen.getByText('Select an area'));
});
