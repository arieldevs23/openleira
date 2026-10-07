import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { closeConnection, initializeDatabase, officeCasesDb, officesDb, projectsDb, sessionsDb } from '@/modules/database/index.js';
import { officeService } from '@/modules/office/services/office.service.js';
import { providerModelsService, sessionsService } from '@/modules/providers/index.js';
import type { LLMProvider, OfficeDivision, ProviderAuthStatus } from '@/shared/types.js';
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

test('each workspace kind seeds its own teams and flow; coding stays the default', async () => {
  await withProject(async (projectId) => {
    const expected = {
      content: ['coordinator', 'research', 'copywriter', 'social', 'visual', 'audit'],
      finance: ['coordinator', 'data', 'analyst', 'report', 'audit'],
      admin: ['coordinator', 'sorter', 'forms', 'archive', 'audit'],
    } as const;
    for (const [kind, slugs] of Object.entries(expected)) {
      const snapshot = officeService.createOffice({ projectId, locale: 'en', kind });
      assert.equal(snapshot.office.kind, kind);
      assert.deepEqual(snapshot.divisions.map((division) => division.slug), slugs);
      assert.ok(snapshot.flow.length > 0);
      const audit = snapshot.divisions.find((division) => division.isAudit);
      assert.doesNotMatch(audit?.agent.rolePrompt ?? '', /git diff/);
      officeService.deleteOffice(snapshot.office.id);
    }

    // Finance: data → analyst → report.
    const finance = officeService.createOffice({ projectId, locale: 'id', kind: 'finance' });
    const slugOf = new Map(finance.divisions.map((division) => [division.id, division.slug]));
    assert.deepEqual(finance.flow.map((edge) => `${slugOf.get(edge.fromDivisionId)}>${slugOf.get(edge.toDivisionId)}`).sort(), ['analyst>report', 'data>analyst']);
    officeService.deleteOffice(finance.office.id);

    assert.throws(() => officeService.createOffice({ projectId, locale: 'en', kind: 'poetry' }), rejectsWith('INVALID_OFFICE_INPUT'));
    // Teams proposed by an app analysis always make a coding workspace.
    const analysed = officeService.createOffice({
      projectId,
      locale: 'en',
      kind: 'content',
      divisions: [{ name: 'API', slug: 'api', description: '', color: '#123456', agentName: 'Ana', rolePrompt: 'owns /api' }],
    });
    assert.equal(analysed.office.kind, 'coding');
    officeService.deleteOffice(analysed.office.id);

    assert.equal(officeService.createOffice({ projectId, locale: 'en' }).office.kind, 'coding');
  });
});

test('every built-in kind seeds working teams, a flow and its own QA role', async () => {
  await withProject(async (projectId) => {
    for (const kind of ['research', 'education', 'support', 'hr', 'legal', 'ecommerce', 'translation', 'project']) {
      const snapshot = officeService.createOffice({ projectId, locale: 'id', kind });
      assert.equal(snapshot.office.kind, kind);
      const workers = snapshot.divisions.filter((division) => !division.isCoordinator && !division.isAudit);
      assert.ok(workers.length >= 3, `${kind} has teams`);
      assert.ok(snapshot.flow.length > 0, `${kind} has a flow`);
      assert.ok(workers.every((division) => division.agent.rolePrompt.includes('hasil/')), `${kind} teams save to hasil/`);
      const audit = snapshot.divisions.find((division) => division.isAudit);
      assert.doesNotMatch(audit?.agent.rolePrompt ?? '', /git diff/);
      officeService.deleteOffice(snapshot.office.id);
    }
  });
});

