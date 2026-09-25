/**
 * Pure parsers for what office agents write back.
 *
 * Agents answer in free text, so every parser here first digs the JSON out of
 * the answer (fenced block, bare object, or an object embedded in prose) and
 * then validates it. Failures come back as a readable `error` the
 * orchestrator can hand to the agent in its one stricter retry.
 */

/** Upper bound on tasks per plan, so a runaway plan cannot flood the office. */
const MAX_TASKS_PER_PLAN = 20;
const MAX_RESULT_SUMMARY_LENGTH = 4000;

/** One task of a coordinator plan, with dependencies still expressed as refs. */
export type ParsedPlanTask = {
  ref: string;
  divisionSlug: string;
  title: string;
  instruction: string;
  dependsOn: string[];
  /** Ref of an existing failed task this one replaces (check-in turns only). */
  replaces: string | null;
};

/** A coordinator turn: a message for the user, new tasks, or a question. */
export type ParsedCoordinatorOutput = {
  message: string;
  tasks: ParsedPlanTask[];
  question: string | null;
};

/** The audit agent's verdict on one task. */
export type AuditVerdict = {
  pass: boolean;
  notes: string;
  fixes: string[];
};

type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

type JsonRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is JsonRecord =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const readText = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

/**
 * Finds every balanced `{...}` or `[...]` span in `text`, honouring strings so
 * a brace inside a quoted value does not end the span early.
 */
function findBalancedJsonSpans(text: string): string[] {
  const spans: string[] = [];
  for (let start = 0; start < text.length; start += 1) {
    const opener = text[start];
    if (opener !== '{' && opener !== '[') {
      continue;
    }

    const stack: string[] = [];
    let inString = false;
    let escaped = false;
    for (let index = start; index < text.length; index += 1) {
      const char = text[index];
      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (char === '\\') {
          escaped = true;
        } else if (char === '"') {
          inString = false;
        }
        continue;
      }
      if (char === '"') {
        inString = true;
      } else if (char === '{' || char === '[') {
        stack.push(char === '{' ? '}' : ']');
      } else if (char === '}' || char === ']') {
        if (stack.pop() !== char) {
          break;
        }
        if (stack.length === 0) {
          spans.push(text.slice(start, index + 1));
          start = index;
          break;
        }
      }
    }
  }
  return spans;
}

/**
 * Extracts the JSON value an agent answered with.
 *
 * Tried in order: fenced ```json blocks (last first, since agents often think
 * aloud before the final answer), the whole answer, then balanced spans found
 * in the prose (again last first). Returns `null` when nothing parses.
 */
export function extractJsonValue(text: string): unknown {
  const candidates: string[] = [];
  const fencePattern = /```(?:json|JSON)?\s*\n([\s\S]*?)```/g;
  const fenced: string[] = [];
  for (const match of text.matchAll(fencePattern)) {
    fenced.push(match[1]);
  }
  candidates.push(...fenced.reverse(), text.trim(), ...findBalancedJsonSpans(text).reverse());

  for (const candidate of candidates) {
    const trimmed = candidate.trim();
    if (!trimmed || (trimmed[0] !== '{' && trimmed[0] !== '[')) {
      continue;
    }
    try {
      return JSON.parse(trimmed);
    } catch {
      // Try the next candidate.
    }
  }
  return null;
}

const readDependencyRefs = (value: unknown, positionalRefs: string[]): string[] | null => {
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value)) {
    return null;
  }
  const refs: string[] = [];
  for (const entry of value) {
    if (typeof entry === 'string' && entry.trim()) {
      refs.push(entry.trim());
    } else if (typeof entry === 'number' && Number.isInteger(entry) && positionalRefs[entry - 1]) {
      // 1-based task numbers are accepted because models often write them.
      refs.push(positionalRefs[entry - 1]);
    } else {
      return null;
    }
  }
  return refs;
};

