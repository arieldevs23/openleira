import { ChevronRight, Copy, File, Folder, FolderOpen, Loader2 } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { api, readApiJson } from '@/shared/api';
import type { OfficeDivision, OfficeTask } from '@/shared/types';
import { cn } from '@/shared/utils';

/** One changed file and who changed it. */
type ChangedFile = { path: string; divisionIds: string[]; taskRefs: string[] };

/** A folder of the changed-files tree. */
type FolderNode = { name: string; path: string; folders: Map<string, FolderNode>; files: ChangedFile[] };

const buildTree = (files: ChangedFile[]): FolderNode => {
  const root: FolderNode = { name: '', path: '', folders: new Map(), files: [] };
  for (const file of files) {
    const parts = file.path.split('/').filter(Boolean);
    let node = root;
    parts.slice(0, -1).forEach((part, index) => {
      const folderPath = parts.slice(0, index + 1).join('/');
      if (!node.folders.has(part)) {
        node.folders.set(part, { name: part, path: folderPath, folders: new Map(), files: [] });
      }
      node = node.folders.get(part) as FolderNode;
    });
    node.files.push(file);
  }
  return root;
};

type ResultFilesPanelProps = {
  projectId: string;
  projectPath: string;
  tasks: OfficeTask[];
  divisions: OfficeDivision[];
};

/**
 * "Where did the result go": the workspace folder the agents worked in, and
 * a file-explorer tree of every file the case's tasks wrote or edited, with a
 * preview of the picked file. Shown in the office page's right panel.
 */
