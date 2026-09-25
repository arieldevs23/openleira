import fs from 'node:fs/promises';

import { officeCasesDb, officesDb, projectsDb } from '@/modules/database/index.js';
import { createProject } from '@/modules/projects/index.js';
import { providerAuthService, providerModelsService, providerTokenUsageService } from '@/modules/providers/index.js';
import { broadcastOfficeUpdate } from '@/modules/office/services/office-events.service.js';
import { buildDefaultDivisions, buildDefaultFlow, buildDivisionsFromProposals, resolveSeedLocale } from '@/modules/office/services/office-seed.service.js';
import type {
  LLMProvider,
  Office,
  OfficeCase,
  OfficeCaseDetail,
  OfficeCaseUsage,
  OfficeDivision,
  OfficeDivisionProposal,
  OfficeFlowEdge,
  OfficePermissionMode,
  OfficeWorkspaceSummary,
  OfficeSessionUsage,
  OfficeShape,
  OfficeShapeKind,
  OfficeShapePatch,
  OfficeSkillNode,
  OfficeSnapshot,
  ProviderAuthStatus,
} from '@/shared/types.js';
import { AppError, validateWorkspacePath } from '@/shared/utils.js';

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

const MAX_CANVAS_COORDINATE = 100_000;

function readPosition(position: { x: number; y: number } | null): { x: number; y: number } | null {
  if (position === null) {
    return null;
  }
  const valid = (value: number) => Number.isFinite(value) && Math.abs(value) <= MAX_CANVAS_COORDINATE;
  if (!valid(position.x) || !valid(position.y)) {
    throw badRequest('position must hold finite x and y canvas coordinates.');
  }
  return { x: Math.round(position.x), y: Math.round(position.y) };
}

/** Does adding `from -> to` close a loop, i.e. can `to` already reach `from`? */
export function wouldCreateFlowCycle(edges: Array<Pick<OfficeFlowEdge, 'fromDivisionId' | 'toDivisionId'>>, from: string, to: string): boolean {
  const next = new Map<string, string[]>();
  for (const edge of edges) {
    next.set(edge.fromDivisionId, [...(next.get(edge.fromDivisionId) ?? []), edge.toDivisionId]);
  }
  const seen = new Set<string>();
  const stack = [to];
  while (stack.length > 0) {
    const current = stack.pop() as string;
    if (current === from) {
      return true;
    }
    if (seen.has(current)) {
      continue;
    }
    seen.add(current);
    stack.push(...(next.get(current) ?? []));
  }
  return false;
}

/** Cleans a division proposal from the analysis step (or edited by the user) before it is seeded. */
function readProposal(proposal: OfficeDivisionProposal, taken: Set<string>): OfficeDivisionProposal {
  const name = readBoundedText(String(proposal.name ?? ''), 'name', LIMITS.name, true);
  const color = String(proposal.color ?? '').trim();
  const slug = uniqueSlug(slugify(String(proposal.slug || name)), taken);
  taken.add(slug);
  return {
    name,
    slug,
    description: readBoundedText(String(proposal.description ?? ''), 'description', LIMITS.description, false),
    color: HEX_COLOR_PATTERN.test(color) ? color : DEFAULT_DIVISION_COLOR,
    agentName: readBoundedText(String(proposal.agentName || name), 'agentName', LIMITS.name, true),
    rolePrompt: readBoundedText(String(proposal.rolePrompt ?? ''), 'rolePrompt', LIMITS.rolePrompt, false),
  };
}

/** What the "add workspace" dialog gets back for a folder: its project row and whether it has a workspace. */
type PreparedFolder = {
  projectId: string;
  projectPath: string;
  projectName: string;
  hasWorkspace: boolean;
};

type FolderDependencies = {
  validatePath: typeof validateWorkspacePath;
  readFolder: (folderPath: string) => Promise<string[] | null>;
  createProject: (projectPath: string) => Promise<void>;
};

