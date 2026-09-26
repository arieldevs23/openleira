import assert from 'node:assert/strict';

import { render, screen } from '@testing-library/react';
import { test, vi } from 'vitest';

vi.mock('@/modules/plugins', () => ({
  usePlugins: () => ({ plugins: [] }),
  PluginIcon: () => null,
}));

const { default: WorkspaceTabs } = await import('@/modules/project-workspace/WorkspaceTabs');

const renderTabs = (shouldShowChatTab: boolean) => render(
  <WorkspaceTabs
    activeTab="files"
    setActiveTab={() => {}}
    shouldShowTasksTab={false}
    shouldShowBrowserTab={false}
    shouldShowChatTab={shouldShowChatTab}
  />,
);

test('a project has no chat tab: it is prompted only through its canvas', () => {
  renderTabs(false);
  assert.equal(screen.queryByRole('tab', { name: /chat/i }) ?? screen.queryByRole('button', { name: /chat/i }), null);
  assert.ok(screen.queryByRole('tab', { name: /files/i }) ?? screen.queryByRole('button', { name: /files/i }));
});

test('the free-chat workspace keeps its chat tab', () => {
  renderTabs(true);
  assert.ok(screen.queryByRole('tab', { name: /chat/i }) ?? screen.queryByRole('button', { name: /chat/i }));
});
