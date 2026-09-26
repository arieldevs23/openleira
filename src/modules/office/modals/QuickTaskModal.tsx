import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button, Dialog, DialogContent, DialogTitle } from '@/shared/ui';

type QuickTaskModalProps = {
  agentName: string;
  onCancel: () => void;
  /** Creates and starts the quick task; a thrown error is shown and keeps the dialog open. */
  onSubmit: (input: { title: string; description: string }) => Promise<void>;
};

/**
 * "Quick task" dialog from an agent's canvas menu: a small job that goes
 * straight to that one team, without the coordinator's plan, audit or summary.
 */
export default function QuickTaskModal({ agentName, onCancel, onSubmit }: QuickTaskModalProps) {
  const { t } = useTranslation('office');
  // What the job is called.
  const [title, setTitle] = useState('');
  // Optional details for the agent.
  const [description, setDescription] = useState('');
  // Submit request in flight.
  const [isBusy, setIsBusy] = useState(false);
  // Why creating or starting the task failed, if it did.
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!title.trim()) {
      return;
    }
    setIsBusy(true);
    setError(null);
    try {
      await onSubmit({ title: title.trim(), description: description.trim() });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : String(submitError));
      setIsBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onCancel(); }}>
      <DialogContent className="max-w-md p-5">
        <form
          className="flex flex-col gap-3"
          data-testid="office-quick-task"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <DialogTitle className="not-sr-only text-base font-semibold text-foreground">{t('quickTask.title', { name: agentName })}</DialogTitle>
          <p className="text-xs text-muted-foreground">{t('quickTask.hint')}</p>
          <input
            autoFocus
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={t('quickTask.titlePlaceholder')}
            aria-label={t('quickTask.titleLabel')}
            className="h-9 rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/30"
          />
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder={t('quickTask.descriptionPlaceholder')}
            aria-label={t('quickTask.descriptionLabel')}
            rows={4}
            className="resize-y rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
          />
          {error && <p className="text-xs text-red-600 dark:text-red-300">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" className="h-8 px-3 text-xs" onClick={onCancel}>{t('common.cancel')}</Button>
            <Button type="submit" size="sm" className="h-8 px-3 text-xs" disabled={isBusy || !title.trim()}>
              {t('quickTask.submit')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
