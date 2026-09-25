import assert from 'node:assert/strict';

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, test } from 'vitest';

import { i18n } from '@/modules/i18n';
import ModelWizardModal from '@/modules/office/modals/ModelWizardModal';
import type { LLMProvider, OfficeDivision, OfficeModelGroup, ProviderAuthStatus, ProviderAuthStatusMap } from '@/shared/types';

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

const NOW = '2026-09-25T10:00:00.000Z';

const status = (authenticated: boolean, email: string | null = null): ProviderAuthStatus => ({
  authenticated, email, method: null, error: null, loading: false,
});

function division(slug: string, provider: LLMProvider | null = null, model: string | null = null): OfficeDivision {
  return {
    id: `div-${slug}`,
    officeId: 'office-1',
    name: slug,
    slug,
    description: '',
    color: '#2551BD',
    sortOrder: 0,
    isCoordinator: false,
    isAudit: false,
    createdAt: NOW,
    agent: {
      id: `agent-${slug}`,
      divisionId: `div-${slug}`,
      name: `Agent ${slug}`,
      rolePrompt: '',
      provider,
      model,
      allowedTools: [],
      skills: [],
      enabled: true,
      updatedAt: NOW,
    },
  };
}

const CLAUDE_GROUP: OfficeModelGroup = {
  provider: 'claude',
  options: [{ value: 'sonnet', label: 'Sonnet' }],
} as OfficeModelGroup;

function renderWizard(props: {
  statuses: ProviderAuthStatusMap;
  connected: LLMProvider[];
  groups: OfficeModelGroup[];
  divisions?: OfficeDivision[];
  onConnect?: (provider: LLMProvider) => void;
}) {
  return render(
    <ModelWizardModal
      open
      onOpenChange={() => {}}
      divisions={props.divisions ?? [division('backend')]}
      groups={props.groups}
      providerStatuses={props.statuses}
      connectedProviders={props.connected}
      isCheckingProviders={false}
      onConnectProvider={props.onConnect ?? (() => {})}
      onRefreshProviders={() => {}}
      onSave={async () => {}}
    />,
  );
}

test('with no provider logged in the wizard starts on the connect step and cannot move on', () => {
  const connects: LLMProvider[] = [];
  renderWizard({
    statuses: { claude: status(false), codex: status(false), cursor: status(false), opencode: status(false) },
    connected: [],
    groups: [],
    onConnect: (provider) => connects.push(provider),
  });

  assert.ok(screen.getByText('Connect an AI provider'));
  for (const provider of ['claude', 'codex', 'cursor', 'opencode']) {
    assert.equal(screen.getByTestId(`office-provider-${provider}`).getAttribute('data-connected'), 'false');
  }
  assert.equal((screen.getByRole('button', { name: 'Next' }) as HTMLButtonElement).disabled, true);
  assert.equal((screen.getByRole('button', { name: /Pick models/ }) as HTMLButtonElement).disabled, true);

  fireEvent.click(screen.getAllByRole('button', { name: 'Connect' })[1]);
  assert.deepEqual(connects, ['codex']);
});

test('a connected provider skips straight to the models, which only list connected providers', () => {
  renderWizard({
    statuses: { claude: status(true, 'me@example.com'), codex: status(false), cursor: status(false), opencode: status(false) },
    connected: ['claude'],
    groups: [CLAUDE_GROUP],
    divisions: [division('backend'), division('docs', 'codex', 'gpt-5')],
  });

  assert.ok(screen.getByText('Pick a model for every agent'));
  const backend = screen.getByRole('combobox', { name: 'Model for backend' });
  const groups = [...backend.querySelectorAll('optgroup')].map((group) => group.getAttribute('label'));
  assert.deepEqual(groups, ['Claude']);

  // A model already stored on a logged-out provider stays, flagged as not connected.
  const docs = screen.getByRole('combobox', { name: 'Model for docs' }) as HTMLSelectElement;
  assert.match(docs.selectedOptions[0].textContent ?? '', /Codex · gpt-5 \(not connected\)/);

  // The connect step is still one click away and shows who is logged in.
  fireEvent.click(screen.getByRole('button', { name: /Connect providers/ }));
  assert.equal(screen.getByTestId('office-provider-claude').getAttribute('data-connected'), 'true');
  assert.ok(screen.getByText('Connected as me@example.com'));
});
