import assert from 'node:assert/strict';
import test from 'node:test';

import {
  detectProviderLimit,
  extractJsonValue,
  extractResultSummary,
  parseAuditVerdict,
  parseCoordinatorOutput,
} from '@/modules/office/services/office-plan-parser.service.js';

const SLUGS = ['planner', 'backend', 'frontend', 'docs'];

const plan = (value: unknown): string => `Here is the plan.\n\n\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\`\n`;

test('a fenced JSON plan becomes tasks with refs and dependencies', () => {
  const result = parseCoordinatorOutput(plan({
    summary: 'backend first, then frontend',
    tasks: [
      { id: 'T1', division_slug: 'backend', title: 'Add endpoint', instruction: 'Add POST /login', depends_on: [] },
      { id: 'T2', division_slug: 'frontend', title: 'Login form', instruction: 'Call the endpoint', depends_on: ['T1'] },
    ],
  }), { mode: 'plan', allowedDivisionSlugs: SLUGS });

  assert.ok(result.ok);
  assert.equal(result.value.message, 'backend first, then frontend');
  assert.equal(result.value.question, null);
  assert.deepEqual(result.value.tasks.map((task) => [task.ref, task.divisionSlug, task.dependsOn]), [
    ['T1', 'backend', []],
    ['T2', 'frontend', ['T1']],
  ]);
});

test('a bare JSON answer, a top-level array, 1-based numbers and missing ids are accepted', () => {
  const bare = parseCoordinatorOutput(JSON.stringify({
    tasks: [
      { division: 'planner', title: 'Plan', instruction: 'Write the plan' },
      { division: 'docs', title: 'Docs', instruction: 'Document it', depends_on: [1] },
    ],
  }), { mode: 'plan', allowedDivisionSlugs: SLUGS });
  assert.ok(bare.ok);
  assert.deepEqual(bare.value.tasks.map((task) => [task.ref, task.dependsOn]), [['T1', []], ['T2', ['T1']]]);

  const array = parseCoordinatorOutput(
    'Plan:\n[{"division_slug":"backend","title":"A","instruction":"do a"}]',
    { mode: 'plan', allowedDivisionSlugs: SLUGS },
  );
  assert.ok(array.ok);
  assert.equal(array.value.tasks.length, 1);
});

test('the last fenced block wins when the coordinator thinks aloud first', () => {
  const answer = [
    'Draft:',
    '```json\n{"tasks":[{"division_slug":"nope","title":"x","instruction":"y"}]}\n```',
    'Final:',
    '```json\n{"tasks":[{"division_slug":"docs","title":"x","instruction":"y"}]}\n```',
  ].join('\n');
  const result = parseCoordinatorOutput(answer, { mode: 'plan', allowedDivisionSlugs: SLUGS });
  assert.ok(result.ok);
  assert.equal(result.value.tasks[0].divisionSlug, 'docs');
});

test('invalid plans are rejected with a readable reason', () => {
  const cases: Array<[string, RegExp]> = [
    ['I will split this into tasks soon.', /No JSON/],
    ['```json\n{"tasks": [ {"division_slug": "backend", "title": "x" \n```', /No JSON/],
    [plan({ tasks: [{ division_slug: 'marketing', title: 'x', instruction: 'y' }] }), /marketing/],
    [plan({ tasks: [{ division_slug: 'backend', instruction: 'y' }] }), /title/],
    [plan({ tasks: [{ division_slug: 'backend', title: 'x' }] }), /instruction/],
    [plan({ tasks: [{ division_slug: 'backend', title: 'x', instruction: 'y', depends_on: ['T9'] }] }), /unknown task "T9"/],
    [plan({ tasks: [{ division_slug: 'backend', title: 'x', instruction: 'y', depends_on: 'T1' }] }), /depends_on/],
    [plan({
      tasks: [
        { id: 'A', division_slug: 'backend', title: 'x', instruction: 'y', depends_on: ['B'] },
        { id: 'B', division_slug: 'backend', title: 'x', instruction: 'y', depends_on: ['A'] },
      ],
    }), /cycle/],
    [plan({
      tasks: [
        { id: 'A', division_slug: 'backend', title: 'x', instruction: 'y' },
        { id: 'A', division_slug: 'docs', title: 'x', instruction: 'y' },
      ],
    }), /already taken/],
    [plan({ tasks: [] }), /no tasks and no question/],
  ];

  for (const [answer, expected] of cases) {
    const result = parseCoordinatorOutput(answer, { mode: 'plan', allowedDivisionSlugs: SLUGS });
    assert.equal(result.ok, false, answer);
    if (!result.ok) {
      assert.match(result.error, expected);
    }
  }
});

