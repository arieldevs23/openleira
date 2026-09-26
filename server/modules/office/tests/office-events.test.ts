import assert from 'node:assert/strict';
import test from 'node:test';

import { extractChangedFiles } from '@/modules/office/services/office-events.service.js';
import type { NormalizedMessage } from '@/shared/types.js';

const toolUse = (toolName: string, toolInput: unknown) => ({
  id: 'm1',
  sessionId: 's1',
  provider: 'claude',
  kind: 'tool_use',
  toolName,
  toolInput,
  timestamp: '2026-09-25T10:00:00.000Z',
}) as unknown as NormalizedMessage;

test('files written by an agent are read from its tool calls, relative to the project', () => {
  assert.deepEqual(extractChangedFiles(toolUse('Write', { file_path: '/srv/shop/src/app.ts', content: 'x' }), '/srv/shop'), ['src/app.ts']);
  assert.deepEqual(extractChangedFiles(toolUse('Edit', JSON.stringify({ file_path: '/srv/shop/README.md' })), '/srv/shop/'), ['README.md']);
  assert.deepEqual(extractChangedFiles(toolUse('NotebookEdit', { notebook_path: '/elsewhere/n.ipynb' }), '/srv/shop'), ['/elsewhere/n.ipynb']);
  assert.deepEqual(
    extractChangedFiles(toolUse('FileChanges', { changes: [{ path: '/srv/shop/a.ts' }, { path: '/srv/shop/a.ts' }, { path: 'b.ts' }] }), '/srv/shop'),
    ['a.ts', 'b.ts'],
  );
});

test('reading tools and other events report no written files', () => {
  assert.deepEqual(extractChangedFiles(toolUse('Read', { file_path: '/srv/shop/a.ts' }), '/srv/shop'), []);
  assert.deepEqual(extractChangedFiles(toolUse('Write', 'not json'), '/srv/shop'), []);
  assert.deepEqual(
    extractChangedFiles({ ...toolUse('Write', {}), kind: 'text' } as NormalizedMessage, '/srv/shop'),
    [],
  );
});
