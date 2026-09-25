import { Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';

import OfficeStatusBadge from '@/modules/office/OfficeStatusBadge';
import { Button } from '@/shared/ui';
import type { OfficeCase } from '@/shared/types';
import { cn, officeCaseTone } from '@/shared/utils';

type CaseListProps = {
  cases: OfficeCase[];
  selectedCaseId: string | null;
  onSelect: (caseId: string) => void;
  onCreate: (input: { title: string; description: string }) => Promise<void>;
};

/** Left column of the office page: the office's cases, newest first, and the new-case form. */
export default function CaseList({ cases, selectedCaseId, onSelect, onCreate }: CaseListProps) {
  const { t } = useTranslation('office');
  // Whether the inline new-case form is open.
  const [isComposing, setIsComposing] = useState(false);
  // Title of the case being written.
  const [title, setTitle] = useState('');
  // Description of the case being written; what the coordinator plans from.
  const [description, setDescription] = useState('');
  // Blocks double submits and shows the button's busy label.
  const [isSaving, setIsSaving] = useState(false);
  // Server-side validation message for the form.
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim() || isSaving) {
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      await onCreate({ title: title.trim(), description: description.trim() });
      setTitle('');
      setDescription('');
      setIsComposing(false);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : String(createError));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2 px-3 pb-2 pt-3">
        <h2 className="text-sm font-semibold text-foreground">{t('cases.title')}</h2>
        <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs" onClick={() => setIsComposing((open) => !open)}>
          <Plus className="h-3.5 w-3.5" />
          {t('cases.new')}
        </Button>
      </div>

      {isComposing && (
        <form onSubmit={(event) => void submit(event)} className="mx-3 mb-2 space-y-2 rounded-[12px] border border-border bg-card/70 p-2.5">
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={t('cases.titlePlaceholder')}
            aria-label={t('cases.titlePlaceholder')}
            maxLength={200}
            autoFocus
            className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder={t('cases.descriptionPlaceholder')}
            aria-label={t('cases.descriptionPlaceholder')}
            rows={4}
            className="w-full resize-y rounded-md border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
          {error && <p className="text-xs text-red-600 dark:text-red-300">{error}</p>}
          <div className="flex justify-end gap-1.5">
            <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setIsComposing(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" size="sm" className="h-7 px-3 text-xs" disabled={!title.trim() || isSaving}>
              {isSaving ? t('common.saving') : t('cases.create')}
            </Button>
          </div>
        </form>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {cases.length === 0 && !isComposing && (
          <p className="px-1 py-2 text-xs text-muted-foreground">{t('cases.empty')}</p>
        )}
        <ul className="space-y-1">
          {cases.map((caseItem) => (
            <li key={caseItem.id}>
              <button
                type="button"
                onClick={() => onSelect(caseItem.id)}
                aria-current={caseItem.id === selectedCaseId}
                className={cn(
                  'flex w-full flex-col gap-1 rounded-[10px] px-2.5 py-2 text-left transition-colors hover:bg-muted/70',
                  caseItem.id === selectedCaseId && 'bg-primary/10 hover:bg-primary/10',
                )}
              >
                <span className="line-clamp-2 text-[13px] font-medium text-foreground">{caseItem.title}</span>
                <span className="flex items-center gap-1.5">
                  <OfficeStatusBadge tone={officeCaseTone(caseItem.status)} label={t(`status.${caseItem.status}`)} />
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(caseItem.createdAt).toLocaleDateString()}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
