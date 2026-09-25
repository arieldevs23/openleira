import { officeCasesDb, officesDb, projectsDb } from '@/modules/database/index.js';
import { providerAuthService, providerModelsService } from '@/modules/providers/index.js';
import { broadcastOfficeUpdate } from '@/modules/office/services/office-events.service.js';
import { buildDefaultDivisions, resolveSeedLocale } from '@/modules/office/services/office-seed.service.js';
import type {
  LLMProvider,
  Office,
  OfficeCase,
  OfficeCaseDetail,
  OfficeDivision,
  OfficePermissionMode,
  OfficeSnapshot,
  ProviderAuthStatus,
} from '@/shared/types.js';
import { AppError } from '@/shared/utils.js';

const LLM_PROVIDERS: LLMProvider[] = ['claude', 'codex', 'cursor', 'opencode'];
const PERMISSION_MODES: OfficePermissionMode[] = ['bypassPermissions', 'acceptEdits', 'default'];
const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
const DEFAULT_DIVISION_COLOR = '#2551BD';
const MAX_PARALLEL_LIMIT = 6;
const MAX_LIST_ENTRIES = 50;

const LIMITS = {
  name: 80,
  description: 500,
  rolePrompt: 20_000,
  caseTitle: 200,
  caseDescription: 20_000,
};

const badRequest = (message: string, code = 'INVALID_OFFICE_INPUT'): AppError =>
  new AppError(message, { code, statusCode: 400 });

const notFound = (message: string, code: string): AppError => new AppError(message, { code, statusCode: 404 });

const conflict = (message: string, code: string, details?: unknown): AppError =>
  new AppError(message, { code, statusCode: 409, details });

function readBoundedText(value: string, field: string, maxLength: number, required: boolean): string {
  const trimmed = value.trim();
  if (required && !trimmed) {
    throw badRequest(`${field} is required.`);
  }
  if (trimmed.length > maxLength) {
    throw badRequest(`${field} is longer than ${maxLength} characters.`);
  }
  return trimmed;
}

function readStringList(values: string[], field: string): string[] {
  if (values.length > MAX_LIST_ENTRIES) {
    throw badRequest(`${field} has more than ${MAX_LIST_ENTRIES} entries.`);
  }
  const cleaned = values.map((value) => value.trim()).filter(Boolean);
  if (cleaned.some((value) => value.length > 120)) {
    throw badRequest(`${field} has an entry that is too long.`);
  }
  return [...new Set(cleaned)];
}

/** Turns a division name into a URL/JSON-safe slug the coordinator can address. */
function slugify(name: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return slug || 'division';
}

function uniqueSlug(base: string, taken: Set<string>): string {
  if (!taken.has(base)) {
    return base;
  }
  let suffix = 2;
  while (taken.has(`${base}-${suffix}`)) {
    suffix += 1;
  }
  return `${base}-${suffix}`;
}

function requireOffice(officeId: string): Office {
  const office = officesDb.getOfficeById(officeId);
  if (!office) {
    throw notFound('Office not found.', 'OFFICE_NOT_FOUND');
  }
  return office;
}

function requireDivision(officeId: string, divisionId: string): OfficeDivision {
  const division = officesDb.getDivision(divisionId);
  if (!division || division.officeId !== officeId) {
    throw notFound('Division not found.', 'OFFICE_DIVISION_NOT_FOUND');
  }
  return division;
}

function requireAgentDivision(officeId: string, agentId: string): OfficeDivision {
  const division = officesDb.listDivisions(officeId).find((candidate) => candidate.agent.id === agentId);
  if (!division) {
    throw notFound('Agent not found.', 'OFFICE_AGENT_NOT_FOUND');
  }
  return division;
}

function requireCase(officeId: string, caseId: string): OfficeCase {
  const caseItem = officeCasesDb.getCase(caseId);
  if (!caseItem || caseItem.officeId !== officeId) {
    throw notFound('Case not found.', 'OFFICE_CASE_NOT_FOUND');
  }
  return caseItem;
}

/**
 * Checks a provider/model pair against the app's model catalog (predefined
 * plus user-added models), so an agent can only be given a model the
 * provider runtime can actually run.
 */
