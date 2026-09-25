import { CheckCircle2, Circle, Loader2, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import ModelSelect from '@/modules/office/ModelSelect';
import { OFFICE_PROVIDERS, OFFICE_PROVIDER_LABELS } from '@/modules/office/hooks/useOfficeProviders';
import { Button, Dialog, DialogContent, DialogTitle } from '@/shared/ui';
import type { LLMProvider, OfficeDivision, OfficeModelGroup, ProviderAuthStatusMap } from '@/shared/types';
import { cn } from '@/shared/utils';

type ModelChoice = { provider: LLMProvider; model: string } | null;

type WizardStep = 'providers' | 'models';

type ModelWizardModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  divisions: OfficeDivision[];
  /** Model menus of the connected providers only. */
  groups: OfficeModelGroup[];
  providerStatuses: ProviderAuthStatusMap;
  connectedProviders: LLMProvider[];
  isCheckingProviders: boolean;
  /** Opens the login shell for a provider. */
  onConnectProvider: (provider: LLMProvider) => void;
  onRefreshProviders: () => void;
  /** Step to open on; defaults to "providers" until one is connected. */
  initialStep?: WizardStep;
  onSave: (assignments: Array<{ agentId: string; provider: string; model: string }>) => Promise<void>;
};

const initialChoices = (divisions: OfficeDivision[]): Record<string, ModelChoice> => Object.fromEntries(
  divisions.map((division) => [
    division.agent.id,
    division.agent.provider && division.agent.model ? { provider: division.agent.provider, model: division.agent.model } : null,
  ]),
);

/**
 * The office setup wizard: first connect at least one provider (the same
 * login shell as onboarding), then pick a model per agent, with "apply to
 * all". Shown by the office page on first use and from the toolbar at any time.
 */
export default function ModelWizardModal({
  open,
  onOpenChange,
  divisions,
  groups,
  providerStatuses,
  connectedProviders,
  isCheckingProviders,
  onConnectProvider,
  onRefreshProviders,
  initialStep,
  onSave,
}: ModelWizardModalProps) {
  const { t } = useTranslation('office');
  // The wizard page on screen.
  const [step, setStep] = useState<WizardStep>(initialStep ?? (connectedProviders.length > 0 ? 'models' : 'providers'));
  // The model picked per agent id; starts from each agent's current model.
  const [choices, setChoices] = useState<Record<string, ModelChoice>>(() => initialChoices(divisions));
  // The model the "apply to all" control would copy onto every row.
  const [bulkChoice, setBulkChoice] = useState<ModelChoice>(null);
  // Save in flight.
  const [isSaving, setIsSaving] = useState(false);
  // Server error from the save.
  const [error, setError] = useState<string | null>(null);

  const missing = divisions.filter((division) => division.agent.enabled && !choices[division.agent.id]);
  const hasConnected = connectedProviders.length > 0;

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

  const stepButton = (target: WizardStep, index: number, label: string) => (
    <button
      type="button"
      aria-current={step === target ? 'step' : undefined}
      disabled={target === 'models' && !hasConnected}
      onClick={() => setStep(target)}
      className={cn(
        'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        step === target ? 'bg-primary/10 font-medium text-primary' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      <span className="flex h-4 w-4 items-center justify-center rounded-full border border-current text-[10px]">{index}</span>
      {label}
    </button>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] max-w-xl flex-col gap-3 p-5">
        <DialogTitle className="not-sr-only text-base font-semibold text-foreground">
          {step === 'providers' ? t('providers.title') : t('wizard.title')}
        </DialogTitle>
        <nav aria-label={t('wizard.steps')} className="flex items-center gap-1">
          {stepButton('providers', 1, t('wizard.stepProviders'))}
          <span aria-hidden className="h-px w-4 bg-border" />
          {stepButton('models', 2, t('wizard.stepModels'))}
        </nav>

        {step === 'providers' ? (
          <>
            <p className="text-xs text-muted-foreground">{t('providers.subtitle')}</p>
            <ul className="space-y-1.5" data-testid="office-provider-list">
              {OFFICE_PROVIDERS.map((provider) => {
                const status = providerStatuses[provider];
                return (
                  <li
                    key={provider}
                    data-testid={`office-provider-${provider}`}
                    data-connected={status.authenticated ? 'true' : 'false'}
                    className="flex items-center gap-2.5 rounded-[12px] border border-border px-3 py-2"
                  >
                    {status.loading ? (
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
                    ) : status.authenticated ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    ) : (
                      <Circle className="h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground">{OFFICE_PROVIDER_LABELS[provider]}</p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {status.loading
                          ? t('providers.checking')
                          : status.authenticated
                            ? status.email
                              ? t('providers.connectedAs', { email: status.email })
                              : t('providers.connected')
                            : t('providers.notConnected')}
                      </p>
                    </div>
                    {!status.loading && !status.authenticated && (
                      <Button type="button" size="sm" variant="outline" className="h-8 px-3 text-xs" onClick={() => onConnectProvider(provider)}>
                        {t('providers.connect')}
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
            <p className="text-[11px] text-muted-foreground">{t('providers.hint')}</p>

            <div className="flex items-center justify-between gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 gap-1.5 px-2.5 text-xs"
                disabled={isCheckingProviders}
                onClick={onRefreshProviders}
              >
                <RefreshCw className={cn('h-3.5 w-3.5', isCheckingProviders && 'animate-spin')} />
                {t('providers.recheck')}
              </Button>
              <div className="flex gap-2">
                <Button type="button" variant="ghost" size="sm" className="h-8 px-3 text-xs" onClick={() => onOpenChange(false)}>
                  {t('wizard.later')}
                </Button>
                <Button type="button" size="sm" className="h-8 px-3 text-xs" disabled={!hasConnected} onClick={() => setStep('models')}>
                  {t('wizard.next')}
                </Button>
              </div>
            </div>
          </>
        ) : (
          <>
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
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
