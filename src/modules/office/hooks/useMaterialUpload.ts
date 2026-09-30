import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { api, readApiJson } from '@/shared/api';

/** Outcome of the last material upload: still busy, the uploaded paths, or why it failed. */
type MaterialUploadState = { busy: boolean; files: string[]; error: string | null };

/**
 * Uploads the user's material (sales data, invoices, documents) into the
 * workspace folder's material subfolder, where the agents read it. Used by
 * the files tab of the result panel and by the simple view's "materials" step.
 */
export function useMaterialUpload(projectId: string) {
  const { t } = useTranslation('office');
  // The last upload's paths (to open them), and whether one is in flight or failed.
  const [state, setState] = useState<MaterialUploadState>({ busy: false, files: [], error: null });

  const upload = useCallback(async (picked: File[]) => {
    if (picked.length === 0) return;
    const folder = t('files.materialsFolder');
    const formData = new FormData();
    formData.append('targetPath', folder);
    formData.append('requestedFileCount', String(picked.length));
    formData.append('relativePaths', JSON.stringify(picked.map((file) => file.name)));
    picked.forEach((file) => formData.append('files', file));
    setState((current) => ({ ...current, busy: true, error: null }));
    try {
      await readApiJson(await api.uploadFiles(projectId, formData));
      setState((current) => ({
        busy: false,
        files: [...new Set([...current.files, ...picked.map((file) => `${folder}/${file.name}`)])],
        error: null,
      }));
    } catch (error) {
      setState((current) => ({ ...current, busy: false, error: error instanceof Error ? error.message : String(error) }));
    }
  }, [projectId, t]);

  return { ...state, upload };
}
