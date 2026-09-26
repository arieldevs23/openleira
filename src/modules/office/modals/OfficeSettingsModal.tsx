import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { Button, Dialog, DialogContent, DialogTitle } from '@/shared/ui';
import type { Office, OfficePermissionMode } from '@/shared/types';

const PERMISSION_MODES: OfficePermissionMode[] = ['bypassPermissions', 'acceptEdits', 'default'];

type OfficeSettingsModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  office: Office;
  onSave: (changes: { name: string; maxParallel: number; permissionMode: OfficePermissionMode }) => Promise<void>;
};

/** Office settings: name, parallel limit and the permission mode every office session runs with. */
export default function OfficeSettingsModal({ open, onOpenChange, office, onSave }: OfficeSettingsModalProps) {
  const { t } = useTranslation('office');
  // Office name being edited.
  const [name, setName] = useState(office.name);
  // Parallel session limit being edited.
  const [maxParallel, setMaxParallel] = useState(office.maxParallel);
  // Permission mode being edited.
  const [permissionMode, setPermissionMode] = useState<OfficePermissionMode>(office.permissionMode);
  // Save in flight.
  const [isSaving, setIsSaving] = useState(false);
  // Server validation error.
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setIsSaving(true);
    setError(null);
    try {
      await onSave({ name: name.trim(), maxParallel, permissionMode });
      onOpenChange(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-5">
        <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-3">
          <DialogTitle className="not-sr-only text-base font-semibold text-foreground">{t('settings.title')}</DialogTitle>
          <label className="block space-y-1">
            <span className="text-[11px] text-muted-foreground">{t('settings.name')}</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={80}
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-[11px] text-muted-foreground">{t('settings.maxParallel')}</span>
            <input
              type="number"
              min={1}
              max={6}
              value={maxParallel}
              onChange={(event) => setMaxParallel(Math.min(6, Math.max(1, Number(event.target.value) || 1)))}
              className="h-9 w-24 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <span className="block text-[10px] text-muted-foreground">{t('settings.maxParallelHint')}</span>
          </label>
          <label className="block space-y-1">
            <span className="text-[11px] text-muted-foreground">{t('settings.permissionMode')}</span>
            <select
              value={permissionMode}
              onChange={(event) => setPermissionMode(event.target.value as OfficePermissionMode)}
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            >
              {PERMISSION_MODES.map((mode) => (
                <option key={mode} value={mode}>{t(`settings.modes.${mode}`)}</option>
              ))}
            </select>
            <span className="block text-[10px] text-muted-foreground">{t(`settings.modeHints.${permissionMode}`)}</span>
          </label>
          {error && <p className="text-xs text-err">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" className="h-8 px-3 text-xs" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" size="sm" className="h-8 px-3 text-xs" disabled={isSaving || !name.trim()}>
              {isSaving ? t('common.saving') : t('common.save')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
