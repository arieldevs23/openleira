import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import ModelSelect from '@/modules/office/ModelSelect';
import { Button, Dialog, DialogContent, DialogTitle } from '@/shared/ui';
import type { LLMProvider, OfficeDivision, OfficeModelGroup } from '@/shared/types';

type ModelChoice = { provider: LLMProvider; model: string } | null;

type ModelWizardModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  divisions: OfficeDivision[];
  groups: OfficeModelGroup[];
  onSave: (assignments: Array<{ agentId: string; provider: string; model: string }>) => Promise<void>;
};

const initialChoices = (divisions: OfficeDivision[]): Record<string, ModelChoice> => Object.fromEntries(
  divisions.map((division) => [
    division.agent.id,
    division.agent.provider && division.agent.model ? { provider: division.agent.provider, model: division.agent.model } : null,
  ]),
);

/**
 * The "pick a model" wizard: one row per agent plus "apply to all". Shown by
 * the office page on first use and from the toolbar at any time.
 */
export default function ModelWizardModal({ open, onOpenChange, divisions, groups, onSave }: ModelWizardModalProps) {
  const { t } = useTranslation('office');
  // The model picked per agent id; starts from each agent's current model.
  const [choices, setChoices] = useState<Record<string, ModelChoice>>(() => initialChoices(divisions));
  // The model the "apply to all" control would copy onto every row.
  const [bulkChoice, setBulkChoice] = useState<ModelChoice>(null);
  // Save in flight.
  const [isSaving, setIsSaving] = useState(false);
  // Server error from the save.
  const [error, setError] = useState<string | null>(null);

  const missing = divisions.filter((division) => division.agent.enabled && !choices[division.agent.id]);

  const save = async () => {
    setIsSaving(true);
    setError(null);
    try {
      const assignments = divisions
        .map((division) => ({ agentId: division.agent.id, choice: choices[division.agent.id] }))
        .filter((entry): entry is { agentId: string; choice: NonNullable<ModelChoice> } => entry.choice !== null)
        .map((entry) => ({ agentId: entry.agentId, provider: entry.choice.provider, model: entry.choice.model }));
      await onSave(assignments);
      onOpenChange(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] max-w-xl flex-col gap-3 p-5">
        <DialogTitle className="not-sr-only text-base font-semibold text-foreground">{t('wizard.title')}</DialogTitle>
        <p className="text-xs text-muted-foreground">{t('wizard.subtitle')}</p>

        <div className="flex items-end gap-2 rounded-[12px] border border-border bg-muted/40 p-2.5">
          <label className="min-w-0 flex-1 space-y-1">
            <span className="text-[11px] text-muted-foreground">{t('wizard.applyAllLabel')}</span>
            <ModelSelect value={bulkChoice} groups={groups} onChange={setBulkChoice} ariaLabel={t('wizard.applyAllLabel')} />
          </label>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-9 px-3 text-xs"
            disabled={!bulkChoice}
            onClick={() => setChoices(Object.fromEntries(divisions.map((division) => [division.agent.id, bulkChoice])))}
          >
            {t('wizard.applyAll')}
          </Button>
        </div>

        <ul className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1">
          {divisions.map((division) => (
            <li key={division.id} className="flex items-center gap-2">
              <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: division.color }} />
              <span className="w-32 shrink-0 truncate text-xs text-foreground" title={`${division.name} · ${division.agent.name}`}>
                {division.name}
                <span className="block truncate text-[10px] text-muted-foreground">{division.agent.name}</span>
              </span>
              <ModelSelect
                value={choices[division.agent.id] ?? null}
                groups={groups}
                ariaLabel={t('wizard.rowLabel', { name: division.name })}
                onChange={(choice) => setChoices((current) => ({ ...current, [division.agent.id]: choice }))}
              />
            </li>
          ))}
        </ul>

        {missing.length > 0 && (
          <p className="text-[11px] text-amber-700 dark:text-amber-300">{t('wizard.stillMissing', { count: missing.length })}</p>
        )}
        {groups.length === 0 && <p className="text-[11px] text-muted-foreground">{t('wizard.noModels')}</p>}
        {error && <p className="text-xs text-red-600 dark:text-red-300">{error}</p>}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" className="h-8 px-3 text-xs" onClick={() => onOpenChange(false)}>
            {t('wizard.later')}
          </Button>
          <Button type="button" size="sm" className="h-8 px-3 text-xs" disabled={isSaving} onClick={() => void save()}>
            {isSaving ? t('common.saving') : t('common.save')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