export default function ResultFilesPanel({ projectId, projectPath, tasks, divisions }: ResultFilesPanelProps) {
  const { t } = useTranslation('office');
  // Folders the user folded; everything starts unfolded because the tree is usually small.
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());
  // The file shown in the preview.
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  // Preview of the selected file: its text, or why it could not be read.
  const [preview, setPreview] = useState<{ path: string; content: string | null; error: string | null } | null>(null);
  // Preview request in flight.
  const [isLoading, setIsLoading] = useState(false);
  // Brief "copied" confirmation next to the folder path.
  const [copied, setCopied] = useState(false);

  const divisionsById = useMemo(() => new Map(divisions.map((division) => [division.id, division])), [divisions]);
  const files = useMemo(() => {
    const byPath = new Map<string, ChangedFile>();
    for (const task of tasks) {
      for (const filePath of task.changedFiles) {
        const entry = byPath.get(filePath) ?? { path: filePath, divisionIds: [], taskRefs: [] };
        if (task.divisionId && !entry.divisionIds.includes(task.divisionId)) entry.divisionIds.push(task.divisionId);
        if (!entry.taskRefs.includes(task.ref)) entry.taskRefs.push(task.ref);
        byPath.set(filePath, entry);
      }
    }
    return [...byPath.values()].sort((left, right) => left.path.localeCompare(right.path));
  }, [tasks]);
  const insideFiles = files.filter((file) => !file.path.startsWith('/'));
  const outsideFiles = files.filter((file) => file.path.startsWith('/'));
  const tree = useMemo(() => buildTree(insideFiles), [insideFiles]);

  const openFile = async (filePath: string) => {
    setSelectedPath(filePath);
    setIsLoading(true);
    try {
      const body = await readApiJson<{ content: string }>(await api.readFile(projectId, filePath));
      setPreview({ path: filePath, content: body.content, error: null });
    } catch (error) {
      setPreview({ path: filePath, content: null, error: error instanceof Error ? error.message : String(error) });
    } finally {
      setIsLoading(false);
    }
  };

  const copyPath = async () => {
    try {
      await navigator.clipboard.writeText(projectPath);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access can be refused; the path is still selectable.
    }
  };

  const renderFile = (file: ChangedFile, depth: number, label: string) => (
    <li key={file.path}>
      <button
        type="button"
        onClick={() => void openFile(file.path)}
        className={cn(
          'flex w-full items-center gap-1.5 rounded-md py-1 pr-2 text-left text-xs hover:bg-muted/60',
          selectedPath === file.path && 'bg-primary/10 text-foreground',
        )}
        style={{ paddingLeft: 8 + depth * 14 }}
        title={file.path}
      >
        <File className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate font-mono text-[11.5px]">{label}</span>
        <span className="flex shrink-0 items-center gap-0.5">
          {file.divisionIds.map((divisionId) => {
            const division = divisionsById.get(divisionId);
            return division ? (
              <span key={divisionId} className="h-2 w-2 rounded-full" style={{ backgroundColor: division.color }} title={division.name} />
            ) : null;
          })}
        </span>
      </button>
    </li>
  );

  const renderFolder = (node: FolderNode, depth: number): ReactNode[] => {
    const rows: ReactNode[] = [];
    for (const folder of [...node.folders.values()].sort((left, right) => left.name.localeCompare(right.name))) {
      const isCollapsed = collapsed.has(folder.path);
      rows.push(
        <li key={`folder:${folder.path}`}>
          <button
            type="button"
            aria-expanded={!isCollapsed}
            onClick={() => setCollapsed((current) => {
              const next = new Set(current);
              if (next.has(folder.path)) next.delete(folder.path); else next.add(folder.path);
              return next;
            })}
            className="flex w-full items-center gap-1.5 rounded-md py-1 pr-2 text-left text-xs hover:bg-muted/60"
            style={{ paddingLeft: 8 + depth * 14 }}
          >
            <ChevronRight className={cn('h-3 w-3 shrink-0 text-muted-foreground transition-transform', !isCollapsed && 'rotate-90')} />
            {isCollapsed ? <Folder className="h-3.5 w-3.5 shrink-0 text-primary" /> : <FolderOpen className="h-3.5 w-3.5 shrink-0 text-primary" />}
            <span className="truncate">{folder.name}</span>
          </button>
        </li>,
      );
      if (!isCollapsed) {
        rows.push(...renderFolder(folder, depth + 1));
      }
    }
    rows.push(...node.files.map((file) => renderFile(file, depth, file.path.split('/').pop() ?? file.path)));
    return rows;
  };

  return (
    <div className="space-y-3" data-testid="office-result-files">
      <div className="rounded-[10px] border border-border bg-card/60 p-2.5">
        <span className="block text-[10px] uppercase tracking-wide text-muted-foreground">{t('files.savedIn')}</span>
        <div className="mt-1 flex items-center gap-1.5">
          <code className="min-w-0 flex-1 break-all text-[11.5px] text-foreground" data-testid="office-result-folder">{projectPath}</code>
          <button type="button" onClick={() => void copyPath()} className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={t('files.copyPath')} title={t('files.copyPath')}>
            <Copy className="h-3.5 w-3.5" />
          </button>
        </div>
        {copied && <span className="text-[10px] text-ok">{t('files.copied')}</span>}
      </div>

      {files.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t('files.none')}</p>
      ) : (
        <>
          <p className="text-[11px] text-muted-foreground">{t('files.count', { count: files.length })}</p>
          <ul className="max-h-72 overflow-y-auto rounded-[10px] border border-border py-1" aria-label={t('files.tree')}>
            {renderFolder(tree, 0)}
            {outsideFiles.length > 0 && (
              <>
                <li className="px-2 pb-0.5 pt-2 text-[10px] uppercase tracking-wide text-muted-foreground">{t('files.outside')}</li>
                {outsideFiles.map((file) => renderFile(file, 0, file.path))}
              </>
            )}
          </ul>
        </>
      )}

      {selectedPath && (
        <div className="space-y-1">
          <span className="block truncate font-mono text-[11px] text-muted-foreground" title={selectedPath}>{selectedPath}</span>
          {isLoading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />{t('loading')}</div>
          ) : preview?.error ? (
            <p className="text-xs text-err">{preview.error}</p>
          ) : (
            <pre className="max-h-80 overflow-auto rounded-[10px] border border-border bg-muted/40 p-2 text-[11px] leading-relaxed" data-testid="office-file-preview">
              {preview?.content ?? ''}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
