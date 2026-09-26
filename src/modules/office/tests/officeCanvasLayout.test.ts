import assert from 'node:assert/strict';

import { test } from 'vitest';

import { computeAutoLayout, flowRows, formatTokens, NODE_HEIGHT } from '@/modules/office/utils/officeCanvasLayout';
import type { OfficeDivision } from '@/shared/types';

const division = (slug: string, extra: Partial<OfficeDivision> = {}) => ({
  id: slug, slug, name: slug, isCoordinator: false, isAudit: false, sortOrder: 0, ...extra,
}) as OfficeDivision;
const arrow = (fromDivisionId: string, toDivisionId: string) => ({ fromDivisionId, toDivisionId });

test('rows follow the longest chain of flow arrows', () => {
  const workers = ['planner', 'backend', 'frontend', 'docs', 'security'].map((slug) => division(slug));
  const rows = flowRows(workers, [arrow('planner', 'backend'), arrow('planner', 'frontend'), arrow('backend', 'docs'), arrow('frontend', 'docs')]);
  assert.deepEqual(Object.fromEntries(rows), { planner: 0, backend: 1, frontend: 1, docs: 2, security: 0 });
});

test('the automatic layout puts the coordinator on top, each flow row lower, and the audit layer last', () => {
  const divisions = [
    division('coordinator', { isCoordinator: true }),
    division('planner'),
    division('backend'),
    division('audit', { isAudit: true }),
  ];
  const layout = computeAutoLayout(divisions, [arrow('planner', 'backend')]);
  const y = (id: string) => layout.divisions.get(id)?.y ?? Number.NaN;
  assert.ok(y('coordinator') < y('planner'));
  assert.ok(y('planner') + NODE_HEIGHT < y('backend'));
  assert.ok(y('backend') + NODE_HEIGHT < y('audit'));
  assert.equal(layout.skills.y, y('audit'));

  // Without a flow every division shares the first row.
  const flat = computeAutoLayout(divisions, []);
  assert.equal(flat.divisions.get('planner')?.y, flat.divisions.get('backend')?.y);
});

test('token counts are compact', () => {
  assert.equal(formatTokens(950), '950');
  assert.equal(formatTokens(1234), '1.2k');
  assert.equal(formatTokens(12_345), '12k');
  assert.equal(formatTokens(2_500_000), '2.5M');
});
