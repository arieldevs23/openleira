import JSZip from 'jszip';

import { api, startProjectDownload } from '@/shared/api';

/** How long a generated zip's blob URL lives; revoking it right after the click can cancel the download. */
const BLOB_URL_LIFETIME_MS = 60_000;

/** Hands a blob to the browser as a download named `fileName`. */
const saveBlob = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), BLOB_URL_LIFETIME_MS);
};

const readBytes = async (projectId: string, filePath: string): Promise<ArrayBuffer> => {
  const response = await api.readFileBlob(projectId, filePath);
  if (!response.ok) {
    throw new Error(`Could not read ${filePath} (${response.status})`);
  }
  return response.arrayBuffer();
};

/**
 * Downloads one file of the workspace folder as it is on disk, streamed by the
 * browser. Used by the result files panel's right-click menu and the simple view.
 */
export function downloadResultFile(projectId: string, filePath: string): void {
  startProjectDownload(projectId, filePath);
}

/**
 * Downloads the given files as one zip, keeping their paths relative to the
 * workspace folder. Used for "the files this task changed".
 */
export async function downloadResultFilesZip(projectId: string, filePaths: string[], zipName: string): Promise<void> {
  const zip = new JSZip();
  for (const filePath of filePaths) {
    zip.file(filePath.replace(/^\/+/, ''), await readBytes(projectId, filePath));
  }
  saveBlob(await zip.generateAsync({ type: 'blob' }), zipName);
}

/**
 * Downloads a whole folder of the workspace, as it is on disk now, as a zip
 * the server builds while it streams (dependency and VCS folders left out).
 * Used by the result files panel's right-click menu on a folder.
 */
export function downloadResultFolderZip(projectId: string, projectPath: string, folderPath: string): void {
  const relative = folderPath.replace(/^\/+/, '');
  startProjectDownload(projectId, relative ? `${projectPath.replace(/\/+$/, '')}/${relative}` : projectPath);
}
