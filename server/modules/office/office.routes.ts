import express, { type Request } from 'express';

import type { OfficeOrchestrator } from '@/modules/office/services/office-orchestrator.service.js';
import type { officeService } from '@/modules/office/services/office.service.js';
import { AppError, asyncHandler, createApiSuccessResponse } from '@/shared/utils.js';

/** The application services the Office HTTP API delegates to; tests pass fakes. */
type OfficeRouteDependencies = {
  office: typeof officeService;
  orchestrator: OfficeOrchestrator;
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

const readUserId = (req: Request): string | null => {
  const id = (req as Request & { user?: { id?: unknown } }).user?.id;
  return typeof id === 'string' || typeof id === 'number' ? String(id) : null;
};

/**
 * Builds the Kantor AI HTTP API mounted at `/api/office`. Routes only parse
 * input, call the office service or orchestrator, and wrap the result.
 */
export function createOfficeRouter(dependencies: OfficeRouteDependencies): express.Router {
  const { office, orchestrator } = dependencies;
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
    });
    res.status(201).json(createApiSuccessResponse(snapshot));
  }));

  router.get('/:officeId', asyncHandler(async (req, res) => {
    res.json(createApiSuccessResponse(office.getSnapshot(readParam(req, 'officeId'))));
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
    });
    res.status(201).json(createApiSuccessResponse(created));
  }));

  router.get('/:officeId/cases/:caseId', asyncHandler(async (req, res) => {
    res.json(createApiSuccessResponse(office.getCaseDetail(readParam(req, 'officeId'), readParam(req, 'caseId'))));
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
    await office.requireConnectedProviders(officeId);
    res.json(createApiSuccessResponse(orchestrator.startCase(officeId, caseId)));
  }));

  router.post('/:officeId/cases/:caseId/pause', asyncHandler(async (req, res) => {
    res.json(createApiSuccessResponse(orchestrator.pauseCase(readParam(req, 'officeId'), readParam(req, 'caseId'))));
  }));

  router.post('/:officeId/cases/:caseId/resume', asyncHandler(async (req, res) => {
    const officeId = readParam(req, 'officeId');
    const caseId = readParam(req, 'caseId');
    await office.requireConnectedProviders(officeId);
    res.json(createApiSuccessResponse(orchestrator.resumeCase(officeId, caseId)));
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
