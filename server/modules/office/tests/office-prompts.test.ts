import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildAuditPrompt,
  buildCoordinatorPlanPrompt,
  buildTaskPrompt,
} from '@/modules/office/services/office-prompts.service.js';
import type { OfficeDivision } from '@/shared/types.js';

const division = (slug: string, extra: Partial<OfficeDivision> = {}): OfficeDivision => ({
  id: slug,
  officeId: 'o1',
  name: slug,
  slug,
  description: '',
  color: '#000000',
  sortOrder: 0,
  isCoordinator: false,
  isAudit: false,
  createdAt: '',
  position: null,
  agent: {
    id: `${slug}-agent`,
    divisionId: slug,
    name: 'Ana',
    rolePrompt: 'role',
    provider: null,
    model: null,
    allowedTools: [],
    skills: [],
    enabled: true,
    updatedAt: '',
  },
  ...extra,
});

const caseItem = { title: 'Sales report', description: '' };
const task = { ref: 'T1', title: 'Totals', instruction: 'Sum September sales', resultSummary: 'done', attempts: 0 };

test('coding prompts keep talking about the repository, git diff and tests', () => {
  const audit = buildAuditPrompt({ locale: 'en', auditDivision: division('audit'), workerDivision: division('data'), caseItem, task, skills: [] });
  assert.match(audit, /working on this repository/);
  assert.match(audit, /git diff/);
  const plan = buildCoordinatorPlanPrompt({ locale: 'en', coordinator: division('coordinator'), caseItem, workers: [division('backend')], notes: [], skills: [] });
  assert.match(plan, /Look at the repository/);
});

test('non-coding prompts talk about the folder and check results the way the kind needs', () => {
  const finance = buildAuditPrompt({ locale: 'en', kind: 'finance', auditDivision: division('audit'), workerDivision: division('data'), caseItem, task, skills: [] });
  assert.doesNotMatch(finance, /repository|git diff/);
  assert.match(finance, /recompute the key figures/);

  const work = buildTaskPrompt({
    locale: 'id',
    kind: 'finance',
    division: division('data'),
    caseItem,
    task,
    dependencyResults: [],
    skills: [],
    resumedAfterRestart: true,
  });
  assert.doesNotMatch(work, /repository/);
  assert.match(work, /with a script/);
  assert.match(work, /Never change the original data files/);

  const admin = buildTaskPrompt({ locale: 'en', kind: 'admin', division: division('forms'), caseItem, task, dependencyResults: [], skills: [], resumedAfterRestart: false });
  assert.match(admin, /Never invent personal or official data/);

  const plan = buildCoordinatorPlanPrompt({ locale: 'en', kind: 'content', coordinator: division('coordinator'), caseItem, workers: [division('copywriter')], notes: [], skills: [] });
  assert.doesNotMatch(plan, /repository/);
  assert.match(plan, /which result file to produce/);
});
