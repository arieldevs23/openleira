import { randomUUID } from 'node:crypto';

import { getConnection } from '@/modules/database/connection.js';
import type {
  LLMProvider,
  Office,
  OfficeAgent,
  OfficeDivision,
  OfficeDivisionInput,
  OfficePermissionMode,
} from '@/shared/types.js';
import { buildSqlAssignments, readJsonStringArray } from '@/shared/utils.js';

type OfficeRow = {
  id: string;
  project_path: string;
  name: string;
  locale: string;
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
  'id, project_path, name, locale, max_parallel, permission_mode, permission_warning_ack, created_at, updated_at';

const DIVISION_WITH_AGENT_SELECT = `
  SELECT
    d.id, d.office_id, d.name, d.slug, d.description, d.color, d.sort_order,
    d.is_coordinator, d.is_audit, d.created_at,
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
    divisions: OfficeDivisionInput[];
  }): Office {
    const db = getConnection();
    const officeId = randomUUID();
    const now = new Date().toISOString();

    db.transaction(() => {
      db.prepare(`
        INSERT INTO offices (id, project_path, name, locale, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(officeId, input.projectPath, input.name, input.locale, now, now);

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
