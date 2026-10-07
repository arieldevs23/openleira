import express, { type Request } from 'express';

import type { OfficeAnalyzer } from '@/modules/office/services/office-analysis.service.js';
import type { OfficeOrchestrator } from '@/modules/office/services/office-orchestrator.service.js';
import type { officeService } from '@/modules/office/services/office.service.js';
import type { OfficeShapeKind, OfficeShapePatch } from '@/shared/types.js';
import { AppError, asyncHandler, createApiSuccessResponse } from '@/shared/utils.js';

/** The application services the Office HTTP API delegates to; tests pass fakes. */
type OfficeRouteDependencies = {
  office: typeof officeService;
  orchestrator: OfficeOrchestrator;
  analyzer: OfficeAnalyzer;
};

type JsonBody = Record<string, unknown>;

const badRequest = (message: string): AppError =>
  new AppError(message, { code: 'INVALID_REQUEST_BODY', statusCode: 400 });

const readBody = (req: Request): JsonBody => (
  req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body as JsonBody : {}
);

function readParam(req: Request, name: string): string {
  const value = req.params[name];
  if (typeof value !== 'string' || !/^[A-Za-z0-9._-]{1,120}$/.test(value)) {
    throw new AppError(`Invalid ${name}.`, { code: 'INVALID_PATH_PARAMETER', statusCode: 400 });
  }
  return value;
}

function readRequiredString(body: JsonBody, field: string): string {
  const value = body[field];
  if (typeof value !== 'string' || !value.trim()) {
    throw badRequest(`${field} is required.`);
  }
  return value;
}

function readOptionalString(body: JsonBody, field: string): string | undefined {
  const value = body[field];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw badRequest(`${field} must be a string.`);
  }
  return value;
}

function readOptionalInteger(body: JsonBody, field: string): number | undefined {
  const value = body[field];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw badRequest(`${field} must be an integer.`);
  }
  return value;
}

function readOptionalNumber(body: JsonBody, field: string): number | undefined {
  const value = body[field];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw badRequest(`${field} must be a number.`);
  }
  return value;
}

function readRequiredNumber(body: JsonBody, field: string): number {
  const value = readOptionalNumber(body, field);
  if (value === undefined) {
    throw badRequest(`${field} is required.`);
  }
  return value;
}

/** A colour field: a string, or null for "none"; absent means unchanged. */
function readOptionalColor(body: JsonBody, field: string): string | null | undefined {
  const value = body[field];
  if (value === undefined || value === null) {
    return value;
  }
  if (typeof value !== 'string') {
    throw badRequest(`${field} must be a string or null.`);
  }
  return value;
}

/** The optional fields of a drawn shape; the service validates their ranges. */
function readShapeFields(body: JsonBody): OfficeShapePatch {
  return {
    kind: readOptionalString(body, 'kind') as OfficeShapeKind | undefined,
    x: readOptionalNumber(body, 'x'),
    y: readOptionalNumber(body, 'y'),
    width: readOptionalNumber(body, 'width'),
    height: readOptionalNumber(body, 'height'),
    text: readOptionalString(body, 'text'),
    fill: readOptionalColor(body, 'fill'),
    stroke: readOptionalColor(body, 'stroke'),
    textColor: readOptionalColor(body, 'textColor'),
    fontSize: readOptionalNumber(body, 'fontSize'),
    z: readOptionalInteger(body, 'z'),
  };
}

function readOptionalBoolean(body: JsonBody, field: string): boolean | undefined {
  const value = body[field];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'boolean') {
    throw badRequest(`${field} must be a boolean.`);
  }
  return value;
}

function readOptionalStringArray(body: JsonBody, field: string): string[] | undefined {
  const value = body[field];
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) {
    throw badRequest(`${field} must be an array of strings.`);
  }
  return value as string[];
}

/**
 * Reads the agent's model choice: absent leaves it alone, `model: null`
 * clears it, and otherwise both `provider` and `model` must be strings.
 */
function readModelChoice(body: JsonBody): { provider: string; model: string } | null | undefined {
  if (!('model' in body) && !('provider' in body)) {
    return undefined;
  }
  if (body.model === null) {
    return null;
  }
  return { provider: readRequiredString(body, 'provider'), model: readRequiredString(body, 'model') };
}

