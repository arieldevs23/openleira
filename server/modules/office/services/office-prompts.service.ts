import type { OfficeCase, OfficeDivision, OfficeMessage, OfficeTask, OfficeWorkspaceKind } from '@/shared/types.js';

/**
 * Pure prompt builders for every office turn.
 *
 * The orchestration protocol (JSON shapes, section markers) is written in
 * English because that is what models follow most reliably; the agent's own
 * role prompt is inserted verbatim, and a language line asks for human-facing
 * text in the office's language.
 */

/**
 * A case this workspace finished before, told to the coordinator so a short
 * follow-up ("add a feature") continues that work instead of asking which app.
 */
export type PromptRecentCase = {
  title: string;
  status: string;
  summary: string;
  changedFiles: string[];
};

/**
 * Other work running in the same workspace at the same time, told to the
 * coordinator and to every team so parallel work items stay out of each
 * other's way (they share one working tree).
 */
export type PromptConcurrentWork = {
  title: string;
  /** Teams working on it right now, with the subtask each one has. */
  running: Array<{ divisionName: string; taskTitle: string }>;
};

const MAX_CONCURRENT_WORK = 8;

/** The "other work in progress" section; empty when nothing else runs. */
const describeConcurrentWork = (work: PromptConcurrentWork[]): string => {
  if (work.length === 0) {
    return '';
  }
  const lines = ['## Other work running in this workspace right now'];
  for (const item of work.slice(0, MAX_CONCURRENT_WORK)) {
    lines.push(`- "${item.title}"`);
    for (const running of item.running) {
      lines.push(`  - ${running.divisionName}: ${running.taskTitle}`);
    }
  }
  lines.push(
    'All of this shares one folder. Do not edit files another team is working on for other work, and do not undo its changes;',
    'if your work really needs such a file, keep your change small and say so in your result.',
  );
  return lines.join('\n');
};

const MAX_RECENT_SUMMARY = 700;
const MAX_RECENT_FILES = 15;

const describeWorkspace = (workspace: { name: string; projectPath: string }, recentCases: PromptRecentCase[]): string => {
  const lines = [
    '## This workspace',
    `Name: ${workspace.name}`,
    `Folder (your working directory): ${workspace.projectPath}`,
    'Every case belongs to this workspace and its folder.',
  ];
  if (recentCases.length > 0) {
    lines.push('', '## Earlier cases in this workspace (newest first)');
    for (const recent of recentCases) {
      const summary = recent.summary.trim().replace(/\s+/g, ' ');
      lines.push(`- "${recent.title}" (${recent.status})`);
      if (summary) {
        lines.push(`  Result: ${summary.length > MAX_RECENT_SUMMARY ? `${summary.slice(0, MAX_RECENT_SUMMARY)}…` : summary}`);
      }
      if (recent.changedFiles.length > 0) {
        const files = recent.changedFiles.slice(0, MAX_RECENT_FILES);
        const more = recent.changedFiles.length - files.length;
        lines.push(`  Files changed: ${files.join(', ')}${more > 0 ? ` (+${more} more)` : ''}`);
      }
    }
    lines.push(
      'A short or vague request (for example "add a feature", "fix the bug", "make it nicer") continues this earlier work:',
      'work on the same app and files. Do not ask the user which project or app they mean when the earlier cases point to one.',
    );
  }
  return lines.join('\n');
};

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

/** The user's fixed order between divisions, told to the coordinator so its plan fits it. */
const describeFlow = (flow: Array<[string, string]>): string => (flow.length === 0 ? '' : [
  '',
  '## Workflow set by the user',
  flow.map(([from, to]) => `- ${from} -> ${to}`).join('\n'),
  'Tasks of a division automatically wait for every task of the divisions before it in this workflow; divisions on separate branches run in parallel.',
  'Plan to fit this order. Divisions that are not in the workflow are free to be placed wherever the case needs them.',
].join('\n'));

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

/** What the workspace folder holds, in words that fit its kind (defaults to a code repository). */
const describeFolder = (kind: OfficeWorkspaceKind = 'coding'): string => (
  kind === 'coding' ? 'this repository' : 'this workspace folder (documents, data and results)'
);