const defaultFolderDependencies: FolderDependencies = {
  validatePath: validateWorkspacePath,
  readFolder: async (folderPath) => {
    try {
      return await fs.readdir(folderPath);
    } catch {
      return null;
    }
  },
  createProject: async (projectPath) => {
    await createProject({ projectPath, customName: null });
  },
};

const MAX_SKILL_NAME_LENGTH = 120;

/**
 * Makes the canvas the source of an agent's skills: every skill an agent has
 * is linked to a skill node (one is placed when missing, which also carries
 * skills from before skill nodes existed onto the canvas), and every link a
 * division has that its skill list no longer names is removed.
 */
function reconcileSkillNodes(officeId: string, onlyDivisionId?: string): void {
  let nodes = officesDb.listSkillNodes(officeId);
  for (const division of officesDb.listDivisions(officeId)) {
    if (onlyDivisionId && division.id !== onlyDivisionId) {
      continue;
    }
    const wanted = new Set(division.agent.skills);
    for (const node of nodes) {
      if (node.divisionIds.includes(division.id) && !wanted.has(node.skillName)) {
        officesDb.unlinkSkill(node.id, division.id);
      }
    }
    for (const skillName of wanted) {
      const linked = nodes.some((node) => node.skillName === skillName && node.divisionIds.includes(division.id));
      if (!linked) {
        const nodeId = nodes.find((node) => node.skillName === skillName)?.id
          ?? officesDb.createSkillNode(officeId, skillName, null);
        officesDb.linkSkill(nodeId, division.id);
      }
    }
    nodes = officesDb.listSkillNodes(officeId);
  }
}

/** Rewrites the skill list of each given division from the skill nodes it is linked to. */
function syncAgentSkills(officeId: string, divisionIds: Iterable<string>): void {
  const nodes = officesDb.listSkillNodes(officeId);
  for (const divisionId of new Set(divisionIds)) {
    const division = officesDb.getDivision(divisionId);
    if (!division || division.officeId !== officeId) {
      continue;
    }
    const skills = [...new Set(nodes.filter((node) => node.divisionIds.includes(divisionId)).map((node) => node.skillName))];
    if (skills.join('|') === division.agent.skills.join('|')) {
      continue;
    }
    const updated = officesDb.updateAgent(division.agent.id, { skills });
    if (updated) {
      broadcastOfficeUpdate(officeId, { entity: 'division', id: updated.id, division: updated });
    }
  }
}

function requireSkillNode(officeId: string, nodeId: string): OfficeSkillNode {
  const node = officesDb.listSkillNodes(officeId).find((candidate) => candidate.id === nodeId);
  if (!node) {
    throw notFound('Skill node not found.', 'OFFICE_SKILL_NODE_NOT_FOUND');
  }
  return node;
}

// ----- drawn shapes -----

const SHAPE_KINDS: OfficeShapeKind[] = ['rect', 'rounded', 'ellipse', 'diamond', 'text'];
const MIN_SHAPE_SIZE = 8;
const MAX_SHAPE_SIZE = 5000;
const MAX_SHAPE_TEXT = 5000;
const COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

const readShapeColor = (value: string | null | undefined, field: string): string | null | undefined => {
  if (value === undefined || value === null) {
    return value;
  }
  if (!COLOR_PATTERN.test(value)) {
    throw badRequest(`${field} must be a #rrggbb colour or null.`);
  }
  return value.toLowerCase();
};

const readShapeNumber = (value: number | undefined, field: string, min: number, max: number): number | undefined => {
  if (value === undefined) {
    return undefined;
  }
  if (!Number.isFinite(value) || value < min || value > max) {
    throw badRequest(`${field} must be between ${min} and ${max}.`);
  }
  return Math.round(value);
};

