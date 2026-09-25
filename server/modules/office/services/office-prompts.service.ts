import type { OfficeCase, OfficeDivision, OfficeMessage, OfficeTask } from '@/shared/types.js';

/**
 * Pure prompt builders for every office turn.
 *
 * The orchestration protocol (JSON shapes, section markers) is written in
 * English because that is what models follow most reliably; the agent's own
 * role prompt is inserted verbatim, and a language line asks for human-facing
 * text in the office's language.
 */

/** A skill an agent may use, as listed in its prompt. */
export type PromptSkill = { name: string; description: string; command: string };

/** A finished dependency's result, forwarded to the next agent via the coordinator. */
export type DependencyResult = { divisionName: string; ref: string; title: string; summary: string };

const languageLine = (locale: string): string => (
  locale.toLowerCase().startsWith('en')
    ? 'Write every human-readable text (titles, instructions, summaries, notes) in English.'
    : 'Write every human-readable text (titles, instructions, summaries, notes) in Indonesian (Bahasa Indonesia), casual and clear.'
);

const summaryHeading = (locale: string): string => (
  locale.toLowerCase().startsWith('en') ? '## Summary' : '## Ringkasan'
);

const describeCase = (caseItem: Pick<OfficeCase, 'title' | 'description'>): string => [
  `Title: ${caseItem.title}`,
  caseItem.description.trim() ? `Description:\n${caseItem.description.trim()}` : 'Description: (none)',
].join('\n');

const describeWorkers = (workers: OfficeDivision[]): string => workers
  .map((division) => `- ${division.slug}: ${division.name} (agent ${division.agent.name}) — ${division.description}`)
  .join('\n');

const describeNotes = (notes: OfficeMessage[]): string => notes
  .map((note) => `- ${String(note.payload.text ?? '').trim()}`)
  .filter((line) => line !== '- ')
  .join('\n');

const describeTaskLine = (task: OfficeTask, divisionsById: Map<string, OfficeDivision>): string => {
  const division = task.divisionId ? divisionsById.get(task.divisionId) : null;
  const deps = task.dependsOn.length > 0 ? ` (after ${task.dependsOn.join(', ')})` : '';
  return `- ${task.ref} [${task.status}] ${division?.slug ?? 'deleted-division'}: ${task.title}${deps}`;
};

const PLAN_JSON_SHAPE = `{
  "summary": "one short paragraph for the user describing the plan",
  "tasks": [
    {
      "id": "T1",
      "division_slug": "<one of the division slugs above>",
      "title": "short title",
      "instruction": "what to do, where, expected result, constraints",
      "depends_on": []
    }
  ],
  "question": null
}`;

const CHECKPOINT_JSON_SHAPE = `{
  "reply": "short answer for the user about what you decided",
  "tasks": [
    {
      "id": "T9",
      "division_slug": "<division slug>",
      "title": "short title",
      "instruction": "what to do",
      "depends_on": ["T2"],
      "replaces": null
    }
  ],
  "question": null
}`;

const withRolePrompt = (division: OfficeDivision): string => [
  `You are ${division.agent.name}, the agent of the "${division.name}" division in an AI office working on this repository.`,
  '',
  '## Your role',
  division.agent.rolePrompt.trim() || '(no extra role instructions)',
].join('\n');

const describeSkills = (skills: PromptSkill[]): string => (
  skills.length === 0
    ? ''
    : [
      '',
      '## Skills you should use when relevant',
      ...skills.map((skill) => `- ${skill.command} — ${skill.description || skill.name}`),
    ].join('\n')
);

/**
 * The coordinator's first turn: read the case and the available divisions and
 * answer with a JSON plan (or a single question when the case is too vague).
 */
