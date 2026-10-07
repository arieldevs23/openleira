import { randomUUID } from 'node:crypto';

import { getConnection } from '@/modules/database/connection.js';
import type {
  LLMProvider,
  Office,
  OfficeAgent,
  OfficeDivision,
  OfficeDivisionInput,
  OfficeFlowEdge,
  OfficePermissionMode,
  OfficeShape,
  OfficeShapeKind,
  OfficeShapePatch,
  OfficeSkillNode,
  OfficeSoloSession,
  OfficeWorkspaceKind,
  OfficeWorkspaceSummary,
} from '@/shared/types.js';
import { buildSqlAssignments, isOfficeWorkspaceKind, readJsonStringArray } from '@/shared/utils.js';

type OfficeRow = {
  id: string;
  project_path: string;
  name: string;
  locale: string;
  kind: string;
  max_parallel: number;
  permission_mode: string;
  permission_warning_ack: number;
  created_at: string;
  updated_at: string;
};

/** A division joined with its agent; agent columns are prefixed `agent_`. */
type DivisionWithAgentRow = {
  id: string;
  office_id: string;
  name: string;
  slug: string;
  description: string;
  color: string;
  sort_order: number;
  is_coordinator: number;
  is_audit: number;
  created_at: string;
  pos_x: number | null;
  pos_y: number | null;
  agent_id: string;
  agent_name: string;
  agent_role_prompt: string;
  agent_provider: string | null;
  agent_model: string | null;
  agent_allowed_tools: string;
  agent_skills: string;
  agent_enabled: number;
  agent_updated_at: string;
};

const OFFICE_COLUMNS =
  'id, project_path, name, locale, kind, max_parallel, permission_mode, permission_warning_ack, created_at, updated_at';

const DIVISION_WITH_AGENT_SELECT = `
  SELECT
    d.id, d.office_id, d.name, d.slug, d.description, d.color, d.sort_order,
    d.is_coordinator, d.is_audit, d.created_at, d.pos_x, d.pos_y,
    a.id AS agent_id, a.name AS agent_name, a.role_prompt AS agent_role_prompt,
    a.provider AS agent_provider, a.model AS agent_model,
    a.allowed_tools AS agent_allowed_tools, a.skills AS agent_skills,
    a.enabled AS agent_enabled, a.updated_at AS agent_updated_at
  FROM office_divisions d
  JOIN office_agents a ON a.division_id = d.id
`;

const PERMISSION_MODES: OfficePermissionMode[] = ['bypassPermissions', 'acceptEdits', 'default'];

