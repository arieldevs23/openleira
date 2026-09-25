import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent, ReactNode, TouchEvent as ReactTouchEvent } from 'react';
import { createPortal } from 'react-dom';
import { Loader2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { cn } from '@/shared/utils';

const LONG_PRESS_MS = 500;
// A finger drifting further than this is a scroll or a selection drag, not a press.
const LONG_PRESS_MOVE_TOLERANCE_PX = 10;
const VIEWPORT_MARGIN_PX = 8;

type MenuPosition = { x: number; y: number };

type ContextMenuItem = {
  key: string;
  label: string;
  description?: string;
  icon?: LucideIcon;
  onSelect: () => void;
  disabled?: boolean;
  loading?: boolean;
  isDanger?: boolean;
  showDividerBefore?: boolean;
  /** Keep the menu open after selecting, for items that report progress in place. */
  closeOnSelect?: boolean;
};

/** True when the user has a live text selection inside `element`; the native menu should win then. */
function hasSelectionWithin(element: HTMLElement | null) {
  const selection = typeof window !== 'undefined' ? window.getSelection() : null;
  if (!element || !selection || selection.isCollapsed || selection.rangeCount === 0) return false;
  return element.contains(selection.anchorNode) || element.contains(selection.focusNode);
}

type UseContextMenuOptions = {
  enabled?: boolean;
  /** Let a live text selection inside the target keep the browser's own menu. */
  yieldToSelection?: boolean;
  onOpenChange?: (open: boolean) => void;
};

/**
 * Used by the chat module (message bubbles) and the sidebar module (session and
 * project rows) to open a menu on right-click, or on a ~500ms long-press on touch.
 * Spread `triggerHandlers` onto the target and render `ContextMenu` while
 * `position` is set.
 *
 * The long-press never calls preventDefault on touchstart, so scrolling keeps
 * working; the click a lifted finger fires after the menu opened is swallowed so
 * it does not also activate the row underneath.
 */
export function useContextMenu({ enabled = true, yieldToSelection = false, onOpenChange }: UseContextMenuOptions = {}) {
  const [position, setPosition] = useState<MenuPosition | null>(null);
  const pressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressOriginRef = useRef<MenuPosition | null>(null);
  // Android follows a long-press with its own `contextmenu` event; this swallows it.
  const openedByTouchRef = useRef(false);
  const onOpenChangeRef = useRef(onOpenChange);
  onOpenChangeRef.current = onOpenChange;

  const openAt = useCallback((next: MenuPosition) => {
    setPosition(next);
    onOpenChangeRef.current?.(true);
  }, []);

  const close = useCallback(() => {
    setPosition(null);
    onOpenChangeRef.current?.(false);
  }, []);

  const cancelPress = useCallback(() => {
    if (pressTimerRef.current) clearTimeout(pressTimerRef.current);
    pressTimerRef.current = null;
    pressOriginRef.current = null;
  }, []);

  useEffect(() => cancelPress, [cancelPress]);

  const onContextMenu = useCallback((event: ReactMouseEvent<HTMLElement>) => {
    if (!enabled) return;
    if (openedByTouchRef.current) {
      event.preventDefault();
      return;
    }
    if (yieldToSelection && hasSelectionWithin(event.currentTarget)) return;
    event.preventDefault();
    openAt({ x: event.clientX, y: event.clientY });
  }, [enabled, openAt, yieldToSelection]);

  const onTouchStart = useCallback((event: ReactTouchEvent<HTMLElement>) => {
    if (!enabled || event.touches.length !== 1) return;
    const touch = event.touches[0];
    const target = event.currentTarget;
    openedByTouchRef.current = false;
    pressOriginRef.current = { x: touch.clientX, y: touch.clientY };
    if (pressTimerRef.current) clearTimeout(pressTimerRef.current);
    pressTimerRef.current = setTimeout(() => {
      const origin = pressOriginRef.current;
      pressTimerRef.current = null;
      if (!origin || (yieldToSelection && hasSelectionWithin(target))) return;
      openedByTouchRef.current = true;
      openAt(origin);
    }, LONG_PRESS_MS);
  }, [enabled, openAt, yieldToSelection]);

  const onTouchMove = useCallback((event: ReactTouchEvent<HTMLElement>) => {
    const origin = pressOriginRef.current;
    const touch = event.touches[0];
    if (!origin || !touch) return;
    if (Math.hypot(touch.clientX - origin.x, touch.clientY - origin.y) > LONG_PRESS_MOVE_TOLERANCE_PX) {
      cancelPress();
    }
  }, [cancelPress]);

  const onTouchEnd = useCallback(() => {
    cancelPress();
    // Let the trailing synthetic contextmenu/click land before re-arming.
    setTimeout(() => { openedByTouchRef.current = false; }, 400);
  }, [cancelPress]);

  const onClickCapture = useCallback((event: ReactMouseEvent<HTMLElement>) => {
    if (!openedByTouchRef.current) return;
    event.preventDefault();
    event.stopPropagation();
  }, []);

  return {
    triggerHandlers: enabled
      ? { onContextMenu, onTouchStart, onTouchMove, onTouchEnd, onTouchCancel: onTouchEnd, onClickCapture }
      : {},
    position,
    close,
  };
}

type ContextMenuProps = {
  position: { x: number; y: number };
  items: ContextMenuItem[];
  ariaLabel: string;
  header?: ReactNode;
  className?: string;
  onClose: () => void;
};

/**
 * Used by the chat and sidebar modules: the glass popover opened by
 * `useContextMenu`, portalled so no ancestor's `contain`/overflow clips it.
 */
export function ContextMenu({ position, items, ariaLabel, header, className, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [placement, setPlacement] = useState(position);

  // Clamp to the viewport once the real size is known.
  useLayoutEffect(() => {
    const rect = menuRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPlacement({
      x: Math.max(VIEWPORT_MARGIN_PX, Math.min(position.x, window.innerWidth - rect.width - VIEWPORT_MARGIN_PX)),
      y: Math.max(VIEWPORT_MARGIN_PX, Math.min(position.y, window.innerHeight - rect.height - VIEWPORT_MARGIN_PX)),
    });
  }, [position]);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) onClose();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    // Registered on the next tick so the press that opened the menu can't close it.
    const timer = setTimeout(() => {
      document.addEventListener('pointerdown', handlePointerDown, true);
      document.addEventListener('keydown', handleKeyDown);
      window.addEventListener('scroll', onClose, true);
      window.addEventListener('resize', onClose);
    }, 0);
    menuRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true });
    return () => {
      clearTimeout(timer);
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', onClose, true);
      window.removeEventListener('resize', onClose);
    };
  }, [onClose]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      aria-label={ariaLabel}
      style={{ position: 'fixed', left: placement.x, top: placement.y, zIndex: 1000 }}
      className={cn('glass-surface animate-pop-in min-w-40 max-w-[280px] rounded-xl p-1 shadow-lg', className)}
      // The portal still bubbles React events to the trigger; keep them from re-arming it.
      onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); }}
      onTouchStart={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      {header}
      {items.map(({ key, label, description, icon: Icon, onSelect, disabled, loading, isDanger, showDividerBefore, closeOnSelect = true }) => (
        <div key={key}>
          {showDividerBefore && <div className="mx-1.5 my-1 h-px bg-foreground/[0.08]" role="separator" />}
          <button
            type="button"
            role="menuitem"
            disabled={disabled || loading}
            onClick={() => {
              onSelect();
              if (closeOnSelect) onClose();
            }}
            className={cn(
              'flex w-full items-start gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors duration-150 focus-visible:outline-none disabled:opacity-60',
              isDanger
                ? 'text-err hover:bg-err/10 focus-visible:bg-err/10'
                : 'text-foreground hover:bg-foreground/[0.06] focus-visible:bg-foreground/[0.06]',
            )}
          >
            {loading ? (
              <Loader2 className="mt-px h-3.5 w-3.5 flex-shrink-0 animate-spin text-muted-foreground" />
            ) : Icon && (
              <Icon className={cn('mt-px h-3.5 w-3.5 flex-shrink-0', isDanger ? 'text-current' : 'text-muted-foreground')} />
            )}
            <span className="min-w-0 flex-1">
              <span className="block">{label}</span>
              {description && <span className="mt-0.5 block text-[11px] text-muted-foreground">{description}</span>}
            </span>
          </button>
        </div>
      ))}
    </div>,
    document.body,
  );
}
