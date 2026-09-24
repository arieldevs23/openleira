import { cn } from '@/shared/utils';
import type { ToolStatus } from '@/shared/types';


// Plain muted text rather than filled pills: tool rows are meant to stay quiet,
// so only the colour hints at the state.
const STATUS_CONFIG: Record<ToolStatus, { label: string; className: string }> = {
  running: {
    label: 'running',
    className: 'text-blue-600/80 dark:text-blue-300/80',
  },
  completed: {
    label: 'done',
    className: 'text-muted-foreground/70',
  },
  error: {
    label: 'error',
    className: 'text-red-600/80 dark:text-red-400/80',
  },
  denied: {
    label: 'denied',
    className: 'text-orange-600/80 dark:text-orange-300/80',
  },
};

type ToolStatusBadgeProps = {
  status: ToolStatus;
  className?: string;
};

/**
 * Used by chat's ToolRenderer, BashCommandDisplay and OneLineDisplay to label a
 * tool call's pending, running, error or denied state.
 */
export function ToolStatusBadge({ status, className }: ToolStatusBadgeProps) {
  const config = STATUS_CONFIG[status];
  return (
    <span
      className={cn(
        'inline-flex items-center font-mono text-[10px] leading-none',
        config.className,
        className,
      )}
    >
      {config.label}
    </span>
  );
}