/** How the audit layer verifies a task in each kind of workspace. */
const AUDIT_CHECK_BY_KIND: Record<OfficeWorkspaceKind, string> = {
  coding: 'Verify the work in the repository (read the changed files, check git diff, run relevant tests when possible). Do not fix the work yourself.',
  content: 'Verify the work in the folder: open the result files, compare product facts (prices, specs, promos) with the source material, and check claims, tone, typos and platform fit. Do not fix the work yourself.',
  finance: 'Verify the work in the folder: recompute the key figures from the source data with your own script, check that totals add up, periods and units are consistent and the original files are unchanged, and open the result files. Do not fix the work yourself.',
  admin: 'Verify the work in the folder: check the documents are complete, the data in forms and letters matches the source documents (nothing invented), names and folders are consistent and no original file was lost or overwritten. Do not fix the work yourself.',
};

/** Extra working rules for teams outside a code repository. */
const WORK_RULES_BY_KIND: Record<OfficeWorkspaceKind, string[]> = {
  coding: [],
  content: [
    '- Save every deliverable as a file in the folder (for example .md, .docx or .xlsx) and name it in your summary.',
    '- Never invent prices, discounts, testimonials or product claims that the material does not back up.',
  ],
  finance: [
    '- Compute every figure with a script (Python or Node) from the source data, never by hand; keep the script next to the result.',
    '- Never change the original data files; write cleaned data and reports as new files and name them in your summary.',
  ],
  admin: [
    '- Never delete, move or overwrite the user\'s original documents; copy them when a new structure is needed.',
    '- Never invent personal or official data; leave it blank with a clear marker and list it in your summary.',
  ],
};

