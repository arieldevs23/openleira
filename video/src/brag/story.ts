import type { OfficeTaskStatus } from '@/shared/types';

import { task, workCase } from './appData';
import type { AppState } from './AppWindow';
import { beatFrame, HOOK_HIT } from './beats';

export const PROMPT = 'Build the checkout page with Stripe and an order email';

type TeamStatus = Partial<Record<string, OfficeTaskStatus>>;

const TITLES: Record<string, string> = {
  planner: 'Plan the checkout',
  designer: 'Checkout screens',
  backend: 'Stripe payment API',
  docs: 'Checkout docs',
  frontend: 'Checkout page',
  security: 'Payment review',
};

const tasksFor = (statuses: TeamStatus, prefix = 'T') => Object.entries(statuses)
  .map(([slug, status], index) => task(`${prefix}${index + 1}`, slug, TITLES[slug] ?? slug, status as OfficeTaskStatus));

const checkout = (overrides: Parameters<typeof workCase>[0] = {}) => workCase({
  id: 'case-checkout',
  title: 'Checkout page with Stripe',
  description: PROMPT,
  ...overrides,
});

const listItem = (id: string, title: string, overrides: Parameters<typeof workCase>[0]) => workCase({ id, title, description: title, ...overrides });

/** What the real app shows at a global frame, and a key that changes only when that does. */
export function appStateAt(frame: number): { state: AppState; key: string } {
  const b = beatFrame;
  const empty: AppState = { caseItem: null, tasks: [], cases: [], dockMode: 'collapsed', typed: '' };

  // Hook: a run already going, lighting up beat by beat behind the title.
  if (frame < b(8)) {
    const busy = frame >= HOOK_HIT;
    const statuses: TeamStatus = {};
    if (frame >= b(0)) statuses.planner = frame >= b(1) ? 'done' : 'running';
    if (frame >= b(1)) Object.assign(statuses, { designer: 'running', backend: 'running', docs: 'running' });
    if (frame >= b(2)) Object.assign(statuses, { designer: 'done', frontend: 'running', security: 'running' });
    const step = [HOOK_HIT, b(0), b(1), b(2)].filter((at) => frame >= at).length;
    return {
      key: `hook-${step}`,
      state: { ...empty, dockMode: 'hidden', caseItem: checkout({ coordinatorBusy: busy }), tasks: tasksFor(statuses) },
    };
  }

  // One prompt: typed into the work chat, sent on the bar, then the teams pick it up along the flow.
  if (frame < b(12)) {
    const chars = Math.max(0, Math.min(PROMPT.length, Math.floor((frame - b(9)) * 1.45)));
    return { key: `typing-${chars}`, state: { ...empty, typed: PROMPT.slice(0, chars) } };
  }
  const steps: Array<[number, TeamStatus, boolean]> = [
    [b(12), {}, true],
    [b(13), { planner: 'running' }, false],
    [b(14), { planner: 'done', designer: 'running', backend: 'running', docs: 'running' }, false],
    [b(15), { planner: 'done', designer: 'done', backend: 'running', docs: 'review', frontend: 'running' }, false],
    [b(16), { planner: 'done', designer: 'done', backend: 'review', docs: 'review', frontend: 'running', security: 'queued' }, false],
    [b(17), { planner: 'done', designer: 'done', backend: 'done', docs: 'done', frontend: 'review', security: 'running' }, false],
    [b(18), { planner: 'done', designer: 'done', backend: 'done', docs: 'done', frontend: 'done', security: 'review' }, false],
  ];
  if (frame < b(19)) {
    const index = steps.filter(([at]) => frame >= at).length - 1;
    const [, statuses, planning] = steps[index];
    const run = checkout({ phase: planning ? 'planning' : 'executing', coordinatorBusy: planning });
    return { key: `run-${index}`, state: { ...empty, caseItem: run, tasks: tasksFor(statuses), cases: [run] } };
  }

  // Audited and done, then a list handed out that runs one item after another.
  const done = checkout({ status: 'done', phase: null, finalSummary: 'Checkout, Stripe API and order email are in. All audited.' });
  const allDone = tasksFor({ planner: 'done', designer: 'done', backend: 'done', docs: 'done', frontend: 'done', security: 'done' });
  if (frame < b(20)) {
    return { key: 'done', state: { ...empty, caseItem: done, tasks: allDone, cases: [done] } };
  }
  const second = frame >= b(22);
  const product = listItem('case-product', 'Product page with size picker', second ? { status: 'done', phase: null, finalSummary: 'Product page is live. Audited.' } : { status: 'running' });
  const reviews = listItem('case-reviews', 'Customer reviews section', second ? { status: 'running' } : { status: 'draft', followsCaseId: 'case-product' });
  const wishlist = listItem('case-wishlist', 'Wishlist for signed-in users', { status: 'draft', followsCaseId: 'case-reviews' });
  return {
    key: `list-${second}`,
    state: {
      ...empty,
      dockMode: 'expanded',
      caseItem: second ? reviews : product,
      tasks: tasksFor({ planner: 'done', frontend: 'running' }, second ? 'R' : 'P'),
      cases: [wishlist, reviews, product, done],
    },
  };
}
