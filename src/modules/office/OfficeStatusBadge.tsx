import type { OfficeNodeStatus } from '@/shared/types';
import { cn } from '@/shared/utils';

/** Palette tones per live state: running = primary, review = navy, done/failed = soft green/red. */
const TONE_CLASSES: Record<OfficeNodeStatus, string> = {
  idle: 'bg-muted text-muted-foreground',
  running: 'bg-primary/10 text-primary',
  review: 'bg-navy/10 text-navy dark:bg-blue-400/10 dark:text-blue-200',
  done: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  failed: 'bg-red-500/10 text-red-700 dark:text-red-300',
  blocked: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
};

const DOT_CLASSES: Record<OfficeNodeStatus, string> = {
  idle: 'bg-muted-foreground/50',
  running: 'bg-primary',
  review: 'bg-navy dark:bg-blue-300',
  done: 'bg-emerald-500',
  failed: 'bg-red-500',
  blocked: 'bg-amber-500',
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
        'inline-flex max-w-full items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium leading-none',
        TONE_CLASSES[tone],
        className,
      )}
    >
      <span aria-hidden className={cn('h-1.5 w-1.5 shrink-0 rounded-full', DOT_CLASSES[tone])} />
      <span className="truncate">{label}</span>
    </span>
  );
}