export function buildCoordinatorPlanPrompt(input: {
  locale: string;
  coordinator: OfficeDivision;
  caseItem: Pick<OfficeCase, 'title' | 'description'>;
  workers: OfficeDivision[];
  notes: OfficeMessage[];
  skills: PromptSkill[];
}): string {
  const notes = describeNotes(input.notes);
  return [
    withRolePrompt(input.coordinator),
    describeSkills(input.skills),
    '',
    '## The case from the user',
    describeCase(input.caseItem),
    notes ? `\n## Extra notes from the user\n${notes}` : '',
    '',
    '## Divisions you can assign work to',
    describeWorkers(input.workers),
    '',
    '## What to do now',
    'Look at the repository as much as you need, then split the case into sub-tasks for the divisions above.',
    'Every finished task is checked by the audit division automatically; do not create audit tasks yourself.',
    'A task only sees the results of the tasks it depends on, so list every task whose output it needs in "depends_on".',
    'Independent tasks may run in parallel. Use as few tasks as the case really needs.',
    'If the case is too ambiguous to plan at all, return no tasks and put ONE question for the user in "question".',
    languageLine(input.locale),
    '',
    'Reply with ONLY this JSON (no prose before or after it), in a ```json code block:',
    PLAN_JSON_SHAPE,
  ].join('\n');
}

/** The one stricter retry after a coordinator answer that did not parse. */
export function buildCoordinatorRetryPrompt(error: string, mode: 'plan' | 'checkpoint'): string {
  return [
    `Your previous answer could not be used: ${error}`,
    'Reply again with ONLY the JSON object in a single ```json code block. No explanation, no markdown outside the block.',
    'Use only the division slugs listed earlier, give every task a unique "id", and make "depends_on" an array of those ids.',
    'Required shape:',
    mode === 'plan' ? PLAN_JSON_SHAPE : CHECKPOINT_JSON_SHAPE,
  ].join('\n');
}

/**
 * A coordinator check-in while tasks run: the user wrote a note and/or a task
 * failed for good. The coordinator may answer, add tasks (optionally
 * replacing a failed one) or ask the user a question.
 */
export function buildCoordinatorCheckpointPrompt(input: {
  locale: string;
  tasks: OfficeTask[];
  divisionsById: Map<string, OfficeDivision>;
  workers: OfficeDivision[];
  userNotes: OfficeMessage[];
  failureNotes: OfficeMessage[];
}): string {
  const userNotes = describeNotes(input.userNotes);
  const failures = input.failureNotes
    .map((note) => `- ${String(note.payload.ref ?? '')} ${String(note.payload.title ?? '')}: ${String(note.payload.error ?? note.payload.text ?? '').trim()}`)
    .join('\n');
  return [
    '## Office update',
    userNotes ? `The user sent you:\n${userNotes}\n` : '',
    failures ? `These tasks failed for good (audit retries used up or the session crashed):\n${failures}\n` : '',
    '## Current tasks',
    input.tasks.map((task) => describeTaskLine(task, input.divisionsById)).join('\n') || '(none)',
    '',
    '## Divisions',
    describeWorkers(input.workers),
    '',
    '## What to do now',
    'Decide how to react. You may add new tasks (use new ids), and a new task may set "replaces" to the id of a failed task it takes over — tasks blocked by the failed one will then wait for the replacement instead.',
    'Add nothing if no new work is needed. Ask the user a question only if you cannot continue without an answer.',
    languageLine(input.locale),
    '',
    'Reply with ONLY this JSON in a ```json code block:',
    CHECKPOINT_JSON_SHAPE,
  ].join('\n');
}

/** The coordinator's last turn: a plain-markdown report for the user. */
export function buildCoordinatorFinalPrompt(input: {
  locale: string;
  tasks: OfficeTask[];
  divisionsById: Map<string, OfficeDivision>;
  userNotes: OfficeMessage[];
}): string {
  const userNotes = describeNotes(input.userNotes);
  const taskReports = input.tasks.map((task) => {
    const division = task.divisionId ? input.divisionsById.get(task.divisionId) : null;
    return [
      `### ${task.ref} · ${division?.name ?? 'deleted division'} · ${task.title} [${task.status}]`,
      task.resultSummary?.trim() || task.error?.trim() || '(no result)',
      task.auditNotes?.trim() ? `Audit: ${task.auditNotes.trim()}` : '',
    ].filter(Boolean).join('\n');
  });
  return [
    '## All tasks have settled',
    userNotes ? `Latest notes from the user:\n${userNotes}\n` : '',
    taskReports.join('\n\n'),
    '',
    '## What to do now',
    'Write the final report for the user in markdown: what was done (with the key files), what failed or is still open, and what the user should check or run next.',
    'Be honest and concrete; do not claim anything the results above do not show. Do not output JSON.',
    languageLine(input.locale),
  ].join('\n');
}

