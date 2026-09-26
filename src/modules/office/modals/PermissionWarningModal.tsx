import { ShieldAlert } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button, Dialog, DialogContent, DialogTitle } from '@/shared/ui';

type PermissionWarningModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Records that the user saw the warning and starts the case. */
  onConfirm: () => Promise<void>;
};

/**
 * One-time warning before the first case runs with bypassed permissions:
 * office agents edit files and run commands without asking.
 */
export default function PermissionWarningModal({ open, onOpenChange, onConfirm }: PermissionWarningModalProps) {
  const { t } = useTranslation('office');
  // Confirm request in flight.
  const [isConfirming, setIsConfirming] = useState(false);

  const confirm = async () => {
    setIsConfirming(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } finally {
      setIsConfirming(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-5">
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-amber-600" />
            <DialogTitle className="not-sr-only text-base font-semibold text-foreground">{t('permission.title')}</DialogTitle>
          </div>
          <p className="text-sm text-foreground">{t('permission.body')}</p>
          <p className="text-xs text-muted-foreground">{t('permission.hint')}</p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" className="h-8 px-3 text-xs" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="button" size="sm" className="h-8 px-3 text-xs" disabled={isConfirming} onClick={() => void confirm()}>
              {t('permission.confirm')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
