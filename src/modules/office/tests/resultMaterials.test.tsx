import assert from 'node:assert/strict';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeAll, test, vi } from 'vitest';

import type * as ApiModule from '@/shared/api';

const uploads: Array<{ projectId: string; targetPath: unknown; relativePaths: unknown; names: string[] }> = [];

vi.mock('@/shared/api', async (importOriginal) => {
  const original = await importOriginal<typeof ApiModule>();
  return {
    ...original,
    api: {
      ...original.api,
      uploadFiles: async (projectId: string, formData: FormData) => {
        uploads.push({
          projectId,
          targetPath: formData.get('targetPath'),
          relativePaths: formData.get('relativePaths'),
          names: formData.getAll('files').map((file) => (file as File).name),
        });
        return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'content-type': 'application/json' } });
      },
    },
  };
});

const { i18n } = await import('@/modules/i18n');
const { default: ResultFilesPanel } = await import('@/modules/office/ResultFilesPanel');

beforeAll(async () => {
  await i18n.changeLanguage('id');
});

test('material the user uploads goes into the bahan folder and is listed to open', async () => {
  render(<ResultFilesPanel projectId="toko" projectPath="/srv/toko" tasks={[]} divisions={[]} />);
  const input = screen.getByTestId('office-materials-input');
  fireEvent.change(input, { target: { files: [new File(['a,b'], 'penjualan-sept.csv'), new File(['%PDF'], 'nota.pdf')] } });

  await waitFor(() => assert.ok(screen.getByText('bahan/penjualan-sept.csv')));
  assert.ok(screen.getByText('bahan/nota.pdf'));
  assert.deepEqual(uploads, [{
    projectId: 'toko',
    targetPath: 'bahan',
    relativePaths: JSON.stringify(['penjualan-sept.csv', 'nota.pdf']),
    names: ['penjualan-sept.csv', 'nota.pdf'],
  }]);
});
