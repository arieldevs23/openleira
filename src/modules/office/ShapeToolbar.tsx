import { Circle, Diamond, MousePointer2, RectangleHorizontal, Square, Type } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import type { OfficeShapeKind } from '@/shared/types';
import { cn } from '@/shared/utils';

/** The canvas tool: pointing (select, move, pan) or drawing one kind of shape. */
export type CanvasTool = 'select' | OfficeShapeKind;

const TOOLS: Array<{ tool: CanvasTool; icon: LucideIcon; shortcut: string }> = [
  { tool: 'select', icon: MousePointer2, shortcut: 'V' },
  { tool: 'rect', icon: Square, shortcut: 'R' },
  { tool: 'rounded', icon: RectangleHorizontal, shortcut: 'U' },
  { tool: 'ellipse', icon: Circle, shortcut: 'O' },
  { tool: 'diamond', icon: Diamond, shortcut: 'D' },
  { tool: 'text', icon: Type, shortcut: 'T' },
];

/** Keyboard shortcut of each tool, for the canvas key handler. */
export const TOOL_SHORTCUTS: Record<string, CanvasTool> = Object.fromEntries(
  TOOLS.map(({ tool, shortcut }) => [shortcut.toLowerCase(), tool]),
);

type ShapeToolbarProps = {
  tool: CanvasTool;
  onToolChange: (tool: CanvasTool) => void;
};

/**
 * The drawing tools of the workspace canvas, like a diagram editor's shape
 * bar: pick a shape, then drag on the canvas to draw it (or click for a
 * default size). Rendered by OfficeCanvas at its top-left corner.
 */
export default function ShapeToolbar({ tool, onToolChange }: ShapeToolbarProps) {
  const { t } = useTranslation('office');
  return (
    <div
      role="toolbar"
      aria-label={t('shapes.toolbar')}
      aria-orientation="vertical"
      data-canvas-control
      className="glass-surface-strong absolute left-3 top-3 z-20 flex flex-col gap-0.5 rounded-[10px] border p-1 shadow-sm"
    >
      {TOOLS.map(({ tool: candidate, icon: Icon, shortcut }) => {
        const label = `${t(`shapes.tool.${candidate}`)} (${shortcut})`;
        return (
          <button
            key={candidate}
            type="button"
            onClick={() => onToolChange(candidate)}
            aria-pressed={tool === candidate}
            aria-label={label}
            title={label}
            data-testid={`office-tool-${candidate}`}
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
              tool === candidate && 'bg-primary/15 text-foreground',
            )}
          >
            <Icon className="h-4 w-4" />
          </button>
        );
      })}
    </div>
  );
}