const toOffice = (row: OfficeRow): Office => ({
  id: row.id,
  projectPath: row.project_path,
  name: row.name,
  locale: row.locale,
  kind: isOfficeWorkspaceKind(row.kind) ? row.kind : 'coding',
  maxParallel: row.max_parallel,
  // An unknown stored value falls back to the office default rather than
  // handing a runtime a mode it does not understand.
  permissionMode: PERMISSION_MODES.includes(row.permission_mode as OfficePermissionMode)
    ? row.permission_mode as OfficePermissionMode
    : 'bypassPermissions',
  permissionWarningAcknowledged: Boolean(row.permission_warning_ack),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const toDivision = (row: DivisionWithAgentRow): OfficeDivision => {
  const agent: OfficeAgent = {
    id: row.agent_id,
    divisionId: row.id,
    name: row.agent_name,
    rolePrompt: row.agent_role_prompt,
    provider: (row.agent_provider || null) as LLMProvider | null,
    model: row.agent_model || null,
    allowedTools: readJsonStringArray(row.agent_allowed_tools),
    skills: readJsonStringArray(row.agent_skills),
    enabled: Boolean(row.agent_enabled),
    updatedAt: row.agent_updated_at,
  };

  return {
    id: row.id,
    officeId: row.office_id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    color: row.color,
    sortOrder: row.sort_order,
    isCoordinator: Boolean(row.is_coordinator),
    isAudit: Boolean(row.is_audit),
    createdAt: row.created_at,
    position: row.pos_x === null || row.pos_y === null ? null : { x: row.pos_x, y: row.pos_y },
    agent,
  };
};

const readDivision = (divisionId: string): OfficeDivision | null => {
  const row = getConnection()
    .prepare(`${DIVISION_WITH_AGENT_SELECT} WHERE d.id = ?`)
    .get(divisionId) as DivisionWithAgentRow | undefined;
  return row ? toDivision(row) : null;
};

const insertDivision = (
  officeId: string,
  input: OfficeDivisionInput,
  sortOrder: number,
  now: string,
): string => {
  const db = getConnection();
  const divisionId = randomUUID();
  db.prepare(`
    INSERT INTO office_divisions
      (id, office_id, name, slug, description, color, sort_order, is_coordinator, is_audit, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    divisionId,
    officeId,
    input.name,
    input.slug,
    input.description,
    input.color,
    sortOrder,
    input.isCoordinator ? 1 : 0,
    input.isAudit ? 1 : 0,
    now,
  );
  db.prepare(`
    INSERT INTO office_agents
      (id, division_id, name, role_prompt, provider, model, allowed_tools, skills, enabled, updated_at)
    VALUES (?, ?, ?, ?, NULL, NULL, ?, ?, 1, ?)
  `).run(
    randomUUID(),
    divisionId,
    input.agent.name,
    input.agent.rolePrompt,
    JSON.stringify(input.agent.allowedTools),
    JSON.stringify(input.agent.skills),
    now,
  );
  return divisionId;
};

/** Patchable office settings; omitted fields are left unchanged. */
type OfficeSettingsPatch = {
  name?: string;
  maxParallel?: number;
  permissionMode?: OfficePermissionMode;
  permissionWarningAcknowledged?: boolean;
};

/** Patchable division fields; omitted fields are left unchanged. */
type DivisionPatch = {
  name?: string;
  description?: string;
  color?: string;
  sortOrder?: number;
  /** `null` returns the node to automatic layout. */
  position?: { x: number; y: number } | null;
};

type FlowEdgeRow = { from_division_id: string; to_division_id: string; created_at: string };

const toFlowEdge = (row: FlowEdgeRow): OfficeFlowEdge => ({
  fromDivisionId: row.from_division_id,
  toDivisionId: row.to_division_id,
  createdAt: row.created_at,
});

type ShapeRow = {
  id: string;
  kind: string;
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  fill: string | null;
  stroke: string | null;
  text_color: string | null;
  font_size: number;
  z: number;
  created_at: string;
  updated_at: string;
};

const toShape = (row: ShapeRow): OfficeShape => ({
  id: row.id,
  kind: row.kind as OfficeShapeKind,
  x: row.x,
  y: row.y,
  width: row.width,
  height: row.height,
  text: row.text,
  fill: row.fill,
  stroke: row.stroke,
  textColor: row.text_color,
  fontSize: row.font_size,
  z: row.z,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

/** Shape fields to their columns, for partial updates. */
const SHAPE_COLUMNS: Record<keyof OfficeShapePatch, string> = {
  kind: 'kind', x: 'x', y: 'y', width: 'width', height: 'height', text: 'text',
  fill: 'fill', stroke: 'stroke', textColor: 'text_color', fontSize: 'font_size', z: 'z',
};

type SkillNodeRow = {
  id: string;
  skill_name: string;
  pos_x: number | null;
  pos_y: number | null;
  created_at: string;
  division_ids: string | null;
};

type WorkspaceSummaryRow = OfficeRow & {
  project_id: string;
  custom_project_name: string | null;
  active_cases: number;
  total_cases: number;
};

/** Patchable agent fields; omitted fields are left unchanged. */
type AgentPatch = {
  name?: string;
  rolePrompt?: string;
  provider?: LLMProvider | null;
  model?: string | null;
  allowedTools?: string[];
  skills?: string[];
  enabled?: boolean;
};

/**
 * Office structure persistence (offices, divisions, agents), consumed only by
 * the Office module's services. Each division always has exactly one agent;
 * both rows are written in one transaction.
 */
export const officesDb = {
  getOfficeById(officeId: string): Office | null {
    const row = getConnection()
      .prepare(`SELECT ${OFFICE_COLUMNS} FROM offices WHERE id = ?`)
      .get(officeId) as OfficeRow | undefined;
    return row ? toOffice(row) : null;
  },

  /**
   * Every workspace (office) with its project folder and live case counts,
   * newest first; feeds the workspace switcher.
   */
  listWorkspaces(): OfficeWorkspaceSummary[] {
    const rows = getConnection().prepare(`
      SELECT
        o.id, o.project_path, o.name, o.locale, o.kind, o.max_parallel, o.permission_mode, o.permission_warning_ack,
        o.created_at, o.updated_at,
        p.project_id, p.custom_project_name,
        (SELECT COUNT(*) FROM office_cases c WHERE c.office_id = o.id AND c.status IN ('running', 'waiting_user')) AS active_cases,
        (SELECT COUNT(*) FROM office_cases c WHERE c.office_id = o.id) AS total_cases
      FROM offices o
      JOIN projects p ON p.project_path = o.project_path
      ORDER BY o.created_at DESC
    `).all() as WorkspaceSummaryRow[];
    return rows.map((row) => ({
      office: toOffice(row),
      projectId: row.project_id,
      projectName: row.custom_project_name || row.project_path.split(/[\\/]/).filter(Boolean).pop() || row.project_path,
      activeCases: row.active_cases,
      totalCases: row.total_cases,
    }));
  },

  /** Deletes an office; divisions, agents, cases, tasks, messages and flow cascade. */
  deleteOffice(officeId: string): boolean {
    return getConnection().prepare('DELETE FROM offices WHERE id = ?').run(officeId).changes > 0;
  },

  listFlowEdges(officeId: string): OfficeFlowEdge[] {
    const rows = getConnection()
      .prepare('SELECT from_division_id, to_division_id, created_at FROM office_flow_edges WHERE office_id = ? ORDER BY created_at ASC')
      .all(officeId) as FlowEdgeRow[];
    return rows.map(toFlowEdge);
  },

  /** Adds one flow arrow; adding an arrow that already exists is a no-op. */
  addFlowEdge(officeId: string, fromDivisionId: string, toDivisionId: string): void {
    getConnection()
      .prepare(`
        INSERT OR IGNORE INTO office_flow_edges (office_id, from_division_id, to_division_id, created_at)
        VALUES (?, ?, ?, ?)
      `)
      .run(officeId, fromDivisionId, toDivisionId, new Date().toISOString());
  },

  deleteFlowEdge(officeId: string, fromDivisionId: string, toDivisionId: string): boolean {
    return getConnection()
      .prepare('DELETE FROM office_flow_edges WHERE office_id = ? AND from_division_id = ? AND to_division_id = ?')
      .run(officeId, fromDivisionId, toDivisionId).changes > 0;
  },

  /** Skill nodes of the canvas with the divisions linked to each, oldest first. */
  listSkillNodes(officeId: string): OfficeSkillNode[] {
    const rows = getConnection().prepare(`
      SELECT n.id, n.skill_name, n.pos_x, n.pos_y, n.created_at,
        (SELECT json_group_array(l.division_id) FROM office_skill_links l WHERE l.skill_node_id = n.id) AS division_ids
      FROM office_skill_nodes n
      WHERE n.office_id = ?
      ORDER BY n.created_at ASC, n.rowid ASC
    `).all(officeId) as SkillNodeRow[];
    return rows.map((row) => ({
      id: row.id,
      skillName: row.skill_name,
      position: row.pos_x === null || row.pos_y === null ? null : { x: row.pos_x, y: row.pos_y },
      divisionIds: readJsonStringArray(row.division_ids ?? '[]'),
      createdAt: row.created_at,
    }));
  },

  createSkillNode(officeId: string, skillName: string, position: { x: number; y: number } | null): string {
    const id = randomUUID();
    getConnection()
      .prepare('INSERT INTO office_skill_nodes (id, office_id, skill_name, pos_x, pos_y, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, officeId, skillName, position?.x ?? null, position?.y ?? null, new Date().toISOString());
    return id;
  },

  moveSkillNode(nodeId: string, position: { x: number; y: number } | null): void {
    getConnection()
      .prepare('UPDATE office_skill_nodes SET pos_x = ?, pos_y = ? WHERE id = ?')
      .run(position?.x ?? null, position?.y ?? null, nodeId);
  },

  /** Drawn shapes of the canvas, bottom of the stack first. */
  listShapes(officeId: string): OfficeShape[] {
    const rows = getConnection()
      .prepare('SELECT * FROM office_shapes WHERE office_id = ? ORDER BY z ASC, created_at ASC, rowid ASC')
      .all(officeId) as ShapeRow[];
    return rows.map(toShape);
  },

  getShape(shapeId: string): (OfficeShape & { officeId: string }) | null {
    const row = getConnection().prepare('SELECT * FROM office_shapes WHERE id = ?').get(shapeId) as (ShapeRow & { office_id: string }) | undefined;
    return row ? { ...toShape(row), officeId: row.office_id } : null;
  },

  /** Adds a shape on top of every other one and returns its id. */
  createShape(officeId: string, shape: Omit<OfficeShape, 'id' | 'z' | 'createdAt' | 'updatedAt'>): string {
    const id = randomUUID();
    const now = new Date().toISOString();
    const top = getConnection().prepare('SELECT COALESCE(MAX(z), 0) AS z FROM office_shapes WHERE office_id = ?').get(officeId) as { z: number };
    getConnection().prepare(`
      INSERT INTO office_shapes (id, office_id, kind, x, y, width, height, text, fill, stroke, text_color, font_size, z, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, officeId, shape.kind, shape.x, shape.y, shape.width, shape.height, shape.text, shape.fill, shape.stroke, shape.textColor, shape.fontSize, top.z + 1, now, now);
    return id;
  },

  updateShape(shapeId: string, patch: OfficeShapePatch): void {
    const entries = (Object.keys(patch) as Array<keyof OfficeShapePatch>).filter((key) => patch[key] !== undefined);
    if (entries.length === 0) {
      return;
    }
    const assignments = entries.map((key) => `${SHAPE_COLUMNS[key]} = ?`).join(', ');
    getConnection()
      .prepare(`UPDATE office_shapes SET ${assignments}, updated_at = ? WHERE id = ?`)
      .run(...entries.map((key) => patch[key] as string | number | null), new Date().toISOString(), shapeId);
  },

  /** The z just above (or below) every shape of the office, for "bring to front" / "send to back". */
  shapeStackEdge(officeId: string, edge: 'top' | 'bottom'): number {
    const row = getConnection()
      .prepare(`SELECT COALESCE(${edge === 'top' ? 'MAX(z) + 1' : 'MIN(z) - 1'}, 0) AS z FROM office_shapes WHERE office_id = ?`)
      .get(officeId) as { z: number };
    return row.z;
  },

  deleteShape(shapeId: string): void {
    getConnection().prepare('DELETE FROM office_shapes WHERE id = ?').run(shapeId);
  },

  deleteSkillNode(nodeId: string): void {
    getConnection().prepare('DELETE FROM office_skill_nodes WHERE id = ?').run(nodeId);
  },

  linkSkill(nodeId: string, divisionId: string): void {
    getConnection()
      .prepare('INSERT OR IGNORE INTO office_skill_links (skill_node_id, division_id, created_at) VALUES (?, ?, ?)')
      .run(nodeId, divisionId, new Date().toISOString());
  },

  unlinkSkill(nodeId: string, divisionId: string): void {
    getConnection().prepare('DELETE FROM office_skill_links WHERE skill_node_id = ? AND division_id = ?').run(nodeId, divisionId);
  },

  /** Whether a session was started from a workspace's solo view (the chat gate lets those through). */
  isSoloSession(sessionId: string): boolean {
    return Boolean(getConnection().prepare('SELECT 1 FROM office_solo_sessions WHERE session_id = ?').get(sessionId));
  },

  /** Marks a session as a solo chat; registering it twice keeps the first time. */
  addSoloSession(sessionId: string): void {
    getConnection()
      .prepare('INSERT OR IGNORE INTO office_solo_sessions (session_id, created_at) VALUES (?, ?)')
      .run(sessionId, new Date().toISOString());
  },

  /** The solo chats in a project folder that are not archived, most recently active first. */
  listSoloSessions(projectPath: string, limit: number): OfficeSoloSession[] {
    const rows = getConnection()
      .prepare(
        `SELECT s.session_id, s.provider, s.custom_name, s.created_at, s.updated_at, o.created_at AS solo_created_at
         FROM office_solo_sessions o
         JOIN sessions s ON s.session_id = o.session_id
         WHERE s.project_path = ? AND s.isArchived = 0
         ORDER BY datetime(COALESCE(s.updated_at, s.created_at, o.created_at)) DESC, s.session_id DESC
         LIMIT ?`,
      )
      .all(projectPath, limit) as {
        session_id: string;
        provider: string;
        custom_name: string | null;
        created_at: string | null;
        updated_at: string | null;
        solo_created_at: string;
      }[];
    return rows.map((row) => ({
      sessionId: row.session_id,
      provider: row.provider as LLMProvider,
      title: row.custom_name ?? '',
      createdAt: row.created_at ?? row.solo_created_at,
      lastActivity: row.updated_at ?? row.created_at ?? row.solo_created_at,
    }));
  },

  getOfficeByProjectPath(projectPath: string): Office | null {
    const row = getConnection()
      .prepare(`SELECT ${OFFICE_COLUMNS} FROM offices WHERE project_path = ?`)
      .get(projectPath) as OfficeRow | undefined;
    return row ? toOffice(row) : null;
  },

  /**
   * Creates an office with its seeded divisions. Divisions are ordered as
   * given, so the seed decides how the tree lays them out.
   */
  createOffice(input: {
    projectPath: string;
    name: string;
    locale: string;
    kind: OfficeWorkspaceKind;
    divisions: OfficeDivisionInput[];
  }): Office {
    const db = getConnection();
    const officeId = randomUUID();
    const now = new Date().toISOString();

    db.transaction(() => {
      db.prepare(`
        INSERT INTO offices (id, project_path, name, locale, kind, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(officeId, input.projectPath, input.name, input.locale, input.kind, now, now);

      input.divisions.forEach((division, index) => {
        insertDivision(officeId, division, index, now);
      });
    })();

    const office = this.getOfficeById(officeId);
    if (!office) {
      throw new Error('Created office could not be read back.');
    }
    return office;
  },

  updateOffice(officeId: string, patch: OfficeSettingsPatch): Office | null {
    const { sql, values } = buildSqlAssignments([
      ['name', patch.name],
      ['max_parallel', patch.maxParallel],
      ['permission_mode', patch.permissionMode],
      [
        'permission_warning_ack',
        patch.permissionWarningAcknowledged === undefined ? undefined : patch.permissionWarningAcknowledged ? 1 : 0,
      ],
    ]);
    if (sql) {
      getConnection()
        .prepare(`UPDATE offices SET ${sql}, updated_at = ? WHERE id = ?`)
        .run(...values, new Date().toISOString(), officeId);
    }
    return this.getOfficeById(officeId);
  },

  listDivisions(officeId: string): OfficeDivision[] {
    const rows = getConnection()
      .prepare(`${DIVISION_WITH_AGENT_SELECT} WHERE d.office_id = ? ORDER BY d.sort_order ASC, d.created_at ASC`)
      .all(officeId) as DivisionWithAgentRow[];
    return rows.map(toDivision);
  },

  getDivision(divisionId: string): OfficeDivision | null {
    return readDivision(divisionId);
  },

  /** Appends a division (and its agent) after the existing ones. */
  createDivision(officeId: string, input: OfficeDivisionInput): OfficeDivision {
    const db = getConnection();
    const now = new Date().toISOString();
    const divisionId = db.transaction(() => {
      const next = db.prepare(`
        SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM office_divisions WHERE office_id = ?
      `).get(officeId) as { next_order: number };
      return insertDivision(officeId, input, next.next_order, now);
    })();

    const division = readDivision(divisionId);
    if (!division) {
      throw new Error('Created division could not be read back.');
    }
    return division;
  },

  updateDivision(divisionId: string, patch: DivisionPatch): OfficeDivision | null {
    const { sql, values } = buildSqlAssignments([
      ['name', patch.name],
      ['description', patch.description],
      ['color', patch.color],
      ['sort_order', patch.sortOrder],
      ['pos_x', patch.position === undefined ? undefined : patch.position?.x ?? null],
      ['pos_y', patch.position === undefined ? undefined : patch.position?.y ?? null],
    ]);
    if (sql) {
      getConnection().prepare(`UPDATE office_divisions SET ${sql} WHERE id = ?`).run(...values, divisionId);
    }
    return readDivision(divisionId);
  },

  /** Deletes a division; its agent cascades, historic tasks keep a NULL division. */
  deleteDivision(divisionId: string): boolean {
    return getConnection().prepare('DELETE FROM office_divisions WHERE id = ?').run(divisionId).changes > 0;
  },

  /** Updates one agent and returns its division with the new agent state. */
  updateAgent(agentId: string, patch: AgentPatch): OfficeDivision | null {
    const db = getConnection();
    const { sql, values } = buildSqlAssignments([
      ['name', patch.name],
      ['role_prompt', patch.rolePrompt],
      ['provider', patch.provider],
      ['model', patch.model],
      ['allowed_tools', patch.allowedTools === undefined ? undefined : JSON.stringify(patch.allowedTools)],
      ['skills', patch.skills === undefined ? undefined : JSON.stringify(patch.skills)],
      ['enabled', patch.enabled === undefined ? undefined : patch.enabled ? 1 : 0],
    ]);
    if (sql) {
      db.prepare(`UPDATE office_agents SET ${sql}, updated_at = ? WHERE id = ?`)
        .run(...values, new Date().toISOString(), agentId);
    }

    const row = db.prepare('SELECT division_id FROM office_agents WHERE id = ?').get(agentId) as
      | { division_id: string }
      | undefined;
    return row ? readDivision(row.division_id) : null;
  },
};
