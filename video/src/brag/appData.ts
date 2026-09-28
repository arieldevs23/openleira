import type { OfficeCase, OfficeDivision, OfficeFlowEdge, OfficeTask, OfficeTaskStatus } from '@/shared/types';

const NOW = '2026-09-28T10:00:00.000Z';

const TEAMS: Array<[slug: string, name: string, agent: string, model: string, x: number, y: number, extra?: Partial<OfficeDivision>]> = [
  ['coordinator', 'Orchestrator', 'Sekar', 'opus', 520, 40, { isCoordinator: true }],
  ['planner', 'Planner', 'Bima', 'opus', 520, 200],
  ['designer', 'Designer UI/UX', 'Laras', 'sonnet', 120, 380],
  ['backend', 'Backend', 'Arya', 'sonnet', 520, 380],
  ['docs', 'Docs', 'Tari', 'haiku', 920, 380],
  ['frontend', 'Frontend', 'Nadia', 'sonnet', 120, 560],
  ['security', 'Security', 'Galih', 'sonnet', 520, 560],
  ['audit', 'QA / Audit', 'Wira', 'sonnet', 920, 560, { isAudit: true }],
];

/** The default workspace from the app's seed, placed like a user would arrange it. */
export const DIVISIONS: OfficeDivision[] = TEAMS.map(([slug, name, agent, model, x, y, extra], index) => ({
  id: `div-${slug}`,
  officeId: 'office-1',
  slug,
  name,
  description: '',
  color: '#C9CCD4',
  isCoordinator: false,
  isAudit: false,
  sortOrder: index,
  position: { x, y },
  createdAt: NOW,
  updatedAt: NOW,
  agent: {
    id: `agent-${slug}`,
    divisionId: `div-${slug}`,
    name: agent,
    rolePrompt: '',
    provider: 'claude',
    model,
    allowedTools: [],
    skills: [],
    enabled: true,
    updatedAt: NOW,
  },
  ...extra,
})) as unknown as OfficeDivision[];

export const FLOW: OfficeFlowEdge[] = [
  ['planner', 'designer'], ['planner', 'backend'], ['planner', 'docs'], ['designer', 'frontend'], ['backend', 'security'],
].map(([from, to]) => ({ id: `${from}-${to}`, officeId: 'office-1', fromDivisionId: `div-${from}`, toDivisionId: `div-${to}`, createdAt: NOW })) as unknown as OfficeFlowEdge[];

export const workCase = (overrides: Partial<OfficeCase>): OfficeCase => ({
  id: 'case-1',
  officeId: 'office-1',
  title: 'Checkout page',
  description: 'Build the checkout page',
  status: 'running',
  waitingReason: null,
  phase: 'executing',
  coordinatorBusy: false,
  coordinatorSessionId: 'coord',
  finalSummary: null,
  error: null,
  createdBy: null,
  createdAt: NOW,
  updatedAt: NOW,
  startedAt: NOW,
  finishedAt: null,
  quickDivisionId: null,
  followsCaseId: null,
  ...overrides,
});

export const task = (ref: string, slug: string, title: string, status: OfficeTaskStatus): OfficeTask => ({
  id: `task-${ref}`,
  caseId: 'case-1',
  divisionId: `div-${slug}`,
  parentTaskId: null,
  ref,
  title,
  instruction: '',
  dependsOn: [],
  status,
  attempts: 0,
  resultSummary: null,
  auditNotes: null,
  sessionId: null,
  auditSessionId: null,
  error: null,
  changedFiles: [],
  sortOrder: 0,
  createdAt: NOW,
  updatedAt: NOW,
  startedAt: null,
  finishedAt: null,
});

const noop = async () => ({}) as never;
/** The canvas only calls these on user edits, which the film never makes. */
export const CANVAS_ACTIONS = {
  addFlowEdge: noop, deleteFlowEdge: noop, updateDivision: noop, updateAgent: noop,
  addSkillNode: noop, moveSkillNode: noop, deleteSkillNode: noop, linkSkill: noop, unlinkSkill: noop,
  addShape: noop, updateShape: noop, deleteShape: noop,
} as never;

/** Stable empty lists: the canvas would re-fit forever on a fresh [] every render. */
export const NO_SKILL_NODES = [] as never[];
export const NO_SHAPES = [] as never[];
export const NO_SKILLS = [] as never[];
export const NO_MESSAGES = [] as never[];