async function validateModelChoice(provider: string, model: string): Promise<LLMProvider> {
  if (!LLM_PROVIDERS.includes(provider as LLMProvider)) {
    throw badRequest(`Unknown provider "${provider}".`, 'OFFICE_INVALID_PROVIDER');
  }
  const catalog = await providerModelsService.getProviderModels(provider as LLMProvider);
  if (!catalog.OPTIONS.some((option) => option.value === model)) {
    throw badRequest(`Model "${model}" is not available for ${provider}.`, 'OFFICE_INVALID_MODEL');
  }
  return provider as LLMProvider;
}

/** Agent fields the UI may change; each is optional. */
type AgentUpdateInput = {
  name?: string;
  rolePrompt?: string;
  /** `null` clears the model choice (together with the provider). */
  model?: { provider: string; model: string } | null;
  allowedTools?: string[];
  skills?: string[];
  enabled?: boolean;
};

/**
 * Office structure and case bookkeeping for the Office routes and the
 * orchestrator. Every mutation is broadcast as an `office:update` frame so
 * open Office pages patch themselves without polling.
 */
export const officeService = {
  requireOffice,
  requireCase,

  getSnapshot(officeId: string): OfficeSnapshot {
    const office = requireOffice(officeId);
    return {
      office,
      divisions: officesDb.listDivisions(office.id),
      cases: officeCasesDb.listCases(office.id),
    };
  },

  /** The office of a project, or null when it has none yet. */
  getSnapshotForProject(projectId: string): OfficeSnapshot | null {
    const projectPath = projectsDb.getProjectPathById(projectId);
    if (!projectPath) {
      throw notFound('Project not found.', 'PROJECT_NOT_FOUND');
    }
    const office = officesDb.getOfficeByProjectPath(projectPath);
    return office ? this.getSnapshot(office.id) : null;
  },

  /** Creates the project's office with the default divisions ("bikin kantor"). */
  createOffice(input: { projectId: string; locale: string | null }): OfficeSnapshot {
    const project = projectsDb.getProjectById(input.projectId);
    if (!project) {
      throw notFound('Project not found.', 'PROJECT_NOT_FOUND');
    }
    if (officesDb.getOfficeByProjectPath(project.project_path)) {
      throw conflict('This project already has an office.', 'OFFICE_ALREADY_EXISTS');
    }

    const locale = resolveSeedLocale(input.locale);
    const displayName = project.custom_project_name?.trim() || project.project_path.split(/[\\/]/).filter(Boolean).pop() || 'project';
    const office = officesDb.createOffice({
      projectPath: project.project_path,
      name: locale === 'en' ? `${displayName} office` : `kantor ${displayName}`,
      locale,
      divisions: buildDefaultDivisions(locale),
    });
    broadcastOfficeUpdate(office.id, { entity: 'office', office });
    return this.getSnapshot(office.id);
  },

  updateOffice(
    officeId: string,
    patch: { name?: string; maxParallel?: number; permissionMode?: string; permissionWarningAcknowledged?: boolean },
  ): Office {
    requireOffice(officeId);
    if (patch.maxParallel !== undefined
      && (!Number.isInteger(patch.maxParallel) || patch.maxParallel < 1 || patch.maxParallel > MAX_PARALLEL_LIMIT)) {
      throw badRequest(`maxParallel must be between 1 and ${MAX_PARALLEL_LIMIT}.`);
    }
    if (patch.permissionMode !== undefined && !PERMISSION_MODES.includes(patch.permissionMode as OfficePermissionMode)) {
      throw badRequest(`Unknown permission mode "${patch.permissionMode}".`);
    }

    const office = officesDb.updateOffice(officeId, {
      name: patch.name === undefined ? undefined : readBoundedText(patch.name, 'name', LIMITS.name, true),
      maxParallel: patch.maxParallel,
      permissionMode: patch.permissionMode as OfficePermissionMode | undefined,
      permissionWarningAcknowledged: patch.permissionWarningAcknowledged,
    });
    if (!office) {
      throw notFound('Office not found.', 'OFFICE_NOT_FOUND');
    }
    broadcastOfficeUpdate(office.id, { entity: 'office', office });
    return office;
  },

  createDivision(officeId: string, input: { name: string; description?: string; color?: string }): OfficeDivision {
    requireOffice(officeId);
    const name = readBoundedText(input.name, 'name', LIMITS.name, true);
    const description = readBoundedText(input.description ?? '', 'description', LIMITS.description, false);
    const color = input.color?.trim() || DEFAULT_DIVISION_COLOR;
    if (!HEX_COLOR_PATTERN.test(color)) {
      throw badRequest('color must be a #RRGGBB hex value.');
    }

    const taken = new Set(officesDb.listDivisions(officeId).map((division) => division.slug));
    const division = officesDb.createDivision(officeId, {
      name,
      slug: uniqueSlug(slugify(name), taken),
      description,
      color,
      agent: { name, rolePrompt: '', allowedTools: [], skills: [] },
    });
    broadcastOfficeUpdate(officeId, { entity: 'division', id: division.id, division });
    return division;
  },

  updateDivision(
    officeId: string,
    divisionId: string,
    patch: { name?: string; description?: string; color?: string; sortOrder?: number },
  ): OfficeDivision {
    requireDivision(officeId, divisionId);
    if (patch.color !== undefined && !HEX_COLOR_PATTERN.test(patch.color.trim())) {
      throw badRequest('color must be a #RRGGBB hex value.');
    }
    if (patch.sortOrder !== undefined && !Number.isInteger(patch.sortOrder)) {
      throw badRequest('sortOrder must be an integer.');
    }

    const division = officesDb.updateDivision(divisionId, {
      name: patch.name === undefined ? undefined : readBoundedText(patch.name, 'name', LIMITS.name, true),
      description: patch.description === undefined
        ? undefined
        : readBoundedText(patch.description, 'description', LIMITS.description, false),
      color: patch.color?.trim(),
      sortOrder: patch.sortOrder,
    });
    if (!division) {
      throw notFound('Division not found.', 'OFFICE_DIVISION_NOT_FOUND');
    }
    broadcastOfficeUpdate(officeId, { entity: 'division', id: division.id, division });
    return division;
  },

  /** Removes a division. The coordinator and audit layer can only be edited. */
  deleteDivision(officeId: string, divisionId: string): void {
    const division = requireDivision(officeId, divisionId);
    if (division.isCoordinator || division.isAudit) {
      throw conflict('The coordinator and the audit division cannot be deleted.', 'OFFICE_DIVISION_PROTECTED');
    }
    if (officeCasesDb.hasActiveTasksForDivision(divisionId)) {
      throw conflict('This division still has work in a running case.', 'OFFICE_DIVISION_IN_USE');
    }
    officesDb.deleteDivision(divisionId);
    broadcastOfficeUpdate(officeId, { entity: 'division', id: divisionId, division: null });
  },

  async updateAgent(officeId: string, agentId: string, input: AgentUpdateInput): Promise<OfficeDivision> {
    const current = requireAgentDivision(officeId, agentId);
    let provider: LLMProvider | null | undefined;
    let model: string | null | undefined;
    if (input.model === null) {
      provider = null;
      model = null;
    } else if (input.model) {
      provider = await validateModelChoice(input.model.provider, input.model.model);
      model = input.model.model;
    }
    if (input.enabled === false && current.isCoordinator) {
      throw conflict('The coordinator cannot be disabled.', 'OFFICE_DIVISION_PROTECTED');
    }

    const division = officesDb.updateAgent(agentId, {
      name: input.name === undefined ? undefined : readBoundedText(input.name, 'name', LIMITS.name, true),
      rolePrompt: input.rolePrompt === undefined
        ? undefined
        : readBoundedText(input.rolePrompt, 'rolePrompt', LIMITS.rolePrompt, false),
      provider,
      model,
      allowedTools: input.allowedTools === undefined ? undefined : readStringList(input.allowedTools, 'allowedTools'),
      skills: input.skills === undefined ? undefined : readStringList(input.skills, 'skills'),
      enabled: input.enabled,
    });
    if (!division) {
      throw notFound('Agent not found.', 'OFFICE_AGENT_NOT_FOUND');
    }
    broadcastOfficeUpdate(officeId, { entity: 'division', id: division.id, division });
    return division;
  },

  /**
   * Applies the model wizard: one provider/model per agent. Every choice is
   * validated before anything is written, so a bad row changes nothing.
   */
  async assignModels(
    officeId: string,
    assignments: Array<{ agentId: string; provider: string; model: string }>,
  ): Promise<OfficeDivision[]> {
    requireOffice(officeId);
    const divisions = officesDb.listDivisions(officeId);
    for (const assignment of assignments) {
      if (!divisions.some((division) => division.agent.id === assignment.agentId)) {
        throw notFound('Agent not found.', 'OFFICE_AGENT_NOT_FOUND');
      }
      await validateModelChoice(assignment.provider, assignment.model);
    }

    const updated: OfficeDivision[] = [];
    for (const assignment of assignments) {
      const division = officesDb.updateAgent(assignment.agentId, {
        provider: assignment.provider as LLMProvider,
        model: assignment.model,
      });
      if (division) {
        updated.push(division);
        broadcastOfficeUpdate(officeId, { entity: 'division', id: division.id, division });
      }
    }
    return updated;
  },

  /** Enabled agents that still have no model; a case cannot start while any exist. */
  findAgentsMissingModel(officeId: string): OfficeDivision[] {
    return officesDb
      .listDivisions(officeId)
      .filter((division) => division.agent.enabled && (!division.agent.provider || !division.agent.model));
  },

  /**
   * Refuses to go on while an enabled agent runs on a provider that is not
   * installed or not logged in, so a case fails up front with a clear message
   * instead of every agent turn failing one by one.
   */
  async requireConnectedProviders(
    officeId: string,
    getStatus: (provider: LLMProvider) => Promise<ProviderAuthStatus> = (provider) => providerAuthService.getProviderAuthStatus(provider),
  ): Promise<void> {
    requireOffice(officeId);
    const providers = [...new Set(officesDb
      .listDivisions(officeId)
      .filter((division) => division.agent.enabled && division.agent.provider)
      .map((division) => division.agent.provider as LLMProvider))];
    const statuses = await Promise.all(providers.map(async (provider) => {
      try {
        const status = await getStatus(provider);
        return { provider, connected: status.installed && status.authenticated };
      } catch {
        return { provider, connected: false };
      }
    }));
    const disconnected = statuses.filter((status) => !status.connected).map((status) => status.provider);
    if (disconnected.length > 0) {
      throw conflict(
        `Connect ${disconnected.join(', ')} before running a case: log in from the office setup or from Settings > Agents.`,
        'OFFICE_PROVIDERS_NOT_CONNECTED',
        { providers: disconnected },
      );
    }
  },

  createCase(officeId: string, input: { title: string; description?: string; createdBy: string | null }): OfficeCase {
    requireOffice(officeId);
    const caseItem = officeCasesDb.createCase({
      officeId,
      title: readBoundedText(input.title, 'title', LIMITS.caseTitle, true),
      description: readBoundedText(input.description ?? '', 'description', LIMITS.caseDescription, false),
      createdBy: input.createdBy,
    });
    broadcastOfficeUpdate(officeId, { entity: 'case', id: caseItem.id, case: caseItem });
    return caseItem;
  },

  /** Edits a case that has not been started yet. */
  updateCase(officeId: string, caseId: string, patch: { title?: string; description?: string }): OfficeCase {
    const current = requireCase(officeId, caseId);
    if (current.status !== 'draft') {
      throw conflict('Only a draft case can be edited.', 'OFFICE_CASE_NOT_DRAFT');
    }
    const caseItem = officeCasesDb.updateCase(caseId, {
      title: patch.title === undefined ? undefined : readBoundedText(patch.title, 'title', LIMITS.caseTitle, true),
      description: patch.description === undefined
        ? undefined
        : readBoundedText(patch.description, 'description', LIMITS.caseDescription, false),
    });
    if (!caseItem) {
      throw notFound('Case not found.', 'OFFICE_CASE_NOT_FOUND');
    }
    broadcastOfficeUpdate(officeId, { entity: 'case', id: caseItem.id, case: caseItem });
    return caseItem;
  },

  /** Deletes a case that is not in flight (draft, done or failed). */
  deleteCase(officeId: string, caseId: string): void {
    const current = requireCase(officeId, caseId);
    if (current.status === 'running' || current.status === 'waiting_user') {
      throw conflict('Cancel the case before deleting it.', 'OFFICE_CASE_ACTIVE');
    }
    officeCasesDb.deleteCase(caseId);
    broadcastOfficeUpdate(officeId, { entity: 'case', id: caseId, case: null });
  },

  getCaseDetail(officeId: string, caseId: string): OfficeCaseDetail {
    return {
      case: requireCase(officeId, caseId),
      tasks: officeCasesDb.listTasks(caseId),
      messages: officeCasesDb.listMessages(caseId),
    };
  },
};
