import { ChevronRight, Copy, Download, File, FileArchive, Folder, FolderOpen, Loader2, Upload } from 'lucide-react';
import { useMemo, useRef, useState, type ChangeEvent, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import ResultFilePreview from '@/modules/office/ResultFilePreview';
import { useMaterialUpload } from '@/modules/office/hooks/useMaterialUpload';
import { downloadResultFile, downloadResultFilesZip, downloadResultFolderZip } from '@/modules/office/utils/resultDownloads';
import { ContextMenu } from '@/shared/ui';
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
 * preview of the picked file (text, spreadsheets, Word, PDF, images). The
 * user can also upload material (sales data, invoices, documents) into the
 * folder for the agents to work from. Shown in the office page's right panel.
 */
export default function ResultFilesPanel({ projectId, projectPath, tasks, divisions }: ResultFilesPanelProps) {
  const { t } = useTranslation('office');
  // Folders the user folded; everything starts unfolded because the tree is usually small.
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());
  // The file shown in the preview.
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  // Material the user uploaded from this panel (or the simple view), and the upload's state.
  const materials = useMaterialUpload(projectId);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  // Brief "copied" confirmation next to the folder path.
  const [copied, setCopied] = useState(false);
  // The right-click menu and the file, folder or workspace root it was opened on.
  const [menu, setMenu] = useState<{ x: number; y: number; target: { kind: 'file' | 'folder' | 'root'; path: string } } | null>(null);
  // A download being prepared (zips of big folders take a moment), or why it failed.
  const [download, setDownload] = useState<{ busy: boolean; error: string | null }>({ busy: false, error: null });

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

  const openFile = (filePath: string) => setSelectedPath(filePath);

  const uploadMaterial = (event: ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(event.target.files ?? []);
    event.target.value = '';
    void materials.upload(picked);
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

  const openMenu = (event: ReactMouseEvent, target: { kind: 'file' | 'folder' | 'root'; path: string }) => {
    event.preventDefault();
    setMenu({ x: event.clientX, y: event.clientY, target });
  };

  const runDownload = async (work: () => Promise<void>) => {
    setDownload({ busy: true, error: null });
    try {
      await work();
      setDownload({ busy: false, error: null });
    } catch (error) {
      setDownload({ busy: false, error: error instanceof Error ? error.message : String(error) });
    }
  };

  /** Changed files at or under a folder of the tree ('' is the whole workspace). */
  const changedUnder = (folderPath: string) => insideFiles
    .map((file) => file.path)
    .filter((filePath) => !folderPath || filePath.startsWith(`${folderPath}/`));

  const menuItems = (() => {
    if (!menu) return [];
    const { target } = menu;
    const copy = (text: string) => () => { void navigator.clipboard?.writeText(text).catch(() => undefined); };
    if (target.kind === 'file') {
      return [
        { key: 'download', label: t('files.downloadFile'), icon: Download, onSelect: () => void runDownload(() => downloadResultFile(projectId, target.path)) },
        { key: 'copy', label: t('files.copyFilePath'), icon: Copy, onSelect: copy(target.path) },
      ];
    }
    const folderName = target.kind === 'root' ? (projectPath.split('/').filter(Boolean).pop() ?? 'result') : target.path.split('/').pop() ?? target.path;
    return [
      {
        key: 'zip', label: t('files.downloadFolder'), icon: FileArchive,
        onSelect: () => void runDownload(() => downloadResultFolderZip(projectId, projectPath, target.kind === 'root' ? '' : target.path)),
      },
      {
        key: 'changed', label: t('files.downloadChanged', { count: changedUnder(target.kind === 'root' ? '' : target.path).length }), icon: Download,
        disabled: changedUnder(target.kind === 'root' ? '' : target.path).length === 0,
        onSelect: () => void runDownload(() => downloadResultFilesZip(projectId, changedUnder(target.kind === 'root' ? '' : target.path), `${folderName}-changes.zip`)),
      },
      { key: 'copy', label: t('files.copyFilePath'), icon: Copy, showDividerBefore: true, onSelect: copy(target.kind === 'root' ? projectPath : `${projectPath.replace(/\/+$/, '')}/${target.path}`) },
    ];
  })();

  const renderFile = (file: ChangedFile, depth: number, label: string) => (
    <li key={file.path}>
      <button
        type="button"
        onClick={() => openFile(file.path)}
        onContextMenu={(event) => openMenu(event, { kind: 'file', path: file.path })}
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
            onContextMenu={(event) => openMenu(event, { kind: 'folder', path: folder.path })}
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
      <div className="rounded-[10px] border border-border bg-card/60 p-2.5" onContextMenu={(event) => openMenu(event, { kind: 'root', path: '' })}>
        <span className="block text-[10px] uppercase tracking-wide text-muted-foreground">{t('files.savedIn')}</span>
        <div className="mt-1 flex items-center gap-1.5">
          <code className="min-w-0 flex-1 break-all text-[11.5px] text-foreground" data-testid="office-result-folder">{projectPath}</code>
          <button type="button" onClick={() => void copyPath()} className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={t('files.copyPath')} title={t('files.copyPath')}>
            <Copy className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={(event) => openMenu(event, { kind: 'root', path: '' })}
            className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label={t('files.downloadMenu')}
            title={t('files.downloadMenu')}
            data-testid="office-result-download"
          >
            <Download className="h-3.5 w-3.5" />
          </button>
        </div>
        {copied && <span className="text-[10px] text-ok">{t('files.copied')}</span>}
        <span className="mt-1 block text-[10px] text-muted-foreground">{t('files.rightClickHint')}</span>
      </div>
      <div className="rounded-[10px] border border-dashed border-border p-2.5" data-testid="office-materials">
        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1 text-[11px] text-muted-foreground">{t('files.materialsHint', { folder: t('files.materialsFolder') })}</span>
          <button
            type="button"
            onClick={() => uploadInputRef.current?.click()}
            disabled={materials.busy}
            className="flex shrink-0 items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-foreground hover:bg-muted disabled:opacity-60"
          >
            {materials.busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
            {t('files.uploadMaterial')}
          </button>
          <input ref={uploadInputRef} type="file" multiple className="hidden" onChange={uploadMaterial} data-testid="office-materials-input" />
        </div>
        {materials.files.length > 0 && (
          <ul className="mt-1.5 space-y-0.5" aria-label={t('files.uploaded')}>
            {materials.files.map((filePath) => (
              <li key={filePath}>
                <button type="button" onClick={() => openFile(filePath)} className="truncate font-mono text-[11px] text-primary hover:underline" title={filePath}>{filePath}</button>
              </li>
            ))}
            <li className="text-[10.5px] text-muted-foreground">{t('files.uploadedHint')}</li>
          </ul>
        )}
        {materials.error && <p className="mt-1 text-[11px] text-err">{materials.error}</p>}
      </div>
      {download.busy && (
        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" />{t('files.preparing')}</p>
      )}
      {download.error && <p className="text-[11px] text-err">{download.error}</p>}
      {menu && menuItems.length > 0 && (
        <ContextMenu position={{ x: menu.x, y: menu.y }} items={menuItems} ariaLabel={t('files.menu')} onClose={() => setMenu(null)} />
      )}

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
          <ResultFilePreview projectId={projectId} filePath={selectedPath} />
        </div>
      )}
    </div>
  );
}