test('a plan may ask the user one question instead of planning', () => {
  const result = parseCoordinatorOutput(plan({ tasks: [], question: 'Which database?' }), {
    mode: 'plan',
    allowedDivisionSlugs: SLUGS,
  });
  assert.ok(result.ok);
  assert.equal(result.value.question, 'Which database?');
  assert.equal(result.value.tasks.length, 0);
});

test('check-in turns build on existing refs and may only replace failed tasks', () => {
  const options = {
    mode: 'checkpoint' as const,
    allowedDivisionSlugs: SLUGS,
    existingRefs: ['T1', 'T2'],
    failedRefs: ['T2'],
  };
  const ok = parseCoordinatorOutput(plan({
    reply: 'retrying the frontend with a smaller scope',
    tasks: [{ division_slug: 'frontend', title: 'Retry', instruction: 'smaller', depends_on: ['T1'], replaces: 'T2' }],
  }), options);
  assert.ok(ok.ok);
  assert.equal(ok.value.tasks[0].ref, 'T3');
  assert.equal(ok.value.tasks[0].replaces, 'T2');

  const empty = parseCoordinatorOutput(plan({ reply: 'noted' }), options);
  assert.ok(empty.ok);
  assert.equal(empty.value.tasks.length, 0);

  const replacesDone = parseCoordinatorOutput(plan({
    tasks: [{ division_slug: 'frontend', title: 'x', instruction: 'y', replaces: 'T1' }],
  }), options);
  assert.equal(replacesDone.ok, false);

  const reusedRef = parseCoordinatorOutput(plan({
    tasks: [{ id: 'T1', division_slug: 'frontend', title: 'x', instruction: 'y' }],
  }), options);
  assert.equal(reusedRef.ok, false);
});

test('audit verdicts parse strictly and fail closed on nonsense', () => {
  const pass = parseAuditVerdict('Checked.\n```json\n{"pass": true, "notes": "tests green", "fixes": []}\n```');
  assert.ok(pass.ok);
  assert.deepEqual(pass.value, { pass: true, notes: 'tests green', fixes: [] });

  const fail = parseAuditVerdict('{"pass": "false", "notes": "missing test", "fixes": ["add a test"]}');
  assert.ok(fail.ok);
  assert.equal(fail.value.pass, false);
  assert.deepEqual(fail.value.fixes, ['add a test']);

  assert.equal(parseAuditVerdict('looks good to me').ok, false);
  assert.equal(parseAuditVerdict('{"pass": "maybe"}').ok, false);
  assert.equal(parseAuditVerdict('{"pass": false}').ok, false, 'a failure must say why');
  assert.equal(parseAuditVerdict('{"pass": true, "fixes": "none"}').ok, false);
});

test('result summaries come from the last summary heading, or the tail of the answer', () => {
  assert.equal(
    extractResultSummary('Working...\n\n## Ringkasan\nAdded POST /login and a test.'),
    'Added POST /login and a test.',
  );
  assert.equal(extractResultSummary('## Summary\nfirst\n\n## Summary\nsecond'), 'second');
  assert.equal(extractResultSummary('just an answer'), 'just an answer');
  assert.ok(extractResultSummary('x'.repeat(10_000)).length <= 4001);
});

test('braces inside strings do not confuse JSON extraction', () => {
  const value = extractJsonValue('Note: {not json}\n{"notes": "use {curly} braces", "pass": true}');
  assert.deepEqual(value, { notes: 'use {curly} braces', pass: true });
});

test('detectProviderLimit recognises out-of-quota replies but not real reports about limits', () => {
  assert.equal(detectProviderLimit("You've hit your session limit · resets 6pm (UTC)"), "You've hit your session limit · resets 6pm (UTC)");
  assert.ok(detectProviderLimit('Claude usage limit reached. Your limit will reset at 3pm.'));
  assert.ok(detectProviderLimit('ERROR: You exceeded your current quota (insufficient_quota).'));
  assert.equal(detectProviderLimit('## Summary\nDone.'), null);
  assert.equal(detectProviderLimit(''), null);
  assert.equal(detectProviderLimit(null), null);
  const report = `## Summary\nAdded a rate limiter: requests over the usage limit reached state get a 429 and the limit resets every minute.\n${'details '.repeat(80)}`;
  assert.equal(detectProviderLimit(report), null);
});
