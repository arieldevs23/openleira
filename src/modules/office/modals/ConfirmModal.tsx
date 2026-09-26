import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button, Dialog, DialogContent, DialogTitle } from '@/shared/ui';

type ConfirmModalProps = {
  title: string;
  body: string;
  confirmLabel: string;
  onCancel: () => void;
  /** Runs the destructive action; a thrown error is shown and keeps the dialog open. */
  onConfirm: () => Promise<void>;
};

/** "Are you sure?" dialog of the workspace page, for deleting a workspace or a division. */
export default function ConfirmModal({ title, body, confirmLabel, onCancel, onConfirm }: ConfirmModalProps) {
  const { t } = useTranslation('office');
  // Confirm request in flight.
  const [isBusy, setIsBusy] = useState(false);
  // Why the action failed, if it did.
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    setIsBusy(true);
    setError(null);
    try {
      await onConfirm();
    } catch (confirmError) {
      setError(confirmError instanceof Error ? confirmError.message : String(confirmError));
      setIsBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onCancel(); }}>
      <DialogContent className="max-w-sm p-5">
        <div className="flex flex-col gap-3">
          <DialogTitle className="not-sr-only text-base font-semibold text-foreground">{title}</DialogTitle>
          <p className="text-sm text-foreground">{body}</p>
          {error && <p className="text-xs text-err">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" className="h-8 px-3 text-xs" onClick={onCancel}>{t('common.cancel')}</Button>
            <Button type="button" variant="destructive" size="sm" className="h-8 px-3 text-xs" disabled={isBusy} onClick={() => void confirm()}>
              {confirmLabel}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
