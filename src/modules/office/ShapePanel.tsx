import { ArrowDownToLine, ArrowUpToLine, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/shared/ui';
import type { OfficeShape, OfficeShapeKind, OfficeShapePatch } from '@/shared/types';
import { cn } from '@/shared/utils';

/**
 * Colours offered for shapes: the app's monochrome greys plus the status
 * hues, so drawings sit with the rest of the canvas. They are stored on the
 * shape as data (like a team's colour), not used as UI colours.
 */
const SWATCHES = ['#0a0a0b', '#1c1c1f', '#3a3a40', '#8a8a90', '#c9ccd4', '#f2f2f0', '#7fb08a', '#c9a96a', '#c07c7c', '#8fa3c4'];
const KINDS: OfficeShapeKind[] = ['rect', 'rounded', 'ellipse', 'diamond', 'text'];

type ShapePanelProps = {
  shape: OfficeShape;
  onChange: (changes: OfficeShapePatch & { stack?: 'front' | 'back' }) => void;
  onDelete: () => void;
};

/**
 * Right panel of the workspace page for a drawn shape: its kind, text, fill,
 * border and text colours, text size and stacking. Changes save as they are
 * made (text on blur).
 */
export default function ShapePanel({ shape, onChange, onDelete }: ShapePanelProps) {
  const { t } = useTranslation('office');
  // The text being edited; saved when the field loses focus.
  const [text, setText] = useState(shape.text);

  useEffect(() => {
    setText(shape.text);
  }, [shape.id, shape.text]);

  const colorRow = (label: string, value: string | null, field: 'fill' | 'stroke' | 'textColor', noneLabel: string) => (
    <fieldset className="space-y-1.5">
      <legend className="text-[11px] font-medium text-muted-foreground">{label}</legend>
      <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label={label}>
        <button
          type="button"
          role="radio"
          aria-checked={value === null}
          onClick={() => onChange({ [field]: null })}
          className={cn('h-6 rounded-md border px-1.5 text-[10.5px] text-muted-foreground', value === null && 'border-primary text-foreground')}
        >
          {noneLabel}
        </button>
        {SWATCHES.map((swatch) => (
          <button
            key={swatch}
            type="button"
            role="radio"
            aria-checked={value === swatch}
            aria-label={swatch}
            title={swatch}
            onClick={() => onChange({ [field]: swatch })}
            className={cn('h-6 w-6 rounded-md border border-border', value === swatch && 'outline outline-2 outline-offset-1 outline-primary')}
            style={{ backgroundColor: swatch }}
          />
        ))}
        <label className="relative h-6 w-6 cursor-pointer overflow-hidden rounded-md border border-dashed border-border" title={t('shapes.custom')}>
          <span className="sr-only">{t('shapes.custom')}</span>
          <input
            type="color"
            value={value ?? '#8a8a90'}
            onChange={(event) => onChange({ [field]: event.target.value })}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
          <span aria-hidden className="flex h-full w-full items-center justify-center text-[11px] text-muted-foreground">+</span>
        </label>
      </div>
    </fieldset>
  );

  return (
    <div className="flex flex-col gap-4" data-testid="office-shape-panel">
      <header className="space-y-1">
        <h2 className="text-base font-semibold text-foreground">{t('shapes.panelTitle')}</h2>
        <p className="text-xs text-muted-foreground">{t('shapes.panelHint')}</p>
      </header>

      <fieldset className="space-y-1.5">
        <legend className="text-[11px] font-medium text-muted-foreground">{t('shapes.kindLabel')}</legend>
        <div className="flex flex-wrap gap-1" role="radiogroup" aria-label={t('shapes.kindLabel')}>
          {KINDS.map((kind) => (
            <button
              key={kind}
              type="button"
              role="radio"
              aria-checked={shape.kind === kind}
              onClick={() => onChange({ kind })}
              className={cn('h-7 rounded-md border px-2 text-xs', shape.kind === kind ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-muted-foreground hover:text-foreground')}
            >
              {t(`shapes.kind.${kind}`)}
            </button>
          ))}
        </div>
      </fieldset>

      <label className="space-y-1.5">
        <span className="block text-[11px] font-medium text-muted-foreground">{t('shapes.textLabel')}</span>
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          onBlur={() => { if (text !== shape.text) onChange({ text }); }}
          rows={3}
          className="w-full resize-y rounded-md border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </label>

      {colorRow(t('shapes.fill'), shape.fill, 'fill', t('shapes.none'))}
      {colorRow(t('shapes.stroke'), shape.stroke, 'stroke', t('shapes.none'))}
      {colorRow(t('shapes.textColor'), shape.textColor, 'textColor', t('shapes.auto'))}

      <label className="space-y-1.5">
        <span className="flex items-center justify-between text-[11px] font-medium text-muted-foreground">
          {t('shapes.fontSize')}
          <span className="font-mono">{shape.fontSize}px</span>
        </span>
        <input
          type="range"
          min={10}
          max={48}
          value={shape.fontSize}
          onChange={(event) => onChange({ fontSize: Number(event.target.value) })}
          className="w-full accent-primary"
          aria-label={t('shapes.fontSize')}
        />
      </label>

      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" variant="outline" className="h-8 gap-1.5 px-2.5 text-xs" onClick={() => onChange({ stack: 'front' })}>
          <ArrowUpToLine className="h-3.5 w-3.5" />{t('shapes.menu.front')}
        </Button>
        <Button size="sm" variant="outline" className="h-8 gap-1.5 px-2.5 text-xs" onClick={() => onChange({ stack: 'back' })}>
          <ArrowDownToLine className="h-3.5 w-3.5" />{t('shapes.menu.back')}
        </Button>
        <Button size="sm" variant="ghost" className="h-8 gap-1.5 px-2.5 text-xs text-err" onClick={onDelete}>
          <Trash2 className="h-3.5 w-3.5" />{t('shapes.menu.delete')}
        </Button>
      </div>
    </div>
  );
}
