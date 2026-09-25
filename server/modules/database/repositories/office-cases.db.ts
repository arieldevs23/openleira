import { randomUUID } from 'node:crypto';

import { getConnection } from '@/modules/database/connection.js';
import type {
  OfficeCase,
  OfficeCasePhase,
  OfficeCaseStatus,
  OfficeCaseWaitingReason,
  OfficeMessage,
  OfficeMessageKind,
  OfficeTask,
  OfficeTaskInput,
  OfficeTaskStatus,
} from '@/shared/types.js';
import { buildSqlAssignments, readJsonRecord, readJsonStringArray } from '@/shared/utils.js';

type CaseRow = {
  id: string;
  office_id: string;
  title: string;
  description: string;
  status: OfficeCaseStatus;
  waiting_reason: OfficeCaseWaitingReason | null;
  phase: OfficeCasePhase | null;
  coordinator_busy: number;
  coordinator_session_id: string | null;
  final_summary: string | null;
  error: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  finished_at: string | null;
};

type TaskRow = {
  id: string;
  case_id: string;
  division_id: string | null;
  parent_task_id: string | null;
  ref: string;
  title: string;
  instruction: string;
  depends_on: string;
  status: OfficeTaskStatus;
  attempts: number;
  result_summary: string | null;
  audit_notes: string | null;
  session_id: string | null;
  audit_session_id: string | null;
  error: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  finished_at: string | null;
};

type MessageRow = {
  id: number;
  case_id: string;
  task_id: string | null;
  from_division_id: string | null;
  to_division_id: string | null;
  kind: OfficeMessageKind;
  payload: string;
  read_at: string | null;
  created_at: string;
};

const toCase = (row: CaseRow): OfficeCase => ({
  id: row.id,
  officeId: row.office_id,
  title: row.title,
  description: row.description,
  status: row.status,
  waitingReason: row.waiting_reason,
  phase: row.phase,
  coordinatorBusy: Boolean(row.coordinator_busy),
  coordinatorSessionId: row.coordinator_session_id,
  finalSummary: row.final_summary,
  error: row.error,
  createdBy: row.created_by,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  startedAt: row.started_at,
  finishedAt: row.finished_at,
});

const toTask = (row: TaskRow): OfficeTask => ({
  id: row.id,
  caseId: row.case_id,
  divisionId: row.division_id,
  parentTaskId: row.parent_task_id,
  ref: row.ref,
  title: row.title,
  instruction: row.instruction,
  dependsOn: readJsonStringArray(row.depends_on),
  status: row.status,
  attempts: row.attempts,
  resultSummary: row.result_summary,
  auditNotes: row.audit_notes,
  sessionId: row.session_id,
  auditSessionId: row.audit_session_id,
  error: row.error,
  sortOrder: row.sort_order,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  startedAt: row.started_at,
  finishedAt: row.finished_at,
});

const toMessage = (row: MessageRow): OfficeMessage => ({
  id: row.id,
  caseId: row.case_id,
  taskId: row.task_id,
  fromDivisionId: row.from_division_id,
  toDivisionId: row.to_division_id,
  kind: row.kind,
  payload: readJsonRecord(row.payload) ?? {},
  readAt: row.read_at,
  createdAt: row.created_at,
});

/** Patchable case fields; `undefined` leaves a column alone, `null` clears it. */
type CasePatch = {
  title?: string;
  description?: string;
  status?: OfficeCaseStatus;
  waitingReason?: OfficeCaseWaitingReason | null;
  phase?: OfficeCasePhase | null;
  coordinatorBusy?: boolean;
  coordinatorSessionId?: string | null;
  finalSummary?: string | null;
  error?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
};

/** Patchable task fields; `undefined` leaves a column alone, `null` clears it. */
type TaskPatch = {
  instruction?: string;
  dependsOn?: string[];
  status?: OfficeTaskStatus;
  attempts?: number;
  resultSummary?: string | null;
  auditNotes?: string | null;
  sessionId?: string | null;
  auditSessionId?: string | null;
  error?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
};

