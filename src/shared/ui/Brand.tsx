import { cn } from '@/shared/utils';

type RoseMarkProps = {
  /** Rendered edge length in px. The sidebar corner caps it at 20 (DESIGN.md §5). */
  size: number;
  className?: string;
  /** Empty when the mark sits next to a visible wordmark and would be read twice. */
  alt?: string;
};

/**
 * The black-rose mark, the same art as the landing page and the favicon.
 * Used by the auth, sidebar, project-workspace and settings modules wherever
 * the OpenLeira logo appears.
 */
export function RoseMark({ size, className, alt = 'OpenLeira' }: RoseMarkProps) {
  // A 2x source keeps the mark crisp on high-density screens.
  const source = size <= 32 ? '/logo-64.png' : size <= 128 ? '/logo-256.png' : '/logo-512.png';
  return (
    <img
      src={source}
      alt={alt}
      width={size}
      height={size}
      className={cn('flex-shrink-0 select-none object-contain', className)}
      draggable={false}
    />
  );
}

type BrandWordmarkProps = {
  className?: string;
};

/**
 * "Open" in --text plus "Leira" in --accent, set in Playfair Display (§7).
 * Used by the auth, sidebar, project-workspace and settings modules; callers
 * set the size, 15px in the sidebar.
 */
export function BrandWordmark({ className }: BrandWordmarkProps) {
  return (
    <span className={cn('brand-wordmark', className)}>
      Open<span className="brand-wordmark-accent">Leira</span>
    </span>
  );
}
