import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent, TouchEvent as ReactTouchEvent } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { ClipboardCopy, FileCode2 } from 'lucide-react';

import { copyTextToClipboard } from '@/shared/utils';

const LONG_PRESS_MS = 500;
// A finger drifting further than this is a scroll or a selection drag, not a press.
const LONG_PRESS_MOVE_TOLERANCE_PX = 10;
const VIEWPORT_MARGIN_PX = 8;

type MenuPosition = { x: number; y: number };

// Converts markdown into readable plain text for "Copy text".
const convertMarkdownToPlainText = (markdown: string): string => {
  let plainText = markdown.replace(/\r\n/g, '\n');
  const codeBlocks: string[] = [];
  plainText = plainText.replace(/```[\w-]*\n([\s\S]*?)```/g, (_match, code: string) => {
    const placeholder = `@@CODEBLOCK${codeBlocks.length}@@`;
    codeBlocks.push(code.replace(/\n$/, ''));
    return placeholder;
  });
  plainText = plainText.replace(/`([^`]+)`/g, '$1');
  plainText = plainText.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '$1');
  plainText = plainText.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1');
  plainText = plainText.replace(/^>\s?/gm, '');
  plainText = plainText.replace(/^#{1,6}\s+/gm, '');
  plainText = plainText.replace(/^[-*+]\s+/gm, '');
  plainText = plainText.replace(/^\d+\.\s+/gm, '');
  plainText = plainText.replace(/(\*\*|__)(.*?)\1/g, '$2');
  plainText = plainText.replace(/(\*|_)(.*?)\1/g, '$2');
  plainText = plainText.replace(/~~(.*?)~~/g, '$1');
  plainText = plainText.replace(/<\/?[^>]+(>|$)/g, '');
  plainText = plainText.replace(/\n{3,}/g, '\n\n');
  plainText = plainText.replace(/@@CODEBLOCK(\d+)@@/g, (_match, index: string) => codeBlocks[Number(index)] ?? '');
  return plainText.trim();
};

/** True when the user has a live text selection inside `element`; the native menu should win then. */
function hasSelectionWithin(element: HTMLElement | null) {
  const selection = typeof window !== 'undefined' ? window.getSelection() : null;
  if (!element || !selection || selection.isCollapsed || selection.rangeCount === 0) return false;
  return element.contains(selection.anchorNode) || element.contains(selection.focusNode);
}

/**
 * Used by chat's MessageComponent to attach a copy menu to a message bubble:
 * right-click on desktop, or a ~500ms long-press on touch. Spread
 * `bubbleHandlers` onto the bubble and render `menu` anywhere inside it.
 *
 * The long-press never calls preventDefault on touchstart, so scrolling and
 * native text selection keep working; it also backs off when a selection
 * already exists inside the bubble.
 */
export function useMessageContextMenu(content: string, enabled = true) {
  const [position, setPosition] = useState<MenuPosition | null>(null);
  const pressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressOriginRef = useRef<MenuPosition | null>(null);
  // Android follows a long-press with its own `contextmenu` event; this swallows it.
  const openedByTouchRef = useRef(false);

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
    if (hasSelectionWithin(event.currentTarget)) return;
    event.preventDefault();
    setPosition({ x: event.clientX, y: event.clientY });
  }, [enabled]);

  const onTouchStart = useCallback((event: ReactTouchEvent<HTMLElement>) => {
    if (!enabled || event.touches.length !== 1) return;
    const touch = event.touches[0];
    const bubble = event.currentTarget;
    openedByTouchRef.current = false;
    pressOriginRef.current = { x: touch.clientX, y: touch.clientY };
    if (pressTimerRef.current) clearTimeout(pressTimerRef.current);
    pressTimerRef.current = setTimeout(() => {
      const origin = pressOriginRef.current;
      pressTimerRef.current = null;
      if (!origin || hasSelectionWithin(bubble)) return;
      openedByTouchRef.current = true;
      setPosition(origin);
    }, LONG_PRESS_MS);
  }, [enabled]);

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

  const close = useCallback(() => setPosition(null), []);

  const menu = position ? (
    <MessageContextMenu content={content} position={position} onClose={close} />
  ) : null;

  return {
    bubbleHandlers: enabled
      ? { onContextMenu, onTouchStart, onTouchMove, onTouchEnd, onTouchCancel: onTouchEnd }
      : {},
    menu,
  };
}

type MessageContextMenuProps = {
  content: string;
  position: MenuPosition;
  onClose: () => void;
};

/** Glass popover with the copy actions, portalled to escape the bubble's `contain: paint`. */
function MessageContextMenu({ content, position, onClose }: MessageContextMenuProps) {
  const { t } = useTranslation('chat');
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
    menuRef.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
    return () => {
      clearTimeout(timer);
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', onClose, true);
      window.removeEventListener('resize', onClose);
    };
  }, [onClose]);

  const handleCopy = async (format: 'text' | 'markdown') => {
    await copyTextToClipboard(format === 'markdown' ? content : convertMarkdownToPlainText(content));
    onClose();
  };

  const items = [
    { format: 'text' as const, label: t('copyMessage.copyText'), icon: ClipboardCopy },
    { format: 'markdown' as const, label: t('copyMessage.copyMarkdown'), icon: FileCode2 },
  ];

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      aria-label={t('copyMessage.menuLabel')}
      style={{ position: 'fixed', left: placement.x, top: placement.y, zIndex: 1000 }}
      className="glass-surface animate-pop-in min-w-40 rounded-xl p-1 shadow-lg"
      // The portal still bubbles React events to the bubble; keep them from re-arming it.
      onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); }}
      onTouchStart={(event) => event.stopPropagation()}
    >
      {items.map(({ format, label, icon: Icon }) => (
        <button
          key={format}
          type="button"
          role="menuitem"
          onClick={() => void handleCopy(format)}
          className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs text-foreground transition-colors duration-150 hover:bg-foreground/[0.06] focus-visible:bg-foreground/[0.06] focus-visible:outline-none"
        >
          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
          {label}
        </button>
      ))}
    </div>,
    document.body,
  );
}