const CASE_COLUMNS = `id, office_id, title, description, status, waiting_reason, phase, coordinator_busy,
  coordinator_session_id, final_summary, error, created_by, created_at, updated_at, started_at, finished_at`;

const TASK_COLUMNS = `id, case_id, division_id, parent_task_id, ref, title, instruction, depends_on, status,
  attempts, result_summary, audit_notes, session_id, audit_session_id, error, sort_order, created_at,
  updated_at, started_at, finished_at`;

/**
 * Office work persistence (cases, tasks, message bus), consumed only by the
 * Office module's services. Every write stamps `updated_at` in ISO form so
 * clients can order and display rows without time-zone guessing.
 */
export const officeCasesDb = {
  createCase(input: {
    officeId: string;
    title: string;
    description: string;
    createdBy: string | null;
  }): OfficeCase {
    const id = randomUUID();
    const now = new Date().toISOString();
    getConnection().prepare(`
      INSERT INTO office_cases (id, office_id, title, description, status, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'draft', ?, ?, ?)
    `).run(id, input.officeId, input.title, input.description, input.createdBy, now, now);

    const created = this.getCase(id);
    if (!created) {
      throw new Error('Created case could not be read back.');
    }
    return created;
  },

  getCase(caseId: string): OfficeCase | null {
    const row = getConnection()
      .prepare(`SELECT ${CASE_COLUMNS} FROM office_cases WHERE id = ?`)
      .get(caseId) as CaseRow | undefined;
    return row ? toCase(row) : null;
  },

  /** Newest first, which is how the case list shows them. */
  listCases(officeId: string): OfficeCase[] {
    const rows = getConnection()
      .prepare(`SELECT ${CASE_COLUMNS} FROM office_cases WHERE office_id = ? ORDER BY created_at DESC`)
      .all(officeId) as CaseRow[];
    return rows.map(toCase);
  },

  /** Every case in one of the given states, across all offices (startup recovery). */
  listCasesByStatus(statuses: OfficeCaseStatus[]): OfficeCase[] {
    if (statuses.length === 0) {
      return [];
    }
    const placeholders = statuses.map(() => '?').join(', ');
    const rows = getConnection()
      .prepare(`SELECT ${CASE_COLUMNS} FROM office_cases WHERE status IN (${placeholders})`)
      .all(...statuses) as CaseRow[];
    return rows.map(toCase);
  },

  updateCase(caseId: string, patch: CasePatch): OfficeCase | null {
    const { sql, values } = buildSqlAssignments([
      ['title', patch.title],
      ['description', patch.description],
      ['status', patch.status],
      ['waiting_reason', patch.waitingReason],
      ['phase', patch.phase],
      ['coordinator_busy', patch.coordinatorBusy === undefined ? undefined : patch.coordinatorBusy ? 1 : 0],
      ['coordinator_session_id', patch.coordinatorSessionId],
      ['final_summary', patch.finalSummary],
      ['error', patch.error],
      ['started_at', patch.startedAt],
      ['finished_at', patch.finishedAt],
    ]);
    if (sql) {
      getConnection()
        .prepare(`UPDATE office_cases SET ${sql}, updated_at = ? WHERE id = ?`)
        .run(...values, new Date().toISOString(), caseId);
    }
    return this.getCase(caseId);
  },

  deleteCase(caseId: string): boolean {
    return getConnection().prepare('DELETE FROM office_cases WHERE id = ?').run(caseId).changes > 0;
  },

  /** Inserts a batch of tasks after the case's existing ones, in one transaction. */
  createTasks(caseId: string, tasks: OfficeTaskInput[]): OfficeTask[] {
    const db = getConnection();
    const now = new Date().toISOString();
    db.transaction(() => {
      const next = db.prepare(`
        SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM office_tasks WHERE case_id = ?
      `).get(caseId) as { next_order: number };
      const insert = db.prepare(`
        INSERT INTO office_tasks
          (id, case_id, division_id, parent_task_id, ref, title, instruction, depends_on, status,
           sort_order, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      tasks.forEach((task, index) => {
        insert.run(
          task.id,
          caseId,
          task.divisionId,
          task.parentTaskId,
          task.ref,
          task.title,
          task.instruction,
          JSON.stringify(task.dependsOn),
          task.status,
          next.next_order + index,
          now,
          now,
        );
      });
    })();

    return tasks
      .map((task) => this.getTask(task.id))
      .filter((task): task is OfficeTask => task !== null);
  },

  getTask(taskId: string): OfficeTask | null {
    const row = getConnection()
      .prepare(`SELECT ${TASK_COLUMNS} FROM office_tasks WHERE id = ?`)
      .get(taskId) as TaskRow | undefined;
    return row ? toTask(row) : null;
  },

  listTasks(caseId: string): OfficeTask[] {
    const rows = getConnection()
      .prepare(`SELECT ${TASK_COLUMNS} FROM office_tasks WHERE case_id = ? ORDER BY sort_order ASC, created_at ASC`)
      .all(caseId) as TaskRow[];
    return rows.map(toTask);
  },

  updateTask(taskId: string, patch: TaskPatch): OfficeTask | null {
    const { sql, values } = buildSqlAssignments([
      ['instruction', patch.instruction],
      ['depends_on', patch.dependsOn === undefined ? undefined : JSON.stringify(patch.dependsOn)],
      ['status', patch.status],
      ['attempts', patch.attempts],
      ['result_summary', patch.resultSummary],
      ['audit_notes', patch.auditNotes],
      ['session_id', patch.sessionId],
      ['audit_session_id', patch.auditSessionId],
      ['error', patch.error],
      ['started_at', patch.startedAt],
      ['finished_at', patch.finishedAt],
    ]);
    if (sql) {
      getConnection()
        .prepare(`UPDATE office_tasks SET ${sql}, updated_at = ? WHERE id = ?`)
        .run(...values, new Date().toISOString(), taskId);
    }
    return this.getTask(taskId);
  },

  /** Does any case of this office still reference the division through a live task? */
  hasActiveTasksForDivision(divisionId: string): boolean {
    const row = getConnection().prepare(`
      SELECT 1 FROM office_tasks t
      JOIN office_cases c ON c.id = t.case_id
      WHERE t.division_id = ? AND c.status IN ('running', 'waiting_user')
      LIMIT 1
    `).get(divisionId);
    return Boolean(row);
  },

  addMessage(input: {
    caseId: string;
    taskId?: string | null;
    fromDivisionId: string | null;
    toDivisionId: string | null;
    kind: OfficeMessageKind;
    payload: Record<string, unknown>;
  }): OfficeMessage {
    const db = getConnection();
    const result = db.prepare(`
      INSERT INTO office_messages (case_id, task_id, from_division_id, to_division_id, kind, payload, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.caseId,
      input.taskId ?? null,
      input.fromDivisionId,
      input.toDivisionId,
      input.kind,
      JSON.stringify(input.payload),
      new Date().toISOString(),
    );
    const row = db.prepare('SELECT * FROM office_messages WHERE id = ?').get(Number(result.lastInsertRowid)) as MessageRow;
    return toMessage(row);
  },

  listMessages(caseId: string): OfficeMessage[] {
    const rows = getConnection()
      .prepare('SELECT * FROM office_messages WHERE case_id = ? ORDER BY id ASC')
      .all(caseId) as MessageRow[];
    return rows.map(toMessage);
  },

  /** User notes addressed to a division that it has not been given yet, oldest first. */
  listUnreadNotes(caseId: string, toDivisionId: string): OfficeMessage[] {
    const rows = getConnection().prepare(`
      SELECT * FROM office_messages
      WHERE case_id = ? AND to_division_id = ? AND kind = 'note' AND from_division_id IS NULL AND read_at IS NULL
      ORDER BY id ASC
    `).all(caseId, toDivisionId) as MessageRow[];
    return rows.map(toMessage);
  },

  markMessagesRead(messageIds: number[]): void {
    if (messageIds.length === 0) {
      return;
    }
    const placeholders = messageIds.map(() => '?').join(', ');
    getConnection()
      .prepare(`UPDATE office_messages SET read_at = ? WHERE id IN (${placeholders})`)
      .run(new Date().toISOString(), ...messageIds);
  },
};
