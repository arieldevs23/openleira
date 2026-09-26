import { ChevronRight } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';

import { cn } from '@/shared/utils';

type PanelSectionProps = {
  title: string;
  /** Short value shown next to the title while the section is folded (a model name, a count). */
  summary?: ReactNode;
  defaultOpen?: boolean;
  /** Scrolls the section into view when it mounts; set for the section a menu entry opened. */
  focused?: boolean;
  children: ReactNode;
  testId?: string;
};

/**
 * A foldable block of the office side panels (agent settings, workspace
 * sidebar groups), so each view shows only what the user unfolded instead
 * of every field at once.
 */
export default function PanelSection({ title, summary, defaultOpen = false, focused = false, children, testId }: PanelSectionProps) {
  // Whether the section is unfolded.
  const [open, setOpen] = useState(defaultOpen || focused);
  const sectionRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (focused) {
      sectionRef.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
    }
  }, [focused]);

  return (
    <section
      ref={sectionRef}
      data-testid={testId}
      data-open={open ? 'true' : 'false'}
      className={cn('rounded-[12px] border border-border', focused && 'border-primary/50')}
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center gap-1.5 rounded-[12px] px-2.5 py-2 text-left hover:bg-muted/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
      >
        <ChevronRight className={cn('h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform', open && 'rotate-90')} />
        <span className="text-[12px] font-medium text-foreground">{title}</span>
        {!open && summary !== undefined && (
          <span className="ml-auto min-w-0 truncate text-[11px] text-muted-foreground">{summary}</span>
        )}
      </button>
      {open && <div className="space-y-2 px-2.5 pb-2.5">{children}</div>}
    </section>
  );
}