/** Validates and normalises every field of a shape patch that is present. */
function readShapePatch(patch: OfficeShapePatch): OfficeShapePatch {
  if (patch.kind !== undefined && !SHAPE_KINDS.includes(patch.kind)) {
    throw badRequest(`kind must be one of ${SHAPE_KINDS.join(', ')}.`);
  }
  if (patch.text !== undefined && (typeof patch.text !== 'string' || patch.text.length > MAX_SHAPE_TEXT)) {
    throw badRequest(`text must be at most ${MAX_SHAPE_TEXT} characters.`);
  }
  return {
    kind: patch.kind,
    x: readShapeNumber(patch.x, 'x', -MAX_CANVAS_COORDINATE, MAX_CANVAS_COORDINATE),
    y: readShapeNumber(patch.y, 'y', -MAX_CANVAS_COORDINATE, MAX_CANVAS_COORDINATE),
    width: readShapeNumber(patch.width, 'width', MIN_SHAPE_SIZE, MAX_SHAPE_SIZE),
    height: readShapeNumber(patch.height, 'height', MIN_SHAPE_SIZE, MAX_SHAPE_SIZE),
    text: patch.text,
    fill: readShapeColor(patch.fill, 'fill'),
    stroke: readShapeColor(patch.stroke, 'stroke'),
    textColor: readShapeColor(patch.textColor, 'textColor'),
    fontSize: readShapeNumber(patch.fontSize, 'fontSize', 8, 96),
    z: readShapeNumber(patch.z, 'z', -1_000_000, 1_000_000),
  };
}

function requireShape(officeId: string, shapeId: string): OfficeShape {
  const shape = officesDb.getShape(shapeId);
  if (!shape || shape.officeId !== officeId) {
    throw notFound('Shape not found.', 'OFFICE_SHAPE_NOT_FOUND');
  }
  return shape;
}

const broadcastShapes = (officeId: string): OfficeShape[] => {
  const shapes = officesDb.listShapes(officeId);
  broadcastOfficeUpdate(officeId, { entity: 'shapes', shapes });
  return shapes;
};

