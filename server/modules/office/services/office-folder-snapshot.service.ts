import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';

/**
 * Finds the files a task created or changed by comparing the workspace
 * folder before and after its turn. Tool calls only show files an agent
 * wrote with its own write/edit tools; a report built by a Python script or
 * a spreadsheet saved by a CLI never shows up there, and those are exactly
 * how the non-coding workspace kinds produce their results.
 */

/** Size and modification time of every file, keyed by path relative to the folder. */
export type FolderSnapshot = Map<string, string>;

/** Folders that are never results: dependencies, VCS data and caches. */
const SKIPPED_DIRECTORIES = new Set(['node_modules', '.git', '.venv', 'venv', '__pycache__', '.cache', '.next', 'dist', 'build']);

/** A folder bigger than this is not snapshotted; the tool-call record is all there is then. */
const MAX_SNAPSHOT_FILES = 5000;

/**
 * Lists every file under `root` with its size and modification time. Returns
 * null when the folder cannot be read or holds more files than is cheap to
 * compare. Used by the office orchestrator around the task turns of
 * non-coding workspaces.
 */
export async function snapshotFolder(root: string, limit = MAX_SNAPSHOT_FILES): Promise<FolderSnapshot | null> {
  const snapshot: FolderSnapshot = new Map();
  const pending = [''];
  try {
    while (pending.length > 0) {
      const relative = pending.pop() as string;
      const entries = await readdir(path.join(root, relative), { withFileTypes: true });
      for (const entry of entries) {
        const entryPath = relative ? `${relative}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
          if (!SKIPPED_DIRECTORIES.has(entry.name)) pending.push(entryPath);
        } else if (entry.isFile()) {
          const info = await stat(path.join(root, entryPath));
          snapshot.set(entryPath, `${info.size}:${info.mtimeMs}`);
          if (snapshot.size > limit) return null;
        }
      }
    }
  } catch {
    return null;
  }
  return snapshot;
}

/**
 * Paths (relative, `/`-separated) that are new or changed in `after`, sorted.
 * Deleted files are not listed: the result panel shows where work landed.
 * Used by the office orchestrator to add them to a task's changed files.
 */
export function diffFolderSnapshots(before: FolderSnapshot, after: FolderSnapshot): string[] {
  return [...after.entries()]
    .filter(([filePath, signature]) => before.get(filePath) !== signature)
    .map(([filePath]) => filePath)
    .sort();
}
