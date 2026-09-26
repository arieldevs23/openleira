import { useTranslation } from 'react-i18next';

import { formatTokens } from '@/modules/office/utils/officeCanvasLayout';
import type { OfficeCaseUsage, OfficeDivision, OfficeTask } from '@/shared/types';

type UsagePanelProps = {
  usage: OfficeCaseUsage | null;
  divisions: OfficeDivision[];
  tasks: OfficeTask[];
};

/**
 * Token monitor of a case in the office page's right panel: the case total,
 * the split into input/output/cache, and one bar per division (coordinator
 * and audit included), read from the providers' own transcripts.
 */
export default function UsagePanel({ usage, divisions, tasks }: UsagePanelProps) {
  const { t } = useTranslation('office');
  if (!usage) {
    return <p className="text-xs text-muted-foreground">{t('usage.loading')}</p>;
  }
  if (usage.sessions.length === 0) {
    return <p className="text-xs text-muted-foreground">{t('usage.none')}</p>;
  }

  const byDivision = new Map<string, number>();
  for (const session of usage.sessions) {
    const key = session.divisionId ?? 'unknown';
    byDivision.set(key, (byDivision.get(key) ?? 0) + session.total);
  }
  const rows = [...byDivision.entries()]
    .map(([divisionId, total]) => ({ division: divisions.find((division) => division.id === divisionId) ?? null, total }))
    .sort((left, right) => right.total - left.total);
  const max = Math.max(1, ...rows.map((row) => row.total));
  const taskRefs = new Map(tasks.map((task) => [task.id, task.ref]));

  return (
    <div className="space-y-3" data-testid="office-usage">
      <div className="grid grid-cols-2 gap-2">
        <div className="col-span-2 rounded-[10px] border border-border bg-card/60 p-2.5">
          <span className="block text-[10px] uppercase tracking-wide text-muted-foreground">{t('usage.total')}</span>
          <span className="text-lg font-semibold tabular-nums text-foreground" data-testid="office-usage-total">{formatTokens(usage.total)}</span>
          <span className="ml-1 text-[11px] text-muted-foreground">{t('usage.tokens')}</span>
        </div>
        {([['input', usage.inputTokens], ['output', usage.outputTokens], ['cache', usage.cacheTokens]] as const).map(([key, value]) => (
          <div key={key} className="rounded-[10px] border border-border p-2">
            <span className="block text-[10px] text-muted-foreground">{t(`usage.${key}`)}</span>
            <span className="text-sm font-medium tabular-nums text-foreground">{formatTokens(value)}</span>
          </div>
        ))}
      </div>

      <ul className="space-y-1.5" aria-label={t('usage.perDivision')}>
        {rows.map(({ division, total }) => (
          <li key={division?.id ?? 'unknown'} className="space-y-0.5">
            <div className="flex items-center gap-1.5 text-xs">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: division?.color ?? 'var(--muted)' }} />
              <span className="min-w-0 flex-1 truncate">{division?.name ?? t('usage.removedDivision')}</span>
              <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{formatTokens(total)}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full" style={{ width: `${(total / max) * 100}%`, backgroundColor: division?.color ?? 'var(--accent)' }} />
            </div>
          </li>
        ))}
      </ul>

      <details className="text-[11px] text-muted-foreground">
        <summary className="cursor-pointer select-none">{t('usage.perSession', { count: usage.sessions.length })}</summary>
        <ul className="mt-1 space-y-0.5">
          {usage.sessions.map((session) => (
            <li key={`${session.role}:${session.sessionId}`} className="flex gap-2 font-mono">
              <span className="w-16 shrink-0">{t(`usage.role.${session.role}`)}</span>
              <span className="min-w-0 flex-1 truncate">{session.taskId ? taskRefs.get(session.taskId) ?? '' : ''}</span>
              <span className="shrink-0">{formatTokens(session.total)}</span>
            </li>
          ))}
        </ul>
      </details>
      <p className="text-[10px] text-muted-foreground">{t('usage.note')}</p>
    </div>
  );
}