const broadcastSkillNodes = (officeId: string): OfficeSkillNode[] => {
  const skillNodes = officesDb.listSkillNodes(officeId);
  broadcastOfficeUpdate(officeId, { entity: 'skills', skillNodes });
  return skillNodes;
};

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
    reconcileSkillNodes(office.id);
    return {
      office,
      divisions: officesDb.listDivisions(office.id),
      flow: officesDb.listFlowEdges(office.id),
      skillNodes: officesDb.listSkillNodes(office.id),
      shapes: officesDb.listShapes(office.id),
      cases: officeCasesDb.listCases(office.id),
    };
  },

  /**
   * Readies the folder a new workspace works in. `new` makes a fresh folder
   * (refusing one that already has files), `existing` takes a folder that is
   * already there. Either way the folder becomes a project the same way the
   * project wizard does it, unless it already is one.
   */
  async prepareFolder(
    input: { path: string; mode: 'new' | 'existing' },
    dependencies: FolderDependencies = defaultFolderDependencies,
  ): Promise<PreparedFolder> {
    const validation = await dependencies.validatePath(input.path);
    if (!validation.valid || !validation.resolvedPath) {
      throw badRequest(validation.error ?? 'This folder cannot be used.', 'OFFICE_FOLDER_INVALID');
    }
    const folderPath = validation.resolvedPath;
    const entries = await dependencies.readFolder(folderPath);
    if (input.mode === 'new' && entries && entries.length > 0) {
      throw conflict('That folder already has files; add it as an existing app instead.', 'OFFICE_FOLDER_NOT_EMPTY');
    }
    if (input.mode === 'existing' && entries === null) {
      throw notFound('That folder does not exist.', 'OFFICE_FOLDER_MISSING');
    }

    let project = projectsDb.getProjectPath(folderPath);
    if (!project) {
      await dependencies.createProject(folderPath);
      project = projectsDb.getProjectPath(folderPath);
    }
    if (!project) {
      throw new AppError('The folder could not be added as a project.', { code: 'OFFICE_FOLDER_FAILED', statusCode: 500 });
    }
    return {
      projectId: project.project_id,
      projectPath: project.project_path,
      projectName: project.custom_project_name?.trim() || project.project_path.split(/[\\/]/).filter(Boolean).pop() || project.project_path,
      hasWorkspace: Boolean(officesDb.getOfficeByProjectPath(project.project_path)),
    };
  },

  /** Every workspace for the workspace switcher. */
  listWorkspaces(): OfficeWorkspaceSummary[] {
    return officesDb.listWorkspaces();
  },

  /** Deletes a workspace and all its cases; the project folder itself is left alone. */
  deleteOffice(officeId: string): void {
    requireOffice(officeId);
    if (officeCasesDb.listCasesByStatus(['running']).some((caseItem) => caseItem.officeId === officeId)) {
      throw conflict('Stop the running case before deleting this workspace.', 'OFFICE_CASE_RUNNING');
    }
    officesDb.deleteOffice(officeId);
    broadcastOfficeUpdate(officeId, { entity: 'deleted' });
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
  createOffice(input: {
    projectId: string;
    locale: string | null;
    /** Divisions from the "analyse an existing app" step; omitted means the default divisions. */
    divisions?: OfficeDivisionProposal[];
    appSummary?: string | null;
  }): OfficeSnapshot {
    const project = projectsDb.getProjectById(input.projectId);
    if (!project) {
      throw notFound('Project not found.', 'PROJECT_NOT_FOUND');
    }
    if (officesDb.getOfficeByProjectPath(project.project_path)) {
      throw conflict('This project already has an office.', 'OFFICE_ALREADY_EXISTS');
    }

    const locale = resolveSeedLocale(input.locale);
    if (input.divisions && (input.divisions.length === 0 || input.divisions.length > 20)) {
      throw badRequest('A workspace needs between 1 and 20 proposed divisions.');
    }
    const taken = new Set(['coordinator', 'audit']);
    const proposals = input.divisions?.map((proposal) => readProposal(proposal, taken));
    const displayName = project.custom_project_name?.trim() || project.project_path.split(/[\\/]/).filter(Boolean).pop() || 'project';
    const office = officesDb.createOffice({
      projectPath: project.project_path,
      name: locale === 'en' ? `${displayName} office` : `kantor ${displayName}`,
      locale,
      divisions: proposals
        ? buildDivisionsFromProposals(locale, proposals, input.appSummary ?? null)
        : buildDefaultDivisions(locale),
    });
    // Coordinator → planner → teams, not everyone at once.
    const workers = officesDb.listDivisions(office.id).filter((division) => !division.isCoordinator && !division.isAudit);
    const bySlug = new Map(workers.map((division) => [division.slug, division.id]));
    for (const [from, to] of buildDefaultFlow(workers.map((division) => division.slug))) {
      officesDb.addFlowEdge(office.id, bySlug.get(from) as string, bySlug.get(to) as string);
    }
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

  createDivision(
    officeId: string,
    input: {
      name: string;
      description?: string;
      color?: string;
      agentName?: string;
      rolePrompt?: string;
      position?: { x: number; y: number } | null;
    },
  ): OfficeDivision {
    requireOffice(officeId);
    const name = readBoundedText(input.name, 'name', LIMITS.name, true);
    const description = readBoundedText(input.description ?? '', 'description', LIMITS.description, false);
    const color = input.color?.trim() || DEFAULT_DIVISION_COLOR;
    if (!HEX_COLOR_PATTERN.test(color)) {
      throw badRequest('color must be a #RRGGBB hex value.');
    }

    const agentName = input.agentName === undefined ? name : readBoundedText(input.agentName, 'agentName', LIMITS.name, true);
    const rolePrompt = readBoundedText(input.rolePrompt ?? '', 'rolePrompt', LIMITS.rolePrompt, false);
    const position = readPosition(input.position ?? null);

    const taken = new Set(officesDb.listDivisions(officeId).map((division) => division.slug));
    const created = officesDb.createDivision(officeId, {
      name,
      slug: uniqueSlug(slugify(name), taken),
      description,
      color,
      agent: { name: agentName, rolePrompt, allowedTools: [], skills: [] },
    });
    const division = position ? officesDb.updateDivision(created.id, { position }) ?? created : created;
    broadcastOfficeUpdate(officeId, { entity: 'division', id: division.id, division });
    return division;
  },

  updateDivision(
    officeId: string,
    divisionId: string,
    patch: {
      name?: string;
      description?: string;
      color?: string;
      sortOrder?: number;
      position?: { x: number; y: number } | null;
    },
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
      position: patch.position === undefined ? undefined : readPosition(patch.position),
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
    const hadFlow = officesDb.listFlowEdges(officeId)
      .some((edge) => edge.fromDivisionId === divisionId || edge.toDivisionId === divisionId);
    officesDb.deleteDivision(divisionId);
    broadcastOfficeUpdate(officeId, { entity: 'division', id: divisionId, division: null });
    if (hadFlow) {
      broadcastOfficeUpdate(officeId, { entity: 'flow', flow: officesDb.listFlowEdges(officeId) });
    }
  },

  /**
   * Adds a flow arrow between two worker divisions. The coordinator and the
   * audit layer sit outside the flow, and an arrow may not close a loop,
   * because a loop would leave its tasks waiting on each other forever.
   */
  addFlowEdge(officeId: string, fromDivisionId: string, toDivisionId: string): OfficeFlowEdge[] {
    const from = requireDivision(officeId, fromDivisionId);
    const to = requireDivision(officeId, toDivisionId);
    if (from.isCoordinator || from.isAudit || to.isCoordinator || to.isAudit) {
      throw badRequest('The coordinator and the audit layer are not part of the flow.', 'OFFICE_FLOW_PROTECTED');
    }
    if (from.id === to.id) {
      throw badRequest('A division cannot follow itself.', 'OFFICE_FLOW_SELF');
    }
    const edges = officesDb.listFlowEdges(officeId);
    if (wouldCreateFlowCycle(edges, from.id, to.id)) {
      throw conflict(`${to.name} already leads to ${from.name}; this arrow would make a loop.`, 'OFFICE_FLOW_CYCLE');
    }
    officesDb.addFlowEdge(officeId, from.id, to.id);
    const flow = officesDb.listFlowEdges(officeId);
    broadcastOfficeUpdate(officeId, { entity: 'flow', flow });
    return flow;
  },

  deleteFlowEdge(officeId: string, fromDivisionId: string, toDivisionId: string): OfficeFlowEdge[] {
    requireOffice(officeId);
    officesDb.deleteFlowEdge(officeId, fromDivisionId, toDivisionId);
    const flow = officesDb.listFlowEdges(officeId);
    broadcastOfficeUpdate(officeId, { entity: 'flow', flow });
    return flow;
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
    if (input.skills !== undefined) {
      reconcileSkillNodes(officeId, division.id);
      broadcastSkillNodes(officeId);
    }
    return division;
  },

  /** Places a skill on the canvas; divisions get it by being linked to the node. */
  addSkillNode(officeId: string, input: { skillName: string; position?: { x: number; y: number } | null }): OfficeSkillNode {
    requireOffice(officeId);
    const skillName = input.skillName.trim();
    if (!skillName || skillName.length > MAX_SKILL_NAME_LENGTH) {
      throw badRequest(`skillName must be 1 to ${MAX_SKILL_NAME_LENGTH} characters.`);
    }
    const nodeId = officesDb.createSkillNode(officeId, skillName, readPosition(input.position ?? null));
    return broadcastSkillNodes(officeId).find((node) => node.id === nodeId) as OfficeSkillNode;
  },

  /** Draws a shape on the canvas, on top of the others. Text shapes default to no fill and no border. */
  addShape(officeId: string, input: OfficeShapePatch & { kind: OfficeShapeKind; x: number; y: number; width: number; height: number }): OfficeShape {
    requireOffice(officeId);
    const shape = readShapePatch(input);
    const isText = shape.kind === 'text';
    const shapeId = officesDb.createShape(officeId, {
      kind: shape.kind as OfficeShapeKind,
      x: shape.x as number,
      y: shape.y as number,
      width: shape.width as number,
      height: shape.height as number,
      text: shape.text ?? '',
      fill: shape.fill === undefined ? null : shape.fill,
      stroke: shape.stroke === undefined ? (isText ? null : '#8a8a90') : shape.stroke,
      textColor: shape.textColor ?? null,
      fontSize: shape.fontSize ?? (isText ? 16 : 14),
    });
    return broadcastShapes(officeId).find((candidate) => candidate.id === shapeId) as OfficeShape;
  },

  updateShape(officeId: string, shapeId: string, patch: OfficeShapePatch & { stack?: 'front' | 'back' }): OfficeShape {
    requireShape(officeId, shapeId);
    const { stack, ...fields } = patch;
    const clean = readShapePatch(fields);
    if (stack) {
      clean.z = officesDb.shapeStackEdge(officeId, stack === 'front' ? 'top' : 'bottom');
    }
    officesDb.updateShape(shapeId, clean);
    return broadcastShapes(officeId).find((candidate) => candidate.id === shapeId) as OfficeShape;
  },

  deleteShape(officeId: string, shapeId: string): OfficeShape[] {
    requireShape(officeId, shapeId);
    officesDb.deleteShape(shapeId);
    return broadcastShapes(officeId);
  },

  moveSkillNode(officeId: string, nodeId: string, position: { x: number; y: number } | null): OfficeSkillNode[] {
    requireSkillNode(officeId, nodeId);
    officesDb.moveSkillNode(nodeId, readPosition(position));
    return broadcastSkillNodes(officeId);
  },

  /** Removes a skill node; divisions linked only through it lose the skill. */
  deleteSkillNode(officeId: string, nodeId: string): OfficeSkillNode[] {
    const node = requireSkillNode(officeId, nodeId);
    officesDb.deleteSkillNode(nodeId);
    const skillNodes = broadcastSkillNodes(officeId);
    syncAgentSkills(officeId, node.divisionIds);
    return skillNodes;
  },

  linkSkill(officeId: string, nodeId: string, divisionId: string): OfficeSkillNode[] {
    requireSkillNode(officeId, nodeId);
    requireDivision(officeId, divisionId);
    officesDb.linkSkill(nodeId, divisionId);
    const skillNodes = broadcastSkillNodes(officeId);
    syncAgentSkills(officeId, [divisionId]);
    return skillNodes;
  },

  unlinkSkill(officeId: string, nodeId: string, divisionId: string): OfficeSkillNode[] {
    requireSkillNode(officeId, nodeId);
    officesDb.unlinkSkill(nodeId, divisionId);
    const skillNodes = broadcastSkillNodes(officeId);
    syncAgentSkills(officeId, [divisionId]);
    return skillNodes;
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
   * Checks a provider/model pair picked outside an agent (the "analyse an
   * existing app" step): the model must be in the catalog and the provider
   * logged in.
   */
  async requireReadyModel(
    provider: string,
    model: string,
    getStatus: (provider: LLMProvider) => Promise<ProviderAuthStatus> = (name) => providerAuthService.getProviderAuthStatus(name),
  ): Promise<LLMProvider> {
    const checked = await validateModelChoice(provider, model);
    let connected = false;
    try {
      const status = await getStatus(checked);
      connected = status.installed && status.authenticated;
    } catch {
      connected = false;
    }
    if (!connected) {
      throw conflict(`Connect ${checked} before using it.`, 'OFFICE_PROVIDERS_NOT_CONNECTED', { providers: [checked] });
    }
    return checked;
  },

  /**
   * Refuses to go on while an enabled agent runs on a provider that is not
   * installed or not logged in, so a case fails up front with a clear message
   * instead of every agent turn failing one by one.
   */
  async requireConnectedProviders(
    officeId: string,
    getStatus: (provider: LLMProvider) => Promise<ProviderAuthStatus> = (provider) => providerAuthService.getProviderAuthStatus(provider),
    /** Only these divisions will run (a quick task); omitted means every enabled one. */
    onlyDivisionIds?: string[],
  ): Promise<void> {
    requireOffice(officeId);
    const providers = [...new Set(officesDb
      .listDivisions(officeId)
      .filter((division) => !onlyDivisionIds || onlyDivisionIds.includes(division.id))
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

  /**
   * Tokens every session of a case spent (coordinator, tasks, audits), as the
   * providers' own transcripts report them. A session whose usage cannot be
   * read (its transcript is gone, or the provider reports none) counts as zero.
   */
  async getCaseUsage(
    officeId: string,
    caseId: string,
    readUsage: (sessionId: string) => Promise<{ inputTokens: number; outputTokens: number; cacheTokens?: number; cacheReadTokens?: number; cacheCreationTokens?: number }> =
      (sessionId) => providerTokenUsageService.getSessionTotalUsage(sessionId),
  ): Promise<OfficeCaseUsage> {
    const caseItem = requireCase(officeId, caseId);
    const coordinatorId = officesDb.listDivisions(officeId).find((division) => division.isCoordinator)?.id ?? null;
    const sources: Array<Omit<OfficeSessionUsage, 'inputTokens' | 'outputTokens' | 'cacheTokens' | 'total'>> = [];
    if (caseItem.coordinatorSessionId) {
      sources.push({ sessionId: caseItem.coordinatorSessionId, role: 'coordinator', taskId: null, divisionId: coordinatorId });
    }
    for (const task of officeCasesDb.listTasks(caseId)) {
      if (task.sessionId) {
        sources.push({ sessionId: task.sessionId, role: 'task', taskId: task.id, divisionId: task.divisionId });
      }
      if (task.auditSessionId) {
        const auditId = officesDb.listDivisions(officeId).find((division) => division.isAudit)?.id ?? null;
        sources.push({ sessionId: task.auditSessionId, role: 'audit', taskId: task.id, divisionId: auditId });
      }
    }

    const sessions = await Promise.all(sources.map(async (source): Promise<OfficeSessionUsage> => {
      try {
        const usage = await readUsage(source.sessionId);
        const cacheTokens = usage.cacheTokens ?? (usage.cacheReadTokens ?? 0) + (usage.cacheCreationTokens ?? 0);
        return {
          ...source,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          cacheTokens,
          total: usage.inputTokens + usage.outputTokens + cacheTokens,
        };
      } catch {
        return { ...source, inputTokens: 0, outputTokens: 0, cacheTokens: 0, total: 0 };
      }
    }));
    const sum = (field: 'inputTokens' | 'outputTokens' | 'cacheTokens' | 'total') => sessions.reduce((total, session) => total + session[field], 0);
    return {
      caseId,
      sessions,
      inputTokens: sum('inputTokens'),
      outputTokens: sum('outputTokens'),
      cacheTokens: sum('cacheTokens'),
      total: sum('total'),
    };
  },

  /**
   * Creates a task (case). With `quickDivisionId` it is a quick task: it goes
   * straight to that team's agent, without the orchestrator's plan, the audit
   * or a summary turn.
   */
  createCase(
    officeId: string,
    input: { title: string; description?: string; createdBy: string | null; quickDivisionId?: string | null },
  ): OfficeCase {
    requireOffice(officeId);
    if (input.quickDivisionId) {
      const division = requireDivision(officeId, input.quickDivisionId);
      if (division.isCoordinator || division.isAudit) {
        throw badRequest('A quick task goes to a working team, not to the orchestrator or the audit layer.', 'OFFICE_QUICK_TARGET');
      }
    }
    const caseItem = officeCasesDb.createCase({
      officeId,
      title: readBoundedText(input.title, 'title', LIMITS.caseTitle, true),
      description: readBoundedText(input.description ?? '', 'description', LIMITS.caseDescription, false),
      createdBy: input.createdBy,
      quickDivisionId: input.quickDivisionId ?? null,
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