const withRolePrompt = (division: OfficeDivision, kind: OfficeWorkspaceKind = 'coding'): string => [
  `You are ${division.agent.name}, the agent of the "${division.name}" division in an AI office working on ${describeFolder(kind)}.`,
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
  /** Workflow arrows as division slug pairs; empty leaves the order to the coordinator. */
  flow?: Array<[string, string]>;
  workspace?: { name: string; projectPath: string };
  recentCases?: PromptRecentCase[];
  concurrentWork?: PromptConcurrentWork[];
  /** What kind of work the workspace does; omitted means `coding`. */
  kind?: OfficeWorkspaceKind;
}): string {
  const notes = describeNotes(input.notes);
  const concurrent = describeConcurrentWork(input.concurrentWork ?? []);
  const kind = input.kind ?? 'coding';
  return [
    withRolePrompt(input.coordinator, kind),
    describeSkills(input.skills),
    '',
    input.workspace ? `${describeWorkspace(input.workspace, input.recentCases ?? [])}\n` : '',
    concurrent ? `${concurrent}\n` : '',
    '## The case from the user',
    describeCase(input.caseItem),
    notes ? `\n## Extra notes from the user\n${notes}` : '',
    '',
    '## Divisions you can assign work to',
    describeWorkers(input.workers),
    describeFlow(input.flow ?? []),
    '',
    '## What to do now',
    kind === 'coding'
      ? 'Look at the repository as much as you need, then split the case into sub-tasks for the divisions above.'
      : 'Look at the files in the folder (source material, data, earlier results) as much as you need, then split the case into sub-tasks for the divisions above; say in each instruction which files to use and which result file to produce.',
    'Every finished task is checked by the audit division automatically; do not create audit tasks yourself.',
    'A task only sees the results of the tasks it depends on, so list every task whose output it needs in "depends_on".',
    'Independent tasks may run in parallel. Use as few tasks as the case really needs.',
    'A team works on one task at a time across all work in this workspace; its next task waits until it is free.',
    'If the case is too ambiguous to plan at all, return no tasks and put ONE question for the user in "question".',
    'Before asking, look at the folder and the earlier cases above: only ask what you really cannot work out from them.',
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
  flow?: Array<[string, string]>;
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
    describeFlow(input.flow ?? []),
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
  /** What kind of work the workspace does; omitted means `coding`. */
  kind?: OfficeWorkspaceKind;
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
    (input.kind ?? 'coding') === 'coding'
      ? 'Write the final report for the user in markdown: what was done (with the key files), what failed or is still open, and what the user should check or run next.'
      : 'Write the final report for the user in markdown: what was done (with the result files to open), what failed or is still open, and what the user should check or decide next.',
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
  /** Teams the flow sends this team's result to; each only sees its own subsection. */
  handsOffTo?: Array<{ name: string }>;
  /** Other work items running in the workspace at the same time. */
  concurrentWork?: PromptConcurrentWork[];
  /** What kind of work the workspace does; omitted means `coding`. */
  kind?: OfficeWorkspaceKind;
}): string {
  const kind = input.kind ?? 'coding';
  const handsOffTo = input.handsOffTo ?? [];
  const concurrent = describeConcurrentWork(input.concurrentWork ?? []);
  const dependencies = input.dependencyResults.map((result) => [
    `### ${result.ref} · ${result.divisionName}: ${result.title}`,
    result.summary.trim() || '(no summary)',
  ].join('\n'));
  return [
    withRolePrompt(input.division, kind),
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
      ? `\nThe server restarted while you worked on this. Check what is already done in ${describeFolder(kind)} and finish the rest.`
      : '',
    concurrent ? `\n${concurrent}` : '',
    '',
    '## Rules',
    '- Work only on your task and stay inside your field; other divisions handle the rest.',
    '- Nobody can answer questions mid-task. Make a sensible assumption and state it.',
    '- Your work is checked by the audit division before it counts as done.',
    ...WORK_RULES_BY_KIND[kind],
    `- ${languageLine(input.locale)}`,
    `- End your answer with a section headed exactly "${summaryHeading(input.locale)}" containing: what you did, files changed, how to verify, and open issues.`,
    ...(handsOffTo.length > 0
      ? [`- Your result is forwarded to: ${handsOffTo.map((team) => team.name).join(', ')}. Inside that final section, first write what every team needs, then one subsection per team headed "### <team name>" with only that team's part. Each team sees the shared part and its own subsection, never the others'.`]
      : []),
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
  /** What kind of work the workspace does; omitted means `coding`. */
  kind?: OfficeWorkspaceKind;
}): string {
  const kind = input.kind ?? 'coding';
  return [
    withRolePrompt(input.auditDivision, kind),
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
    AUDIT_CHECK_BY_KIND[kind],
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

const ANALYSIS_JSON_SHAPE = `{
  "summary": "one paragraph: what the app is, its stack, how it is structured and run",
  "divisions": [
    {
      "name": "Storefront",
      "slug": "storefront",
      "description": "one line: what this division owns",
      "color": "#2551BD",
      "agent_name": "a short first name",
      "role_prompt": "markdown: what the agent focuses on, which folders/files it owns, conventions to keep, what it must not touch"
    }
  ]
}`;

/**
 * The one-off turn that reads an existing app and proposes the divisions of
 * its workspace. It only reads: the user reviews the proposal before anything
 * is created, and the coordinator and audit layer are added automatically.
 */
export function buildAppAnalysisPrompt(input: { locale: string; projectName: string }): string {
  return [
    `You are setting up an AI team (a "workspace") for the existing app "${input.projectName}" in the current folder.`,
    'Read the repository only as much as you need: README, package/manifests, the folder layout, entry points, tests, deployment files.',
    'Do NOT change, create or delete any file and do not run commands that modify anything. This is a read-only survey.',
    '',
    '## What to produce',
    '1. "summary": one paragraph a new teammate needs first — what the app does, its stack and main frameworks, how the code is organized, how it is built, run and tested.',
    '2. "divisions": 3 to 7 divisions (teams) that fit THIS app, each owning a clear area (for example: API, web UI, mobile, data/migrations, infrastructure, tests, docs).',
    '   Base them on what really exists in the repository; do not add a division for something the app does not have.',
    '   Do not propose a coordinator or an audit/QA-review division: the workspace always has those.',
    '   Each "role_prompt" must name the real folders/files the division owns and the conventions it has to follow there.',
    languageLine(input.locale),
    '',
    'Reply with ONLY this JSON in a ```json code block:',
    ANALYSIS_JSON_SHAPE,
  ].join('\n');
}
