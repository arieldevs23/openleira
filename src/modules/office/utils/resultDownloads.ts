import JSZip from 'jszip';

import { api } from '@/shared/api';
import type { FileTreeNode } from '@/shared/types';

/** Hands a blob to the browser as a download named `fileName`. */
const saveBlob = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};

const readBytes = async (projectId: string, filePath: string): Promise<ArrayBuffer> => {
  const response = await api.readFileBlob(projectId, filePath);
  if (!response.ok) {
    throw new Error(`Could not read ${filePath} (${response.status})`);
  }
  return response.arrayBuffer();
};

const baseName = (filePath: string) => filePath.split('/').filter(Boolean).pop() ?? filePath;

/**
 * Downloads one file of the workspace folder as it is on disk. Used by the
 * result files panel's right-click menu.
 */
export async function downloadResultFile(projectId: string, filePath: string): Promise<void> {
  saveBlob(new Blob([await readBytes(projectId, filePath)]), baseName(filePath));
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
 * Downloads a whole folder of the workspace, as it is on disk now, as a zip.
 * The server's listing already leaves out ignored folders (node_modules,
 * .git, build output); folders it did not walk (entry budget) are listed on
 * demand. Used by the result files panel's right-click menu on a folder.
 */
export async function downloadResultFolderZip(projectId: string, projectPath: string, folderPath: string): Promise<void> {
  const zip = new JSZip();
  const root = `${projectPath.replace(/\/+$/, '')}/${folderPath.replace(/^\/+/, '')}`;

  const list = async (directory: string): Promise<FileTreeNode[]> => {
    const response = await api.getFiles(projectId, { path: directory });
    if (!response.ok) {
      throw new Error(`Could not list ${directory} (${response.status})`);
    }
    return (await response.json()) as FileTreeNode[];
  };

  const add = async (nodes: FileTreeNode[]) => {
    for (const node of nodes) {
      const relative = node.path.startsWith(root) ? node.path.slice(root.length).replace(/^\/+/, '') : node.name;
      if (node.type === 'directory') {
        const children = node.truncated || !node.children ? await list(node.path) : node.children;
        zip.folder(relative);
        await add(children);
      } else {
        zip.file(relative, await readBytes(projectId, node.path));
      }
    }
  };

  await add(await list(root));
  saveBlob(await zip.generateAsync({ type: 'blob' }), `${baseName(folderPath) || 'result'}.zip`);
}
