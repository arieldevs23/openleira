import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { closeConnection, initializeDatabase, officeCasesDb, projectsDb } from '@/modules/database/index.js';
import { officeService } from '@/modules/office/services/office.service.js';
import { providerModelsService } from '@/modules/providers/index.js';
import type { LLMProvider, ProviderAuthStatus } from '@/shared/types.js';
import { AppError } from '@/shared/utils.js';

async function withProject(run: (projectId: string) => Promise<void>): Promise<void> {
  const previousDatabasePath = process.env.DATABASE_PATH;
  const directory = await mkdtemp(path.join(tmpdir(), 'office-service-'));
  closeConnection();
  process.env.DATABASE_PATH = path.join(directory, 'auth.db');
  await initializeDatabase();
  try {
    const { project } = projectsDb.createProjectPath(path.join(directory, 'shop'));
    assert.ok(project);
    await run(project.project_id);
  } finally {
    closeConnection();
    if (previousDatabasePath === undefined) {
      delete process.env.DATABASE_PATH;
    } else {
      process.env.DATABASE_PATH = previousDatabasePath;
    }
    await rm(directory, { recursive: true, force: true });
  }
}

const rejectsWith = (code: string) => (error: unknown) => {
  assert.ok(error instanceof AppError, String(error));
  assert.equal(error.code, code);
  return true;
};

test('creating an office seeds the coordinator, six divisions and the audit layer, all without a model', async () => {
  await withProject(async (projectId) => {
    assert.equal(officeService.getSnapshotForProject(projectId), null);
    const snapshot = officeService.createOffice({ projectId, locale: 'id' });

    assert.equal(snapshot.office.name, 'kantor shop');
    assert.equal(snapshot.office.maxParallel, 2);
    assert.equal(snapshot.office.permissionMode, 'bypassPermissions');
    assert.deepEqual(snapshot.divisions.map((division) => division.slug), [
      'coordinator', 'planner', 'designer', 'backend', 'frontend', 'security', 'docs', 'audit',
    ]);
    assert.equal(snapshot.divisions.filter((division) => division.isCoordinator).length, 1);
    assert.equal(snapshot.divisions.filter((division) => division.isAudit).length, 1);
    assert.ok(snapshot.divisions.every((division) => division.agent.model === null && division.agent.rolePrompt));
    assert.equal(officeService.findAgentsMissingModel(snapshot.office.id).length, 8);
    assert.equal(officeService.getSnapshotForProject(projectId)?.office.id, snapshot.office.id);

    assert.throws(() => officeService.createOffice({ projectId, locale: 'id' }), rejectsWith('OFFICE_ALREADY_EXISTS'));
  });
});

test('divisions get unique slugs, and the coordinator and audit layer cannot be deleted', async () => {
  await withProject(async (projectId) => {
    const { office, divisions } = officeService.createOffice({ projectId, locale: 'en' });
    const first = officeService.createDivision(office.id, { name: 'Data & ML' });
    const second = officeService.createDivision(office.id, { name: 'Data ML', color: '#123456' });
    assert.equal(first.slug, 'data-ml');
    assert.equal(second.slug, 'data-ml-2');
    assert.equal(first.color, '#2551BD');
    assert.equal(first.sortOrder, divisions.length);

    assert.throws(() => officeService.createDivision(office.id, { name: 'x', color: 'red' }), rejectsWith('INVALID_OFFICE_INPUT'));
    assert.throws(() => officeService.createDivision(office.id, { name: '  ' }), rejectsWith('INVALID_OFFICE_INPUT'));

    const coordinator = divisions.find((division) => division.isCoordinator);
    const audit = divisions.find((division) => division.isAudit);
    assert.ok(coordinator && audit);
    assert.throws(() => officeService.deleteDivision(office.id, coordinator.id), rejectsWith('OFFICE_DIVISION_PROTECTED'));
    assert.throws(() => officeService.deleteDivision(office.id, audit.id), rejectsWith('OFFICE_DIVISION_PROTECTED'));

    officeService.deleteDivision(office.id, second.id);
    assert.ok(!officeService.getSnapshot(office.id).divisions.some((division) => division.id === second.id));
  });
});