/** Reads a canvas position: absent leaves it alone, `null` returns the node to automatic layout. */
function readOptionalPosition(body: JsonBody): { x: number; y: number } | null | undefined {
  if (!('position' in body)) {
    return undefined;
  }
  if (body.position === null) {
    return null;
  }
  const position = body.position && typeof body.position === 'object' ? body.position as JsonBody : {};
  if (typeof position.x !== 'number' || typeof position.y !== 'number') {
    throw badRequest('position must be { x, y } numbers or null.');
  }
  return { x: position.x, y: position.y };
}

/** Reads the reviewed division proposals a workspace is created from, when there are any. */
function readProposals(body: JsonBody) {
  if (body.divisions === undefined) {
    return undefined;
  }
  if (!Array.isArray(body.divisions)) {
    throw badRequest('divisions must be an array.');
  }
  return body.divisions.map((entry) => {
    const proposal = entry && typeof entry === 'object' ? entry as JsonBody : {};
    return {
      name: readRequiredString(proposal, 'name'),
      slug: readOptionalString(proposal, 'slug') ?? '',
      description: readOptionalString(proposal, 'description') ?? '',
      color: readOptionalString(proposal, 'color') ?? '',
      agentName: readOptionalString(proposal, 'agentName') ?? '',
      rolePrompt: readOptionalString(proposal, 'rolePrompt') ?? '',
    };
  });
}

const readUserId = (req: Request): string | null => {
  const id = (req as Request & { user?: { id?: unknown } }).user?.id;
  return typeof id === 'string' || typeof id === 'number' ? String(id) : null;
};

/**
 * Builds the Kantor AI HTTP API mounted at `/api/office`. Routes only parse
 * input, call the office service or orchestrator, and wrap the result.
 */
