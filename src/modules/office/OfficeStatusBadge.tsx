import type { OfficeNodeStatus } from '@/shared/types';
import { StatusMark } from '@/shared/ui';
import type { StatusMarkKind } from '@/shared/ui';
import { cn } from '@/shared/utils';

/** Theme status tones per live state: running = primary, review = navy, done/failed/blocked = ok/err/warn. */
const TONE_CLASSES: Record<OfficeNodeStatus, string> = {
  idle: 'bg-muted text-muted-foreground',
  running: 'bg-primary/10 text-primary',
  review: 'bg-navy/10 text-navy',
  done: 'bg-ok/10 text-ok',
  failed: 'bg-err/10 text-err',
  blocked: 'bg-warn/10 text-warn',
};

/** Status is never told by colour alone (DESIGN.md §2): each tone has a shape. */
const MARK_KINDS: Record<OfficeNodeStatus, StatusMarkKind> = {
  idle: 'idle',
  running: 'running',
  review: 'running',
  done: 'done',
  failed: 'error',
  blocked: 'warning',
};

type OfficeStatusBadgeProps = {
  tone: OfficeNodeStatus;
  label: string;
  className?: string;
};

/** Small status pill used across the office module (tree nodes, case list, task timeline). */
export default function OfficeStatusBadge({ tone, label, className }: OfficeStatusBadgeProps) {
  return (
    <span
      data-tone={tone}
      className={cn(
        'inline-flex max-w-full items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium leading-none',
        TONE_CLASSES[tone],
        className,
      )}
    >
      <StatusMark kind={MARK_KINDS[tone]} className="shrink-0" />
      <span className="truncate">{label}</span>
    </span>
  );
}