/** Depth-first cycle check over the new tasks' dependency edges. */
function findDependencyCycle(tasks: ParsedPlanTask[]): string | null {
  const byRef = new Map(tasks.map((task) => [task.ref, task]));
  const state = new Map<string, 'visiting' | 'done'>();

  const visit = (ref: string, trail: string[]): string | null => {
    if (state.get(ref) === 'done') {
      return null;
    }
    if (state.get(ref) === 'visiting') {
      return [...trail, ref].join(' -> ');
    }
    state.set(ref, 'visiting');
    for (const dependency of byRef.get(ref)?.dependsOn ?? []) {
      if (byRef.has(dependency)) {
        const cycle = visit(dependency, [...trail, ref]);
        if (cycle) {
          return cycle;
        }
      }
    }
    state.set(ref, 'done');
    return null;
  };

  for (const task of tasks) {
    const cycle = visit(task.ref, []);
    if (cycle) {
      return cycle;
    }
  }
  return null;
}

/**
 * Parses a coordinator turn.
 *
 * `plan` turns must produce at least one task or a question. `checkpoint`
 * turns (the coordinator reacting to a user note or a failed task) may add
 * nothing; their new tasks can depend on, and `replaces` can name, the refs
 * the case already has.
 */
export function parseCoordinatorOutput(
  text: string,
  options: {
    mode: 'plan' | 'checkpoint';
    allowedDivisionSlugs: string[];
    existingRefs?: string[];
    failedRefs?: string[];
  },
): ParseResult<ParsedCoordinatorOutput> {
  const value = extractJsonValue(text);
  if (value === null) {
    return { ok: false, error: 'No JSON object was found in the answer.' };
  }

  const record: JsonRecord = Array.isArray(value) ? { tasks: value } : isRecord(value) ? value : {};
  if (!Array.isArray(value) && !isRecord(value)) {
    return { ok: false, error: 'The JSON answer must be an object.' };
  }

  const message = readText(record.summary) || readText(record.reply) || readText(record.message);
  const question = readText(record.question) || null;
  const rawTasks = record.tasks ?? [];
  if (!Array.isArray(rawTasks)) {
    return { ok: false, error: '"tasks" must be an array.' };
  }
  if (rawTasks.length > MAX_TASKS_PER_PLAN) {
    return { ok: false, error: `Too many tasks (${rawTasks.length}); the limit is ${MAX_TASKS_PER_PLAN}.` };
  }

  const existingRefs = new Set(options.existingRefs ?? []);
  const failedRefs = new Set(options.failedRefs ?? []);
  const allowedSlugs = new Set(options.allowedDivisionSlugs);

  // Refs are assigned first so dependencies can point forward or backward.
  const positionalRefs: string[] = [];
  let nextAutoRef = existingRefs.size + 1;
  for (const rawTask of rawTasks) {
    const explicitRef = isRecord(rawTask) ? readText(rawTask.id) || readText(rawTask.ref) : '';
    if (explicitRef) {
      positionalRefs.push(explicitRef);
      continue;
    }
    while (existingRefs.has(`T${nextAutoRef}`) || positionalRefs.includes(`T${nextAutoRef}`)) {
      nextAutoRef += 1;
    }
    positionalRefs.push(`T${nextAutoRef}`);
    nextAutoRef += 1;
  }

  const tasks: ParsedPlanTask[] = [];
  for (const [index, rawTask] of rawTasks.entries()) {
    const label = `Task #${index + 1}`;
    if (!isRecord(rawTask)) {
      return { ok: false, error: `${label} must be an object.` };
    }

    const ref = positionalRefs[index];
    if (existingRefs.has(ref) || positionalRefs.indexOf(ref) !== index) {
      return { ok: false, error: `${label} uses the id "${ref}", which is already taken.` };
    }

    const divisionSlug = readText(rawTask.division_slug) || readText(rawTask.division) || readText(rawTask.divisionSlug);
    if (!divisionSlug) {
      return { ok: false, error: `${label} has no "division_slug".` };
    }
    if (!allowedSlugs.has(divisionSlug)) {
      return {
        ok: false,
        error: `${label} names division "${divisionSlug}", which is not one of: ${[...allowedSlugs].join(', ')}.`,
      };
    }

    const title = readText(rawTask.title);
    const instruction = readText(rawTask.instruction) || readText(rawTask.instructions);
    if (!title) {
      return { ok: false, error: `${label} has no "title".` };
    }
    if (!instruction) {
      return { ok: false, error: `${label} has no "instruction".` };
    }

    const dependsOn = readDependencyRefs(rawTask.depends_on ?? rawTask.dependsOn, positionalRefs);
    if (!dependsOn) {
      return { ok: false, error: `${label} has an invalid "depends_on"; use an array of task ids.` };
    }
    for (const dependency of dependsOn) {
      if (dependency === ref) {
        return { ok: false, error: `${label} depends on itself.` };
      }
      if (!positionalRefs.includes(dependency) && !existingRefs.has(dependency)) {
        return { ok: false, error: `${label} depends on unknown task "${dependency}".` };
      }
    }

    const replaces = readText(rawTask.replaces) || null;
    if (replaces) {
      if (options.mode !== 'checkpoint' || !failedRefs.has(replaces)) {
        return { ok: false, error: `${label} replaces "${replaces}", which is not a failed task of this case.` };
      }
    }

    tasks.push({ ref, divisionSlug, title, instruction, dependsOn: [...new Set(dependsOn)], replaces });
  }

  const cycle = findDependencyCycle(tasks);
  if (cycle) {
    return { ok: false, error: `The dependencies form a cycle: ${cycle}.` };
  }

  if (options.mode === 'plan' && tasks.length === 0 && !question) {
    return { ok: false, error: 'The plan has no tasks and no question.' };
  }

  return { ok: true, value: { message, tasks, question } };
}