test('agent models must come from the provider catalog; the wizard applies all or nothing', async () => {
  await withProject(async (projectId) => {
    const { office, divisions } = officeService.createOffice({ projectId, locale: 'en' });
    const backend = divisions.find((division) => division.slug === 'backend');
    assert.ok(backend);

    await assert.rejects(
      officeService.updateAgent(office.id, backend.agent.id, { model: { provider: 'claude', model: 'gpt-9000' } }),
      rejectsWith('OFFICE_INVALID_MODEL'),
    );
    await assert.rejects(
      officeService.updateAgent(office.id, backend.agent.id, { model: { provider: 'acme', model: 'x' } }),
      rejectsWith('OFFICE_INVALID_PROVIDER'),
    );

    const updated = await officeService.updateAgent(office.id, backend.agent.id, {
      model: { provider: 'claude', model: 'default' },
      allowedTools: ['Read', 'Read', ' Grep '],
      skills: ['review'],
    });
    assert.equal(updated.agent.provider, 'claude');
    assert.equal(updated.agent.model, 'default');
    assert.deepEqual(updated.agent.allowedTools, ['Read', 'Grep']);

    const cleared = await officeService.updateAgent(office.id, backend.agent.id, { model: null });
    assert.equal(cleared.agent.model, null);
    assert.equal(cleared.agent.provider, null);

    await assert.rejects(officeService.assignModels(office.id, [
      { agentId: divisions[0].agent.id, provider: 'claude', model: 'default' },
      { agentId: divisions[1].agent.id, provider: 'claude', model: 'nope' },
    ]), rejectsWith('OFFICE_INVALID_MODEL'));
    assert.equal(officeService.findAgentsMissingModel(office.id).length, 8, 'a bad row changes nothing');

    await officeService.assignModels(office.id, divisions.map((division) => ({
      agentId: division.agent.id,
      provider: 'claude',
      model: 'default',
    })));
    assert.equal(officeService.findAgentsMissingModel(office.id).length, 0);
  });
});

test('a case cannot run while an agent sits on a provider that is not logged in', async () => {
  await withProject(async (projectId) => {
    const { office, divisions } = officeService.createOffice({ projectId, locale: 'en' });
    const status = (provider: LLMProvider, authenticated: boolean, installed = true): ProviderAuthStatus => ({
      provider, installed, authenticated, email: null, method: null,
    });

    // Agents without a model use no provider, so there is nothing to check yet.
    await officeService.requireConnectedProviders(office.id, async () => {
      throw new Error('no provider should be checked');
    });

    await officeService.assignModels(office.id, divisions.map((division) => ({
      agentId: division.agent.id,
      provider: 'claude',
      model: 'default',
    })));
    const codexModel = (await providerModelsService.getProviderModels('codex')).OPTIONS[0]?.value;
    assert.ok(codexModel, 'the codex catalog lists at least one model');
    await officeService.updateAgent(office.id, divisions[1].agent.id, { model: { provider: 'codex', model: codexModel } });

    const checked: LLMProvider[] = [];
    await assert.rejects(
      officeService.requireConnectedProviders(office.id, async (provider) => {
        checked.push(provider);
        return status(provider, provider === 'claude');
      }),
      (error: unknown) => {
        rejectsWith('OFFICE_PROVIDERS_NOT_CONNECTED')(error);
        assert.deepEqual((error as AppError).details, { providers: ['codex'] });
        return true;
      },
    );
    assert.deepEqual(checked.sort(), ['claude', 'codex'], 'each provider is checked once');

    // Not installed counts as not connected, and so does a failing status check.
    await assert.rejects(
      officeService.requireConnectedProviders(office.id, async (provider) => status(provider, true, provider !== 'claude')),
      rejectsWith('OFFICE_PROVIDERS_NOT_CONNECTED'),
    );
    await assert.rejects(
      officeService.requireConnectedProviders(office.id, async () => {
        throw new Error('cli missing');
      }),
      rejectsWith('OFFICE_PROVIDERS_NOT_CONNECTED'),
    );

    await officeService.requireConnectedProviders(office.id, async (provider) => status(provider, true));
  });
});

test('only draft cases can be edited, and running cases cannot be deleted', async () => {
  await withProject(async (projectId) => {
    const { office } = officeService.createOffice({ projectId, locale: 'en' });
    const created = officeService.createCase(office.id, { title: '  Checkout  ', description: 'Add checkout', createdBy: '1' });
    assert.equal(created.title, 'Checkout');
    assert.equal(created.status, 'draft');
    assert.equal(officeService.updateCase(office.id, created.id, { title: 'Checkout v2' }).title, 'Checkout v2');

    officeCasesDb.updateCase(created.id, { status: 'running' });
    assert.throws(() => officeService.updateCase(office.id, created.id, { title: 'x' }), rejectsWith('OFFICE_CASE_NOT_DRAFT'));
    assert.throws(() => officeService.deleteCase(office.id, created.id), rejectsWith('OFFICE_CASE_ACTIVE'));

    officeCasesDb.updateCase(created.id, { status: 'done' });
    officeService.deleteCase(office.id, created.id);
    assert.equal(officeCasesDb.getCase(created.id), null);
    assert.throws(() => officeService.getCaseDetail(office.id, created.id), rejectsWith('OFFICE_CASE_NOT_FOUND'));
  });
});
