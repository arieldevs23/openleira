import { cn } from '@/shared/utils';

/**
 * The shapes status is drawn with (DESIGN.md §2): status is never told by
 * colour alone.
 * - done: filled dot
 * - running: ring with a pulsing halo (opacity only; stopped by reduced motion)
 * - idle: hollow dot
 * - warning: small triangle
 * - error: small diamond
 */
export type StatusMarkKind = 'done' | 'running' | 'idle' | 'warning' | 'error';

const KIND_CLASS_NAMES: Record<StatusMarkKind, string> = {
  done: 'status-mark-done text-ok',
  running: 'status-mark-running text-run',
  idle: 'status-mark-idle text-muted-foreground',
  warning: 'status-mark-warning text-warn',
  error: 'status-mark-error text-err',
};

type StatusMarkProps = {
  kind: StatusMarkKind;
  /** Accessible name; omit only when adjacent text already states the status. */
  label?: string;
  className?: string;
};

/**
 * A small status indicator whose shape carries the meaning and whose colour
 * only reinforces it. Used by the sidebar and chat modules for session and
 * task status dots.
 */
export function StatusMark({ kind, label, className }: StatusMarkProps) {
  return (
    <span
      className={cn('status-mark', KIND_CLASS_NAMES[kind], className)}
      role={label ? 'status' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  );
}
