import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { parseFilePreview, previewKindFor, type ParsedFilePreview } from '@/modules/office/utils/officeFilePreview';
import { api, readApiJson } from '@/shared/api';

/** What the preview holds once loaded. */
type LoadedPreview =
  | { kind: 'text'; content: string }
  | { kind: 'parsed'; parsed: ParsedFilePreview }
  | { kind: 'pdf' | 'image'; url: string }
  | { kind: 'unsupported' };

const tableClass = 'w-full border-collapse text-[11px]';
const cellClass = 'max-w-[220px] truncate border border-border px-1.5 py-0.5 text-left align-top';

function PreviewTable({ rows, header }: { rows: string[][]; header: boolean }) {
  const width = Math.max(0, ...rows.map((row) => row.length));
  return (
    <table className={tableClass}>
      <tbody>
        {rows.map((row, rowIndex) => (
          <tr key={rowIndex} className={header && rowIndex === 0 ? 'bg-muted/60 font-medium' : undefined}>
            {Array.from({ length: width }, (_, cellIndex) => (
              <td key={cellIndex} className={cellClass} title={row[cellIndex] ?? ''}>{row[cellIndex] ?? ''}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * Preview of one result file in the office's files tab: text as text,
 * spreadsheets (xlsx, csv) as a table, Word files as paragraphs and tables,
 * PDFs and images in place. Used only by the result files panel.
 */
export default function ResultFilePreview({ projectId, filePath }: { projectId: string; filePath: string }) {
  const { t } = useTranslation('office');
  // The loaded preview of `filePath`, or why it could not be shown.
  const [state, setState] = useState<{ path: string; preview: LoadedPreview | null; error: string | null } | null>(null);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    const kind = previewKindFor(filePath);
    const load = async (): Promise<LoadedPreview> => {
      if (kind === 'unsupported') {
        return { kind: 'unsupported' };
      }
      if (kind === 'text') {
        const body = await readApiJson<{ content: string }>(await api.readFile(projectId, filePath));
        return { kind: 'text', content: body.content };
      }
      const response = await api.readFileBlob(projectId, filePath);
      if (!response.ok) {
        throw new Error(t('files.previewFailed'));
      }
      if (kind === 'pdf' || kind === 'image') {
        const blob = await response.blob();
        // A PDF blob needs its type for the browser's viewer to open it.
        objectUrl = URL.createObjectURL(kind === 'pdf' ? new Blob([blob], { type: 'application/pdf' }) : blob);
        return { kind, url: objectUrl };
      }
      return { kind: 'parsed', parsed: await parseFilePreview(filePath, await response.arrayBuffer()) };
    };
    load()
      .then((preview) => { if (!cancelled) setState({ path: filePath, preview, error: null }); })
      .catch((error: unknown) => {
        if (!cancelled) setState({ path: filePath, preview: null, error: error instanceof Error ? error.message : String(error) });
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [projectId, filePath, t]);

  if (!state || state.path !== filePath) {
    return <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />{t('loading')}</div>;
  }
  if (state.error || !state.preview) {
    return <p className="text-xs text-err">{state.error ?? t('files.previewFailed')}</p>;
  }

  const frame = 'max-h-80 overflow-auto rounded-[10px] border border-border bg-muted/40 p-2';
  const { preview } = state;
  switch (preview.kind) {
    case 'text':
      return <pre className={`${frame} text-[11px] leading-relaxed`} data-testid="office-file-preview">{preview.content}</pre>;
    case 'unsupported':
      return <p className="text-xs text-muted-foreground" data-testid="office-file-preview">{t('files.noPreview')}</p>;
    case 'image':
      return <img src={preview.url} alt={filePath} className="max-h-80 rounded-[10px] border border-border object-contain" data-testid="office-file-preview" />;
    case 'pdf':
      return <iframe src={preview.url} title={filePath} className="h-96 w-full rounded-[10px] border border-border bg-white" data-testid="office-file-preview" />;
    case 'parsed': {
      const { parsed } = preview;
      if (parsed.kind === 'table') {
        return (
          <div className="space-y-1" data-testid="office-file-preview">
            {(parsed.sheetName || parsed.sheetCount > 1) && (
              <p className="text-[10.5px] text-muted-foreground">
                {parsed.sheetName ?? ''}{parsed.sheetCount > 1 ? ` · ${t('files.sheetCount', { count: parsed.sheetCount })}` : ''}
              </p>
            )}
            <div className={frame}>
              {parsed.rows.length === 0 ? <p className="text-xs text-muted-foreground">{t('files.emptySheet')}</p> : <PreviewTable rows={parsed.rows} header />}
            </div>
            {parsed.truncated && <p className="text-[10.5px] text-muted-foreground">{t('files.truncated')}</p>}
          </div>
        );
      }
      return (
        <div className="space-y-1" data-testid="office-file-preview">
          <div className={`${frame} space-y-1.5 bg-background text-[12px] leading-relaxed`}>
            {parsed.blocks.map((block, index) => (block.type === 'paragraph'
              ? <p key={index} className="whitespace-pre-wrap">{block.text || ' '}</p>
              : <PreviewTable key={index} rows={block.rows} header={false} />))}
          </div>
          {parsed.truncated && <p className="text-[10.5px] text-muted-foreground">{t('files.truncated')}</p>}
        </div>
      );
    }
    default:
      return null;
  }
}
