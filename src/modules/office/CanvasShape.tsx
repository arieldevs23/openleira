import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { useTranslation } from 'react-i18next';

import type { OfficeShape } from '@/shared/types';
import { cn } from '@/shared/utils';

/** A resize handle: the side or corner of the shape it drags. */
export type ShapeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

const HANDLES: Array<{ handle: ShapeHandle; left: string; top: string; cursor: string }> = [
  { handle: 'nw', left: '0%', top: '0%', cursor: 'nwse-resize' },
  { handle: 'n', left: '50%', top: '0%', cursor: 'ns-resize' },
  { handle: 'ne', left: '100%', top: '0%', cursor: 'nesw-resize' },
  { handle: 'e', left: '100%', top: '50%', cursor: 'ew-resize' },
  { handle: 'se', left: '100%', top: '100%', cursor: 'nwse-resize' },
  { handle: 's', left: '50%', top: '100%', cursor: 'ns-resize' },
  { handle: 'sw', left: '0%', top: '100%', cursor: 'nesw-resize' },
  { handle: 'w', left: '0%', top: '50%', cursor: 'ew-resize' },
];

type CanvasShapeProps = {
  shape: OfficeShape;
  /** Where the shape is drawn now (its saved box, or the one being dragged or resized). */
  rect: { x: number; y: number; width: number; height: number };
  zoom: number;
  selected: boolean;
  marked: boolean;
  editing: boolean;
  onClick: (withShift: boolean) => void;
  onDoubleClick: () => void;
  onContextMenu: (event: ReactMouseEvent) => void;
  onTextCommit: (text: string) => void;
  onTextCancel: () => void;
};

/**
 * One shape the user drew on the workspace canvas (box, rounded box, ellipse,
 * diamond or free text), rendered by OfficeCanvas under the agent nodes. The
 * canvas owns the pointer: dragging the body moves it, dragging a handle of a
 * selected shape resizes it; a double-click edits its text in place.
 */
export default function CanvasShape({
  shape,
  rect,
  zoom,
  selected,
  marked,
  editing,
  onClick,
  onDoubleClick,
  onContextMenu,
  onTextCommit,
  onTextCancel,
}: CanvasShapeProps) {
  const { t } = useTranslation('office');
  // The text being typed while editing in place.
  const [draft, setDraft] = useState(shape.text);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (editing) {
      setDraft(shape.text);
      window.setTimeout(() => {
        textareaRef.current?.focus();
        textareaRef.current?.select();
      }, 0);
    }
  }, [editing, shape.text]);

  const fill = shape.fill ?? 'none';
  const stroke = shape.stroke ?? 'none';
  const outline = (() => {
    const common = { fill, stroke, strokeWidth: 1.5, vectorEffect: 'non-scaling-stroke' as const };
    switch (shape.kind) {
      case 'ellipse':
        return <ellipse cx="50%" cy="50%" rx="49%" ry="49%" {...common} />;
      case 'diamond':
        return (
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible">
            <polygon points="50,1 99,50 50,99 1,50" {...common} />
          </svg>
        );
      case 'rounded':
        return <rect x="1" y="1" width={Math.max(0, rect.width - 2)} height={Math.max(0, rect.height - 2)} rx={Math.min(16, rect.height / 3)} {...common} />;
      case 'rect':
        return <rect x="1" y="1" width={Math.max(0, rect.width - 2)} height={Math.max(0, rect.height - 2)} {...common} />;
      default:
        return null;
    }
  })();

  const label = shape.text || t(`shapes.kind.${shape.kind}`);

  return (
    <div
      role="button"
      tabIndex={0}
      data-shape-id={shape.id}
      data-testid={`office-shape-${shape.id}`}
      data-kind={shape.kind}
      data-marked={marked ? 'true' : undefined}
      aria-pressed={selected}
      aria-label={t('shapes.label', { kind: t(`shapes.kind.${shape.kind}`), text: shape.text })}
      title={shape.text || undefined}
      onClick={(event) => onClick(event.shiftKey)}
      onDoubleClick={(event) => {
        event.stopPropagation();
        onDoubleClick();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && !editing) {
          event.preventDefault();
          onDoubleClick();
        }
      }}
      onContextMenu={onContextMenu}
      className={cn('absolute cursor-move select-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary', shape.kind === 'text' && !shape.text && 'rounded-sm border border-dashed border-muted-foreground/40')}
      style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height, zIndex: 1 }}
    >
      {shape.kind === 'diamond'
        ? outline
        : outline && <svg className="absolute inset-0 h-full w-full overflow-visible" aria-hidden>{outline}</svg>}
      {!editing && (
        <span
          className={cn(
            'pointer-events-none absolute inset-0 flex items-center overflow-hidden whitespace-pre-wrap break-words px-2 leading-snug',
            shape.kind === 'text' ? 'justify-start text-left' : 'justify-center text-center',
            !shape.text && shape.kind !== 'text' && 'text-transparent',
          )}
          style={{ fontSize: shape.fontSize, color: shape.textColor ?? 'hsl(var(--foreground))' }}
        >
          {shape.text || (shape.kind === 'text' ? <span className="text-muted-foreground">{label}</span> : '')}
        </span>
      )}
      {editing && (
        <textarea
          ref={textareaRef}
          data-canvas-control
          value={draft}
          aria-label={t('shapes.editText')}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => onTextCommit(draft)}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === 'Escape') {
              event.preventDefault();
              onTextCancel();
            } else if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              onTextCommit(draft);
            }
          }}
          className="absolute inset-0 h-full w-full resize-none bg-background/80 p-2 leading-snug outline outline-2 outline-primary"
          style={{ fontSize: shape.fontSize, color: shape.textColor ?? undefined, textAlign: shape.kind === 'text' ? 'left' : 'center' }}
        />
      )}
      {(selected || marked) && !editing && (
        <span aria-hidden className="pointer-events-none absolute -inset-[3px] rounded-[4px] border border-dashed border-primary" />
      )}
      {selected && !editing && HANDLES.map(({ handle, left, top, cursor }) => (
        <span
          key={handle}
          data-shape-handle={handle}
          data-shape-id={shape.id}
          aria-hidden
          className="absolute rounded-[2px] border border-primary bg-background"
          style={{
            left,
            top,
            width: 9 / zoom,
            height: 9 / zoom,
            transform: 'translate(-50%, -50%)',
            cursor,
            borderWidth: 1.5 / zoom,
          }}
        />
      ))}
    </div>
  );
}