test('a custom workspace is built from the teams the user wrote, with their QA checks on the audit role', async () => {
  await withProject(async (projectId) => {
    assert.throws(() => officeService.createOffice({ projectId, locale: 'en', kind: 'custom' }), rejectsWith('INVALID_OFFICE_INPUT'));
    const snapshot = officeService.createOffice({
      projectId,
      locale: 'en',
      kind: 'custom',
      divisions: [
        { name: 'Script Writer', slug: '', description: 'writes video scripts', color: '#2551BD', agentName: 'Tia', rolePrompt: 'Write 60-second scripts.' },
        { name: 'Thumbnail Brief', slug: '', description: '', color: 'nope', agentName: '', rolePrompt: '' },
      ],
      auditChecks: 'Every script is at most 60 seconds.',
    });
    assert.equal(snapshot.office.kind, 'custom');
    assert.deepEqual(snapshot.divisions.map((division) => division.slug), ['coordinator', 'script-writer', 'thumbnail-brief', 'audit']);
    const audit = snapshot.divisions.find((division) => division.isAudit);
    assert.match(audit?.agent.rolePrompt ?? '', /What the user wants checked\nEvery script is at most 60 seconds\./);
    assert.doesNotMatch(audit?.agent.rolePrompt ?? '', /git diff/);
    assert.doesNotMatch(snapshot.divisions[0].agent.rolePrompt, /write code/);
    assert.equal(snapshot.flow.length, 0, 'the coordinator decides the order of a custom team');
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

test('flow arrows join worker divisions only and never loop; node positions are stored', async () => {
  await withProject(async (projectId) => {
    const { office, divisions } = officeService.createOffice({ projectId, locale: 'en' });
    const bySlug = (slug: string) => divisions.find((division) => division.slug === slug)?.id as string;
    const slugOf = (id: string) => divisions.find((division) => division.id === id)?.slug;

    // A new workspace starts with coordinator → planner → teams, not everyone in parallel.
    const seeded = officeService.getSnapshot(office.id).flow.map((edge) => `${slugOf(edge.fromDivisionId)}>${slugOf(edge.toDivisionId)}`).sort();
    assert.deepEqual(seeded, [
      'backend>security', 'designer>frontend', 'planner>backend', 'planner>designer', 'planner>docs', 'planner>frontend', 'planner>security',
    ]);
    for (const edge of officeService.getSnapshot(office.id).flow) {
      officeService.deleteFlowEdge(office.id, edge.fromDivisionId, edge.toDivisionId);
    }

    officeService.addFlowEdge(office.id, bySlug('planner'), bySlug('backend'));
    const flow = officeService.addFlowEdge(office.id, bySlug('backend'), bySlug('docs'));
    assert.deepEqual(flow.map((edge) => [edge.fromDivisionId, edge.toDivisionId]), [
      [bySlug('planner'), bySlug('backend')],
      [bySlug('backend'), bySlug('docs')],
    ]);
    assert.equal(officeService.getSnapshot(office.id).flow.length, 2);

    assert.throws(() => officeService.addFlowEdge(office.id, bySlug('docs'), bySlug('planner')), rejectsWith('OFFICE_FLOW_CYCLE'));
    assert.throws(() => officeService.addFlowEdge(office.id, bySlug('coordinator'), bySlug('planner')), rejectsWith('OFFICE_FLOW_PROTECTED'));
    assert.throws(() => officeService.addFlowEdge(office.id, bySlug('docs'), bySlug('docs')), rejectsWith('OFFICE_FLOW_SELF'));

    // Deleting a division takes its arrows with it.
    officeService.deleteDivision(office.id, bySlug('backend'));
    assert.deepEqual(officeService.getSnapshot(office.id).flow, []);

    const moved = officeService.updateDivision(office.id, bySlug('docs'), { position: { x: 120.4, y: -40 } });
    assert.deepEqual(moved.position, { x: 120, y: -40 });
    assert.equal(officeService.updateDivision(office.id, bySlug('docs'), { position: null }).position, null);
    assert.throws(
      () => officeService.updateDivision(office.id, bySlug('docs'), { position: { x: Number.NaN, y: 0 } }),
      rejectsWith('INVALID_OFFICE_INPUT'),
    );

    const custom = officeService.createDivision(office.id, {
      name: 'Data',
      agentName: 'Dewi',
      rolePrompt: 'You own the analytics pipeline.',
      position: { x: 10, y: 20 },
    });
    assert.equal(custom.agent.name, 'Dewi');
    assert.equal(custom.agent.rolePrompt, 'You own the analytics pipeline.');
    assert.deepEqual(custom.position, { x: 10, y: 20 });
  });
});

test('a workspace can be built from reviewed proposals and listed with its project', async () => {
  await withProject(async (projectId) => {
    const snapshot = officeService.createOffice({
      projectId,
      locale: 'id',
      appSummary: 'Toko online Next.js dengan Prisma.',
      divisions: [
        { name: 'Storefront', slug: 'storefront', description: 'halaman toko', color: '#123456', agentName: 'Rina', rolePrompt: 'urus UI toko' },
        { name: 'Audit', slug: 'audit', description: 'nama bentrok', color: 'not-a-color', agentName: '', rolePrompt: '' },
      ],
    });
    assert.deepEqual(snapshot.divisions.map((division) => division.slug), ['coordinator', 'storefront', 'audit-2', 'audit']);
    const coordinator = snapshot.divisions[0];
    assert.ok(coordinator.agent.rolePrompt.includes('## Tentang aplikasi ini\nToko online Next.js dengan Prisma.'));
    assert.equal(snapshot.divisions[2].color, '#2551BD', 'a bad color falls back to the default');
    assert.equal(snapshot.divisions[2].agent.name, 'Audit', 'an empty agent name takes the division name');

    const [summary] = officeService.listWorkspaces();
    assert.equal(summary.office.id, snapshot.office.id);
    assert.equal(summary.projectId, projectId);
    assert.equal(summary.projectName, 'shop');
    assert.equal(summary.totalCases, 0);

    officeService.deleteOffice(snapshot.office.id);
    assert.deepEqual(officeService.listWorkspaces(), []);
  });
});

test('case usage sums the coordinator, task and audit sessions; unreadable ones count as zero', async () => {
  await withProject(async (projectId) => {
    const { office, divisions } = officeService.createOffice({ projectId, locale: 'en' });
    const caseItem = officeService.createCase(office.id, { title: 'Login', createdBy: null });
    officeCasesDb.updateCase(caseItem.id, { coordinatorSessionId: 'coord' });
    const [created] = officeCasesDb.createTasks(caseItem.id, [{
      id: 't1', divisionId: divisions[1].id, parentTaskId: null, ref: 'T1', title: 'x', instruction: '', dependsOn: [], status: 'done',
    }]);
    officeCasesDb.updateTask(created.id, { sessionId: 'work', auditSessionId: 'gone' });

    const usage = await officeService.getCaseUsage(office.id, caseItem.id, async (sessionId) => {
      if (sessionId === 'gone') {
        throw new Error('transcript deleted');
      }
      return sessionId === 'coord'
        ? { inputTokens: 100, outputTokens: 20, cacheTokens: 1000 }
        : { inputTokens: 50, outputTokens: 10, cacheReadTokens: 5, cacheCreationTokens: 5 };
    });
    assert.deepEqual(usage.sessions.map((session) => [session.role, session.total]), [['coordinator', 1120], ['task', 70], ['audit', 0]]);
    assert.equal(usage.total, 1190);
    assert.equal(usage.cacheTokens, 1010);
    assert.equal(usage.sessions[1].divisionId, divisions[1].id);
  });
});

test('a workspace folder is either a fresh empty folder or an existing one, registered as a project once', async () => {
  await withProject(async (projectId) => {
    const existingPath = projectsDb.getProjectPathById(projectId) as string;
    const created: string[] = [];
    const folders: Record<string, string[] | null> = { '/srv/new-app': null, '/srv/busy': ['index.js'], [existingPath]: ['README.md'] };
    const dependencies = {
      validatePath: async (requested: string) => ({ valid: true, resolvedPath: requested }),
      readFolder: async (folderPath: string) => folders[folderPath] ?? null,
      createProject: async (folderPath: string) => {
        created.push(folderPath);
        projectsDb.createProjectPath(folderPath);
      },
    };

    const fresh = await officeService.prepareFolder({ path: '/srv/new-app', mode: 'new' }, dependencies);
    assert.equal(fresh.projectName, 'new-app');
    assert.equal(fresh.hasWorkspace, false);
    assert.deepEqual(created, ['/srv/new-app']);

    await assert.rejects(officeService.prepareFolder({ path: '/srv/busy', mode: 'new' }, dependencies), rejectsWith('OFFICE_FOLDER_NOT_EMPTY'));
    await assert.rejects(officeService.prepareFolder({ path: '/srv/nothing', mode: 'existing' }, dependencies), rejectsWith('OFFICE_FOLDER_MISSING'));
    await assert.rejects(
      officeService.prepareFolder({ path: 'x', mode: 'existing' }, { ...dependencies, validatePath: async () => ({ valid: false, error: 'outside the workspace root' }) }),
      rejectsWith('OFFICE_FOLDER_INVALID'),
    );

    // A folder that already is a project is reused, and says whether it has a workspace.
    officeService.createOffice({ projectId, locale: 'en' });
    const existing = await officeService.prepareFolder({ path: existingPath, mode: 'existing' }, dependencies);
    assert.equal(existing.projectId, projectId);
    assert.equal(existing.hasWorkspace, true);
    assert.deepEqual(created, ['/srv/new-app'], 'no second project row');
  });
});

test('an agent has a skill exactly when it is linked to that skill on the canvas', async () => {
  await withProject(async (projectId) => {
    const { office, divisions } = officeService.createOffice({ projectId, locale: 'en' });
    const backend = divisions.find((division) => division.slug === 'backend') as OfficeDivision;
    const docs = divisions.find((division) => division.slug === 'docs') as OfficeDivision;
    const agentSkills = (divisionId: string) => officeService.getSnapshot(office.id).divisions
      .find((division) => division.id === divisionId)?.agent.skills;

    const review = officeService.addSkillNode(office.id, { skillName: 'review', position: { x: 10, y: 20 } });
    assert.deepEqual(review.position, { x: 10, y: 20 });
    officeService.linkSkill(office.id, review.id, backend.id);
    officeService.linkSkill(office.id, review.id, docs.id);
    assert.deepEqual(agentSkills(backend.id), ['review']);

    // A copy of the same skill elsewhere on the canvas is still the same skill.
    const copy = officeService.addSkillNode(office.id, { skillName: 'review' });
    officeService.linkSkill(office.id, copy.id, backend.id);
    officeService.unlinkSkill(office.id, review.id, backend.id);
    assert.deepEqual(agentSkills(backend.id), ['review'], 'still linked through the copy');

    officeService.deleteSkillNode(office.id, copy.id);
    assert.deepEqual(agentSkills(backend.id), []);
    assert.deepEqual(agentSkills(docs.id), ['review']);

    // Skills set the old way (agent PATCH) are placed on the canvas and linked.
    await officeService.updateAgent(office.id, backend.agent.id, { skills: ['deploy'] });
    const nodes = officeService.getSnapshot(office.id).skillNodes;
    const deploy = nodes.find((node) => node.skillName === 'deploy');
    assert.ok(deploy);
    assert.deepEqual(deploy.divisionIds, [backend.id]);

    assert.throws(() => officeService.addSkillNode(office.id, { skillName: '  ' }), rejectsWith('INVALID_OFFICE_INPUT'));
    assert.throws(() => officeService.linkSkill(office.id, 'missing', backend.id), rejectsWith('OFFICE_SKILL_NODE_NOT_FOUND'));
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

test('shapes are drawn, restyled, stacked and deleted, with their input checked', async () => {
  await withProject(async (projectId) => {
    const { office } = officeService.createOffice({ projectId, locale: 'en' });
    const box = officeService.addShape(office.id, { kind: 'rounded', x: 10.4, y: 20, width: 200, height: 120, text: 'Frontend group' });
    assert.equal(box.kind, 'rounded');
    assert.equal(box.x, 10);
    assert.equal(box.stroke, '#8a8a90', 'a box gets a border by default');
    const label = officeService.addShape(office.id, { kind: 'text', x: 0, y: 0, width: 120, height: 40, text: 'Notes' });
    assert.equal(label.stroke, null, 'text has no border');
    assert.ok(label.z > box.z, 'a new shape goes on top');

    const restyled = officeService.updateShape(office.id, box.id, { fill: '#1C1C1F', textColor: null, fontSize: 18, width: 260 });
    assert.equal(restyled.fill, '#1c1c1f');
    assert.equal(restyled.width, 260);
    assert.ok(officeService.updateShape(office.id, box.id, { stack: 'front' }).z > label.z);
    assert.ok(officeService.updateShape(office.id, box.id, { stack: 'back' }).z < label.z);

    assert.throws(() => officeService.updateShape(office.id, box.id, { fill: 'red' }), rejectsWith('INVALID_OFFICE_INPUT'));
    assert.throws(() => officeService.updateShape(office.id, box.id, { width: 2 }), rejectsWith('INVALID_OFFICE_INPUT'));
    assert.throws(() => officeService.addShape(office.id, { kind: 'star' as never, x: 0, y: 0, width: 20, height: 20 }), rejectsWith('INVALID_OFFICE_INPUT'));

    assert.equal(officeService.getSnapshot(office.id).shapes.length, 2);
    assert.deepEqual(officeService.deleteShape(office.id, box.id).map((shape) => shape.id), [label.id]);
    assert.throws(() => officeService.deleteShape(office.id, box.id), rejectsWith('OFFICE_SHAPE_NOT_FOUND'));
  });
});

test('the solo history lists only chats created as solo chats, for that project only', async () => {
  await withProject(async (projectId) => {
    const projectPath = projectsDb.getProjectPathById(projectId);
    assert.ok(projectPath);
    const old = sessionsService.createSoloSession('claude', projectPath, 'old chat about the shop');
    sessionsDb.createAppSession('team-run', 'claude', projectPath, 'kantor shop · Backend');
    const latest = sessionsService.createSoloSession('codex', projectPath, '');
    const { project: other } = projectsDb.createProjectPath(path.join(path.dirname(projectPath), 'other'));
    assert.ok(other);
    sessionsService.createSoloSession('claude', other.project_path, 'other folder');
    sessionsDb.updateSessionCustomName(latest.sessionId, 'latest chat');

    const listed = officeService.listSoloSessions(projectId);
    assert.deepEqual(listed.map((session) => session.sessionId).sort(), [latest.sessionId, old.sessionId].sort());
    const newest = listed.find((session) => session.sessionId === latest.sessionId);
    assert.equal(newest?.provider, 'codex');
    assert.equal(newest?.title, 'latest chat');
    assert.equal(officesDb.isSoloSession(old.sessionId), true);
    assert.equal(officesDb.isSoloSession('team-run'), false);

    assert.throws(() => sessionsService.createSoloSession('claude', '/not/a/project', 'hi'), rejectsWith('PROJECT_NOT_FOUND'));
    assert.throws(() => officeService.listSoloSessions('no-such-project'), rejectsWith('PROJECT_NOT_FOUND'));
  });
});
