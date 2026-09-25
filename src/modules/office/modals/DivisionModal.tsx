import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { Button, Dialog, DialogContent, DialogTitle } from '@/shared/ui';

/** Default colour of a new division: the palette primary. */
const DEFAULT_COLOR = '#2551BD';

type DivisionModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (input: { name: string; description: string; color: string }) => Promise<void>;
};

/** "Add division" dialog of the office page; the agent is configured afterwards in the agent panel. */
export default function DivisionModal({ open, onOpenChange, onCreate }: DivisionModalProps) {
  const { t } = useTranslation('office');
  // Name of the new division.
  const [name, setName] = useState('');
  // Description shown to the coordinator when it picks divisions.
  const [description, setDescription] = useState('');
  // Colour of the division on the tree.
  const [color, setColor] = useState(DEFAULT_COLOR);
  // Create request in flight.
  const [isSaving, setIsSaving] = useState(false);
  // Server validation error.
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) {
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      await onCreate({ name: name.trim(), description: description.trim(), color });
      setName('');
      setDescription('');
      setColor(DEFAULT_COLOR);
      onOpenChange(false);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : String(createError));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-5">
        <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-3">
          <DialogTitle className="not-sr-only text-base font-semibold text-foreground">{t('division.addTitle')}</DialogTitle>
          <label className="block space-y-1">
            <span className="text-[11px] text-muted-foreground">{t('division.name')}</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={80}
              placeholder={t('division.namePlaceholder')}
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-[11px] text-muted-foreground">{t('division.description')}</span>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
              maxLength={500}
              className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </label>
          <label className="flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground">{t('division.color')}</span>
            <input type="color" value={color} onChange={(event) => setColor(event.target.value)} className="h-7 w-10 cursor-pointer rounded border border-input" aria-label={t('division.color')} />
            <span className="font-mono text-[11px] text-muted-foreground">{color}</span>
          </label>
          <p className="text-[11px] text-muted-foreground">{t('division.addHint')}</p>
          {error && <p className="text-xs text-red-600 dark:text-red-300">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" className="h-8 px-3 text-xs" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" size="sm" className="h-8 px-3 text-xs" disabled={!name.trim() || isSaving}>
              {isSaving ? t('common.saving') : t('division.add')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