const readPassFlag = (value: unknown): boolean | null => {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', 'pass', 'passed', 'yes', 'lolos'].includes(normalized)) {
      return true;
    }
    if (['false', 'fail', 'failed', 'no', 'gagal'].includes(normalized)) {
      return false;
    }
  }
  return null;
};

/** Parses the audit agent's `{ pass, notes, fixes }` verdict. */
export function parseAuditVerdict(text: string): ParseResult<AuditVerdict> {
  const value = extractJsonValue(text);
  if (!isRecord(value)) {
    return { ok: false, error: 'No JSON object with "pass", "notes" and "fixes" was found.' };
  }

  const pass = readPassFlag(value.pass);
  if (pass === null) {
    return { ok: false, error: '"pass" must be true or false.' };
  }

  const rawFixes = value.fixes ?? [];
  if (!Array.isArray(rawFixes)) {
    return { ok: false, error: '"fixes" must be an array.' };
  }
  const fixes = rawFixes
    .map((fix) => (typeof fix === 'string' ? fix.trim() : isRecord(fix) ? JSON.stringify(fix) : ''))
    .filter(Boolean);

  const notes = readText(value.notes);
  if (!pass && !notes && fixes.length === 0) {
    return { ok: false, error: 'A failing verdict needs "notes" or "fixes" explaining why.' };
  }

  return { ok: true, value: { pass, notes, fixes } };
}

/**
 * Pulls the part of a task agent's answer that summarizes its result.
 *
 * Agents are asked to end with a "## Ringkasan" / "## Summary" section; when
 * it is missing, the tail of the answer stands in. Capped so a huge answer
 * cannot bloat the message bus or the next agent's prompt.
 */
export function extractResultSummary(text: string): string {
  const trimmed = text.trim();
  const headingPattern = /^#{1,4}\s*(?:ringkasan(?:\s+hasil)?|summary|result summary)\b[^\n]*$/gim;
  let lastHeadingEnd = -1;
  for (const match of trimmed.matchAll(headingPattern)) {
    lastHeadingEnd = (match.index ?? 0) + match[0].length;
  }

  const summary = lastHeadingEnd >= 0 ? trimmed.slice(lastHeadingEnd).trim() : trimmed;
  if (summary.length <= MAX_RESULT_SUMMARY_LENGTH) {
    return summary;
  }
  return `…${summary.slice(summary.length - MAX_RESULT_SUMMARY_LENGTH)}`;
}