export function createOfficeRouter(dependencies: OfficeRouteDependencies): express.Router {
  const { office, orchestrator, analyzer } = dependencies;
  const router = express.Router();

  router.get('/', asyncHandler(async (req, res) => {
    const projectId = typeof req.query.projectId === 'string' ? req.query.projectId.trim() : '';
    if (!projectId) {
      throw badRequest('projectId is required.');
    }
    res.json(createApiSuccessResponse({ office: office.getSnapshotForProject(projectId) }));
  }));

  router.post('/', asyncHandler(async (req, res) => {
    const body = readBody(req);
    const snapshot = office.createOffice({
      projectId: readRequiredString(body, 'projectId'),
      locale: readOptionalString(body, 'locale') ?? null,
      divisions: readProposals(body),
      appSummary: readOptionalString(body, 'appSummary') ?? null,
      kind: readOptionalString(body, 'kind') ?? null,
      auditChecks: readOptionalString(body, 'auditChecks') ?? null,
    });
    res.status(201).json(createApiSuccessResponse(snapshot));
  }));

  // Static paths first, so they never match the `:officeId` parameter.
  router.get('/solo-sessions', asyncHandler(async (req, res) => {
    const projectId = typeof req.query.projectId === 'string' ? req.query.projectId.trim() : '';
    if (!projectId) {
      throw badRequest('projectId is required.');
    }
    const limit = Number.parseInt(typeof req.query.limit === 'string' ? req.query.limit : '', 10);
    res.json(createApiSuccessResponse({
      sessions: office.listSoloSessions(projectId, Number.isFinite(limit) ? limit : undefined),
    }));
  }));

  router.get('/workspaces', asyncHandler(async (_req, res) => {
    res.json(createApiSuccessResponse({ workspaces: office.listWorkspaces() }));
  }));

  router.post('/folders', asyncHandler(async (req, res) => {
    const body = readBody(req);
    const mode = readRequiredString(body, 'mode');
    if (mode !== 'new' && mode !== 'existing') {
      throw badRequest('mode must be "new" or "existing".');
    }
    res.json(createApiSuccessResponse(await office.prepareFolder({ path: readRequiredString(body, 'path'), mode })));
  }));

  router.post('/analyses', asyncHandler(async (req, res) => {
    const body = readBody(req);
    const provider = await office.requireReadyModel(readRequiredString(body, 'provider'), readRequiredString(body, 'model'));
    const analysis = analyzer.start({
      projectId: readRequiredString(body, 'projectId'),
      provider,
      model: readRequiredString(body, 'model'),
      locale: readOptionalString(body, 'locale') ?? null,
      userId: readUserId(req),
    });
    res.status(202).json(createApiSuccessResponse(analysis));
  }));

  router.get('/analyses', asyncHandler(async (_req, res) => {
    res.json(createApiSuccessResponse({ analyses: analyzer.list() }));
  }));

  router.get('/analyses/:analysisId', asyncHandler(async (req, res) => {
    res.json(createApiSuccessResponse(analyzer.get(readParam(req, 'analysisId'))));
  }));

  router.post('/analyses/:analysisId/cancel', asyncHandler(async (req, res) => {
    res.json(createApiSuccessResponse(await analyzer.cancel(readParam(req, 'analysisId'))));
  }));

  router.delete('/analyses/:analysisId', asyncHandler(async (req, res) => {
    analyzer.dismiss(readParam(req, 'analysisId'));
    res.json(createApiSuccessResponse({ dismissed: true }));
  }));

  router.get('/:officeId', asyncHandler(async (req, res) => {
    res.json(createApiSuccessResponse(office.getSnapshot(readParam(req, 'officeId'))));
  }));

  router.delete('/:officeId', asyncHandler(async (req, res) => {
    office.deleteOffice(readParam(req, 'officeId'));
    res.json(createApiSuccessResponse({ deleted: true }));
  }));

  router.post('/:officeId/flow', asyncHandler(async (req, res) => {
    const body = readBody(req);
    const flow = office.addFlowEdge(readParam(req, 'officeId'), readRequiredString(body, 'fromDivisionId'), readRequiredString(body, 'toDivisionId'));
    res.status(201).json(createApiSuccessResponse({ flow }));
  }));

  router.delete('/:officeId/flow', asyncHandler(async (req, res) => {
    const body = readBody(req);
    const flow = office.deleteFlowEdge(readParam(req, 'officeId'), readRequiredString(body, 'fromDivisionId'), readRequiredString(body, 'toDivisionId'));
    res.json(createApiSuccessResponse({ flow }));
  }));

  router.post('/:officeId/skills', asyncHandler(async (req, res) => {
    const body = readBody(req);
    const node = office.addSkillNode(readParam(req, 'officeId'), {
      skillName: readRequiredString(body, 'skillName'),
      position: readOptionalPosition(body),
    });
    res.status(201).json(createApiSuccessResponse(node));
  }));

  router.patch('/:officeId/skills/:nodeId', asyncHandler(async (req, res) => {
    const position = readOptionalPosition(readBody(req));
    if (position === undefined) {
      throw badRequest('position is required.');
    }
    res.json(createApiSuccessResponse({ skillNodes: office.moveSkillNode(readParam(req, 'officeId'), readParam(req, 'nodeId'), position) }));
  }));

  router.delete('/:officeId/skills/:nodeId', asyncHandler(async (req, res) => {
    res.json(createApiSuccessResponse({ skillNodes: office.deleteSkillNode(readParam(req, 'officeId'), readParam(req, 'nodeId')) }));
  }));

  router.post('/:officeId/shapes', asyncHandler(async (req, res) => {
    const body = readBody(req);
    const shape = office.addShape(readParam(req, 'officeId'), {
      ...readShapeFields(body),
      kind: readRequiredString(body, 'kind') as OfficeShapeKind,
      x: readRequiredNumber(body, 'x'),
      y: readRequiredNumber(body, 'y'),
      width: readRequiredNumber(body, 'width'),
      height: readRequiredNumber(body, 'height'),
    });
    res.status(201).json(createApiSuccessResponse(shape));
  }));

  router.patch('/:officeId/shapes/:shapeId', asyncHandler(async (req, res) => {
    const body = readBody(req);
    const stack = body.stack === 'front' || body.stack === 'back' ? body.stack : undefined;
    res.json(createApiSuccessResponse(office.updateShape(readParam(req, 'officeId'), readParam(req, 'shapeId'), { ...readShapeFields(body), stack })));
  }));

  router.delete('/:officeId/shapes/:shapeId', asyncHandler(async (req, res) => {
    res.json(createApiSuccessResponse({ shapes: office.deleteShape(readParam(req, 'officeId'), readParam(req, 'shapeId')) }));
  }));

  router.post('/:officeId/skills/:nodeId/links', asyncHandler(async (req, res) => {
    const divisionId = readRequiredString(readBody(req), 'divisionId');
    res.status(201).json(createApiSuccessResponse({
      skillNodes: office.linkSkill(readParam(req, 'officeId'), readParam(req, 'nodeId'), divisionId),
    }));
  }));

  router.delete('/:officeId/skills/:nodeId/links/:divisionId', asyncHandler(async (req, res) => {
    res.json(createApiSuccessResponse({
      skillNodes: office.unlinkSkill(readParam(req, 'officeId'), readParam(req, 'nodeId'), readParam(req, 'divisionId')),
    }));
  }));

  router.patch('/:officeId', asyncHandler(async (req, res) => {
    const body = readBody(req);
    const updated = office.updateOffice(readParam(req, 'officeId'), {
      name: readOptionalString(body, 'name'),
      maxParallel: readOptionalInteger(body, 'maxParallel'),
      permissionMode: readOptionalString(body, 'permissionMode'),
      permissionWarningAcknowledged: readOptionalBoolean(body, 'permissionWarningAcknowledged'),
    });
    res.json(createApiSuccessResponse(updated));
  }));

  router.post('/:officeId/divisions', asyncHandler(async (req, res) => {
    const body = readBody(req);
    const division = office.createDivision(readParam(req, 'officeId'), {
      name: readRequiredString(body, 'name'),
      description: readOptionalString(body, 'description'),
      color: readOptionalString(body, 'color'),
      agentName: readOptionalString(body, 'agentName'),
      rolePrompt: readOptionalString(body, 'rolePrompt'),
      position: readOptionalPosition(body),
    });
    res.status(201).json(createApiSuccessResponse(division));
  }));

  router.patch('/:officeId/divisions/:divisionId', asyncHandler(async (req, res) => {
    const body = readBody(req);
    const division = office.updateDivision(readParam(req, 'officeId'), readParam(req, 'divisionId'), {
      name: readOptionalString(body, 'name'),
      description: readOptionalString(body, 'description'),
      color: readOptionalString(body, 'color'),
      sortOrder: readOptionalInteger(body, 'sortOrder'),
      position: readOptionalPosition(body),
    });
    res.json(createApiSuccessResponse(division));
  }));

  router.delete('/:officeId/divisions/:divisionId', asyncHandler(async (req, res) => {
    office.deleteDivision(readParam(req, 'officeId'), readParam(req, 'divisionId'));
    res.json(createApiSuccessResponse({ deleted: true }));
  }));

  router.put('/:officeId/agents/models', asyncHandler(async (req, res) => {
    const body = readBody(req);
    if (!Array.isArray(body.assignments)) {
      throw badRequest('assignments must be an array.');
    }
    const assignments = body.assignments.map((entry) => {
      const assignment = entry && typeof entry === 'object' ? entry as JsonBody : {};
      return {
        agentId: readRequiredString(assignment, 'agentId'),
        provider: readRequiredString(assignment, 'provider'),
        model: readRequiredString(assignment, 'model'),
      };
    });
    const divisions = await office.assignModels(readParam(req, 'officeId'), assignments);
    res.json(createApiSuccessResponse({ divisions }));
  }));

  router.patch('/:officeId/agents/:agentId', asyncHandler(async (req, res) => {
    const body = readBody(req);
    const division = await office.updateAgent(readParam(req, 'officeId'), readParam(req, 'agentId'), {
      name: readOptionalString(body, 'name'),
      rolePrompt: readOptionalString(body, 'rolePrompt'),
      model: readModelChoice(body),
      allowedTools: readOptionalStringArray(body, 'allowedTools'),
      skills: readOptionalStringArray(body, 'skills'),
      enabled: readOptionalBoolean(body, 'enabled'),
    });
    res.json(createApiSuccessResponse(division));
  }));

  router.post('/:officeId/cases', asyncHandler(async (req, res) => {
    const body = readBody(req);
    const created = office.createCase(readParam(req, 'officeId'), {
      title: readRequiredString(body, 'title'),
      description: readOptionalString(body, 'description'),
      createdBy: readUserId(req),
      quickDivisionId: readOptionalString(body, 'quickDivisionId') ?? null,
    });
    res.status(201).json(createApiSuccessResponse(created));
  }));

  // New work for the workspace: one prompt or a list, to the orchestrator or straight to one team.
  router.post('/:officeId/work', asyncHandler(async (req, res) => {
    const officeId = readParam(req, 'officeId');
    const body = readBody(req);
    const items = readOptionalStringArray(body, 'items') ?? [];
    // null (or leaving it out) hands the work to the orchestrator.
    const divisionId = body.divisionId === null ? null : readOptionalString(body, 'divisionId') ?? null;
    await office.requireConnectedProviders(officeId, undefined, divisionId ? [divisionId] : undefined);
    const created = orchestrator.submitWork(officeId, { items, divisionId, createdBy: readUserId(req) });
    res.status(201).json(createApiSuccessResponse(created));
  }));

  router.get('/:officeId/cases/:caseId', asyncHandler(async (req, res) => {
    res.json(createApiSuccessResponse(office.getCaseDetail(readParam(req, 'officeId'), readParam(req, 'caseId'))));
  }));

  router.get('/:officeId/cases/:caseId/usage', asyncHandler(async (req, res) => {
    res.json(createApiSuccessResponse(await office.getCaseUsage(readParam(req, 'officeId'), readParam(req, 'caseId'))));
  }));

  router.patch('/:officeId/cases/:caseId', asyncHandler(async (req, res) => {
    const body = readBody(req);
    const updated = office.updateCase(readParam(req, 'officeId'), readParam(req, 'caseId'), {
      title: readOptionalString(body, 'title'),
      description: readOptionalString(body, 'description'),
    });
    res.json(createApiSuccessResponse(updated));
  }));

  router.delete('/:officeId/cases/:caseId', asyncHandler(async (req, res) => {
    office.deleteCase(readParam(req, 'officeId'), readParam(req, 'caseId'));
    res.json(createApiSuccessResponse({ deleted: true }));
  }));

  router.post('/:officeId/cases/:caseId/start', asyncHandler(async (req, res) => {
    const officeId = readParam(req, 'officeId');
    const caseId = readParam(req, 'caseId');
    const quickDivisionId = office.requireCase(officeId, caseId).quickDivisionId;
    await office.requireConnectedProviders(officeId, undefined, quickDivisionId ? [quickDivisionId] : undefined);
    res.json(createApiSuccessResponse(orchestrator.startCase(officeId, caseId)));
  }));

  router.post('/:officeId/cases/:caseId/pause', asyncHandler(async (req, res) => {
    res.json(createApiSuccessResponse(orchestrator.pauseCase(readParam(req, 'officeId'), readParam(req, 'caseId'))));
  }));

  router.post('/:officeId/cases/:caseId/resume', asyncHandler(async (req, res) => {
    const officeId = readParam(req, 'officeId');
    const caseId = readParam(req, 'caseId');
    const quickDivisionId = office.requireCase(officeId, caseId).quickDivisionId;
    await office.requireConnectedProviders(officeId, undefined, quickDivisionId ? [quickDivisionId] : undefined);
    res.json(createApiSuccessResponse(orchestrator.resumeCase(officeId, caseId)));
  }));

  router.post('/:officeId/cases/:caseId/retry', asyncHandler(async (req, res) => {
    const officeId = readParam(req, 'officeId');
    const caseId = readParam(req, 'caseId');
    const quickDivisionId = office.requireCase(officeId, caseId).quickDivisionId;
    await office.requireConnectedProviders(officeId, undefined, quickDivisionId ? [quickDivisionId] : undefined);
    res.json(createApiSuccessResponse(orchestrator.retryCase(officeId, caseId)));
  }));

  router.post('/:officeId/cases/:caseId/cancel', asyncHandler(async (req, res) => {
    const cancelled = await orchestrator.cancelCase(readParam(req, 'officeId'), readParam(req, 'caseId'));
    res.json(createApiSuccessResponse(cancelled));
  }));

  router.post('/:officeId/cases/:caseId/notes', asyncHandler(async (req, res) => {
    const body = readBody(req);
    const message = orchestrator.postNote(
      readParam(req, 'officeId'),
      readParam(req, 'caseId'),
      readRequiredString(body, 'text'),
    );
    res.status(201).json(createApiSuccessResponse(message));
  }));

  return router;
}
