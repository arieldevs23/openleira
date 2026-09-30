import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { diffFolderSnapshots, snapshotFolder } from '@/modules/office/services/office-folder-snapshot.service.js';

test('a folder snapshot finds new and changed files, skipping dependency folders', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'office-snapshot-'));
  try {
    await mkdir(path.join(root, 'bahan'));
    await mkdir(path.join(root, 'node_modules', 'x'), { recursive: true });
    await writeFile(path.join(root, 'bahan', 'penjualan.csv'), 'a,b');
    await writeFile(path.join(root, 'notes.md'), 'old');
    const before = await snapshotFolder(root);
    assert.ok(before);
    assert.deepEqual([...before.keys()].sort(), ['bahan/penjualan.csv', 'notes.md']);

    await mkdir(path.join(root, 'hasil'));
    await writeFile(path.join(root, 'hasil', 'laporan.docx'), 'report');
    await writeFile(path.join(root, 'notes.md'), 'new text');
    await utimes(path.join(root, 'notes.md'), new Date(), new Date(Date.now() + 5000));
    await writeFile(path.join(root, 'node_modules', 'x', 'index.js'), '');
    const after = await snapshotFolder(root);
    assert.ok(after);
    assert.deepEqual(diffFolderSnapshots(before, after), ['hasil/laporan.docx', 'notes.md']);

    assert.equal(await snapshotFolder(root, 1), null, 'a folder over the limit is not compared');
    assert.equal(await snapshotFolder(path.join(root, 'missing')), null);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
