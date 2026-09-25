import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import test from 'node:test';

import express, { type NextFunction, type Request, type Response } from 'express';

import { createOfficeRouter } from '@/modules/office/office.routes.js';
import { AppError } from '@/shared/utils.js';

type Call = { method: string; args: unknown[] };

/**
 * Builds fake services that record every call. Any method the test did not
 * expect answers `{ ok: true }` so the route's own parsing is what is tested.
 */
function createRecordingDependencies(calls: Call[]) {
  const record = (method: string) => (...args: unknown[]) => {
    calls.push({ method, args });
    return { ok: true };
  };
  const office = new Proxy({}, { get: (_target, method: string) => record(`office.${method}`) });
  const orchestrator = new Proxy({}, { get: (_target, method: string) => record(`orchestrator.${method}`) });
  const analyzer = new Proxy({}, { get: (_target, method: string) => record(`analyzer.${method}`) });
  return { office, orchestrator, analyzer } as never;
}

async function withServer(
  calls: Call[],
  run: (request: (method: string, url: string, body?: unknown) => Promise<{ status: number; body: Record<string, unknown> }>) => Promise<void>,
): Promise<void> {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as Request & { user?: { id: number } }).user = { id: 42 };
    next();
  });
  app.use('/api/office', createOfficeRouter(createRecordingDependencies(calls)));
  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    res.status(error instanceof AppError ? error.statusCode : 500).json({ error: error instanceof AppError ? error.code : 'INTERNAL' });
  });

  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address() as AddressInfo;
  try {
    await run(async (method, url, body) => {
      const response = await fetch(`http://127.0.0.1:${port}${url}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return { status: response.status, body: await response.json() as Record<string, unknown> };
    });
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
}

test('office lookup needs a projectId and office creation passes the locale through', async () => {
  const calls: Call[] = [];
  await withServer(calls, async (request) => {
    assert.equal((await request('GET', '/api/office')).status, 400);
    assert.equal((await request('GET', '/api/office?projectId=p1')).status, 200);
    assert.equal((await request('POST', '/api/office', { projectId: 'p1', locale: 'en' })).status, 201);
    assert.equal((await request('POST', '/api/office', { locale: 'en' })).status, 400);
  });
  assert.deepEqual(calls, [
    { method: 'office.getSnapshotForProject', args: ['p1'] },
    { method: 'office.createOffice', args: [{ projectId: 'p1', locale: 'en', divisions: undefined, appSummary: null }] },
  ]);
});

test('agent updates distinguish "leave the model alone", "clear it" and "set it"', async () => {
  const calls: Call[] = [];
  await withServer(calls, async (request) => {
    await request('PATCH', '/api/office/o1/agents/a1', { name: 'Arya' });
    await request('PATCH', '/api/office/o1/agents/a1', { model: null });
    await request('PATCH', '/api/office/o1/agents/a1', { provider: 'claude', model: 'opus', allowedTools: ['Read'] });
    assert.equal((await request('PATCH', '/api/office/o1/agents/a1', { model: 'opus' })).status, 400, 'a model needs its provider');
    assert.equal((await request('PATCH', '/api/office/o1/agents/a1', { enabled: 'yes' })).status, 400);
    assert.equal((await request('PATCH', '/api/office/o1/agents/a1', { skills: 'review' })).status, 400);
  });
  assert.deepEqual(calls.map((call) => (call.args[2] as { model: unknown }).model), [
    undefined,
    null,
    { provider: 'claude', model: 'opus' },
  ]);
  assert.deepEqual((calls[2].args[2] as { allowedTools: string[] }).allowedTools, ['Read']);
});

test('the model wizard route validates every assignment row', async () => {
  const calls: Call[] = [];
  await withServer(calls, async (request) => {
    assert.equal((await request('PUT', '/api/office/o1/agents/models', { assignments: 'all' })).status, 400);
    assert.equal((await request('PUT', '/api/office/o1/agents/models', { assignments: [{ agentId: 'a1', provider: 'claude' }] })).status, 400);
    assert.equal((await request('PUT', '/api/office/o1/agents/models', {
      assignments: [{ agentId: 'a1', provider: 'claude', model: 'opus' }],
    })).status, 200);
  });
  assert.deepEqual(calls, [{
    method: 'office.assignModels',
    args: ['o1', [{ agentId: 'a1', provider: 'claude', model: 'opus' }]],
  }]);
});

test('case routes record the author and route controls to the orchestrator', async () => {
  const calls: Call[] = [];
  await withServer(calls, async (request) => {
    assert.equal((await request('POST', '/api/office/o1/cases', { title: 'Login', description: 'd' })).status, 201);
    assert.equal((await request('POST', '/api/office/o1/cases', { description: 'no title' })).status, 400);
    for (const action of ['start', 'pause', 'resume', 'cancel']) {
      assert.equal((await request('POST', `/api/office/o1/cases/c1/${action}`)).status, 200);
    }
    assert.equal((await request('POST', '/api/office/o1/cases/c1/notes', { text: 'hi' })).status, 201);
    assert.equal((await request('POST', '/api/office/o1/cases/c1/notes', { text: '   ' })).status, 400);
    assert.equal((await request('POST', '/api/office/o1/cases/bad%20id/start')).status, 400);
  });
  assert.deepEqual(calls.map((call) => call.method), [
    'office.createCase',
    'office.requireConnectedProviders',
    'orchestrator.startCase',
    'orchestrator.pauseCase',
    'office.requireConnectedProviders',
    'orchestrator.resumeCase',
    'orchestrator.cancelCase',
    'orchestrator.postNote',
  ]);
  assert.deepEqual(calls[0].args, ['o1', { title: 'Login', description: 'd', createdBy: '42' }]);
  assert.deepEqual(calls[7].args, ['o1', 'c1', 'hi']);
});

test('workspace, flow, position and analysis routes parse their input', async () => {
  const calls: Call[] = [];
  await withServer(calls, async (request) => {
    assert.equal((await request('GET', '/api/office/workspaces')).status, 200);
    assert.equal((await request('POST', '/api/office/o1/flow', { fromDivisionId: 'd1', toDivisionId: 'd2' })).status, 201);
    assert.equal((await request('POST', '/api/office/o1/flow', { fromDivisionId: 'd1' })).status, 400);
    assert.equal((await request('DELETE', '/api/office/o1/flow', { fromDivisionId: 'd1', toDivisionId: 'd2' })).status, 200);
    assert.equal((await request('PATCH', '/api/office/o1/divisions/d1', { position: { x: 4, y: 5 } })).status, 200);
    assert.equal((await request('PATCH', '/api/office/o1/divisions/d1', { position: null })).status, 200);
    assert.equal((await request('PATCH', '/api/office/o1/divisions/d1', { position: { x: '4' } })).status, 400);
    assert.equal((await request('POST', '/api/office/analyses', { projectId: 'p1', provider: 'claude', model: 'sonnet' })).status, 202);
    assert.equal((await request('POST', '/api/office/analyses', { projectId: 'p1' })).status, 400);
    assert.equal((await request('GET', '/api/office/analyses/a1')).status, 200);
    assert.equal((await request('GET', '/api/office/analyses')).status, 200);
    assert.equal((await request('POST', '/api/office/analyses/a1/cancel')).status, 200);
    assert.equal((await request('DELETE', '/api/office/analyses/a1')).status, 200);
    assert.equal((await request('POST', '/api/office', {
      projectId: 'p1',
      divisions: [{ name: 'API', rolePrompt: 'owns /api' }],
      appSummary: 'a shop',
    })).status, 201);
    assert.equal((await request('POST', '/api/office', { projectId: 'p1', divisions: [{ rolePrompt: 'no name' }] })).status, 400);
    assert.equal((await request('GET', '/api/office/o1/cases/c1/usage')).status, 200);
    assert.equal((await request('DELETE', '/api/office/o1')).status, 200);
    assert.equal((await request('POST', '/api/office/folders', { path: '/srv/app', mode: 'new' })).status, 200);
    assert.equal((await request('POST', '/api/office/folders', { path: '/srv/app', mode: 'copy' })).status, 400);
  });
  assert.deepEqual(calls.map((call) => call.method), [
    'office.listWorkspaces',
    'office.addFlowEdge',
    'office.deleteFlowEdge',
    'office.updateDivision',
    'office.updateDivision',
    'office.requireReadyModel',
    'analyzer.start',
    'analyzer.get',
    'analyzer.list',
    'analyzer.cancel',
    'analyzer.dismiss',
    'office.createOffice',
    'office.getCaseUsage',
    'office.deleteOffice',
    'office.prepareFolder',
  ]);
  assert.deepEqual((calls[3].args[2] as { position: unknown }).position, { x: 4, y: 5 });
  assert.equal((calls[4].args[2] as { position: unknown }).position, null);
  assert.deepEqual(calls[11].args[0], {
    projectId: 'p1',
    locale: null,
    divisions: [{ name: 'API', slug: '', description: '', color: '', agentName: '', rolePrompt: 'owns /api' }],
    appSummary: 'a shop',
  });
});
