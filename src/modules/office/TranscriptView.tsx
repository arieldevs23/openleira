import { AlertCircle, CheckCircle2, ExternalLink, Wrench } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { useOfficeLog } from '@/modules/office/hooks/useOfficeLog';
import { cn } from '@/shared/utils';

type TranscriptViewProps = {
  sessionId: string | null;
  onOpenSession: (sessionId: string) => void;
};

/**
 * Compact, live transcript of one office session. The full conversation is
 * one click away in the regular chat view, since every office turn is a
 * normal app session.
 */
export default function TranscriptView({ sessionId, onOpenSession }: TranscriptViewProps) {
  const { t } = useTranslation('office');
  const { entries, isLoading } = useOfficeLog(sessionId);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [entries.length]);

  if (!sessionId) {
    return <p className="text-xs text-muted-foreground">{t('transcript.none')}</p>;
  }

  return (
    <div className="flex min-h-0 flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{t('transcript.title')}</span>
        <button
          type="button"
          onClick={() => onOpenSession(sessionId)}
          className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
        >
          <ExternalLink className="h-3 w-3" />
          {t('transcript.openInChat')}
        </button>
      </div>
      <div className="max-h-80 overflow-y-auto rounded-[10px] border border-border bg-background/60 p-2 text-xs" aria-live="polite">
        {entries.length === 0 && (
          <p className="text-muted-foreground">{isLoading ? t('transcript.loading') : t('transcript.empty')}</p>
        )}
        <ul className="space-y-1.5">
          {entries.map((entry) => (
            <li key={entry.id} className={cn('flex gap-1.5', entry.type === 'error' && 'text-red-600 dark:text-red-300')}>
              {entry.type === 'tool' && <Wrench className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />}
              {entry.type === 'error' && <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />}
              {entry.type === 'done' && <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600" />}
              <span className={cn('min-w-0 whitespace-pre-wrap break-words', entry.type === 'tool' && 'text-muted-foreground')}>
                {entry.type === 'tool' && <span className="font-medium text-foreground">{entry.toolName} </span>}
                {entry.type === 'done' ? t(entry.text === 'aborted' ? 'transcript.aborted' : 'transcript.done') : entry.text}
              </span>
            </li>
          ))}
        </ul>
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