/**
 * A division's work turn. Dependency results are what the coordinator
 * forwards over the message bus — the only way divisions hear of each other.
 */
export function buildTaskPrompt(input: {
  locale: string;
  division: OfficeDivision;
  caseItem: Pick<OfficeCase, 'title' | 'description'>;
  task: Pick<OfficeTask, 'ref' | 'title' | 'instruction'>;
  dependencyResults: DependencyResult[];
  skills: PromptSkill[];
  resumedAfterRestart: boolean;
}): string {
  const dependencies = input.dependencyResults.map((result) => [
    `### ${result.ref} · ${result.divisionName}: ${result.title}`,
    result.summary.trim() || '(no summary)',
  ].join('\n'));
  return [
    withRolePrompt(input.division),
    describeSkills(input.skills),
    '',
    '## The overall case (context only)',
    describeCase(input.caseItem),
    '',
    `## Your task (${input.task.ref}): ${input.task.title}`,
    input.task.instruction.trim(),
    dependencies.length > 0
      ? `\n## Results from other divisions, forwarded by the coordinator\n${dependencies.join('\n\n')}`
      : '',
    input.resumedAfterRestart
      ? '\nThe server restarted while you worked on this. Check what is already done in the repository and finish the rest.'
      : '',
    '',
    '## Rules',
    '- Work only on your task and stay inside your field; other divisions handle the rest.',
    '- Nobody can answer questions mid-task. Make a sensible assumption and state it.',
    '- Your work is checked by the audit division before it counts as done.',
    `- ${languageLine(input.locale)}`,
    `- End your answer with a section headed exactly "${summaryHeading(input.locale)}" containing: what you did, files changed, how to verify, and open issues.`,
  ].join('\n');
}

/** Follow-up in the same task session after a failed audit. */
export function buildTaskRevisionPrompt(input: { locale: string; attempt: number; feedback: string }): string {
  return [
    `The audit division rejected your work (attempt ${input.attempt}). Their feedback:`,
    input.feedback.trim() || '(no details)',
    '',
    `Fix every point, re-check your work, and end again with a "${summaryHeading(input.locale)}" section describing the final state.`,
    languageLine(input.locale),
  ].join('\n');
}

/** The audit turn for one finished task. */
export function buildAuditPrompt(input: {
  locale: string;
  auditDivision: OfficeDivision;
  workerDivision: OfficeDivision | null;
  caseItem: Pick<OfficeCase, 'title' | 'description'>;
  task: Pick<OfficeTask, 'ref' | 'title' | 'instruction' | 'resultSummary' | 'attempts'>;
  skills: PromptSkill[];
}): string {
  return [
    withRolePrompt(input.auditDivision),
    describeSkills(input.skills),
    '',
    '## The overall case (context only)',
    describeCase(input.caseItem),
    '',
    `## Task to audit (${input.task.ref}, by ${input.workerDivision?.name ?? 'a deleted division'}${input.task.attempts > 0 ? `, revision ${input.task.attempts}` : ''})`,
    `Title: ${input.task.title}`,
    `Instruction:\n${input.task.instruction.trim()}`,
    '',
    '## What the division reports',
    input.task.resultSummary?.trim() || '(no summary)',
    '',
    '## What to do now',
    'Verify the work in the repository (read the changed files, check git diff, run relevant tests when possible). Do not fix the work yourself.',
    'Pass it if the instruction is met. Fail it only for concrete problems, and list the fixes needed.',
    languageLine(input.locale),
    '',
    'Reply with ONLY this JSON in a ```json code block:',
    '{ "pass": true, "notes": "what you checked and found", "fixes": ["concrete fix", "..."] }',
  ].join('\n');
}

/** The one stricter retry after an audit answer that did not parse. */
export function buildAuditRetryPrompt(error: string): string {
  return [
    `Your verdict could not be used: ${error}`,
    'Reply again with ONLY the JSON in a single ```json code block:',
    '{ "pass": true or false, "notes": "string", "fixes": ["string"] }',
  ].join('\n');
}
