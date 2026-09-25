import { useTranslation } from 'react-i18next';

import type { LLMProvider, OfficeModelGroup } from '@/shared/types';
import { cn } from '@/shared/utils';

/** A provider + model pair as an office agent stores it. */
type ModelChoice = { provider: LLMProvider; model: string };

const PROVIDER_LABELS: Record<LLMProvider, string> = {
  claude: 'Claude',
  codex: 'Codex',
  cursor: 'Cursor',
  opencode: 'OpenCode',
};

const encode = (choice: ModelChoice | null) => (choice ? `${choice.provider}::${choice.model}` : '');

type ModelSelectProps = {
  id?: string;
  value: ModelChoice | null;
  groups: OfficeModelGroup[];
  onChange: (choice: ModelChoice | null) => void;
  className?: string;
  ariaLabel?: string;
};

/**
 * Native select of every provider's models, grouped by provider. Used by the
 * office module's agent panel and model wizard. A stored model the catalog no
 * longer lists stays selectable so it is never silently swapped.
 */
export default function ModelSelect({ id, value, groups, onChange, className, ariaLabel }: ModelSelectProps) {
  const { t } = useTranslation('office');
  const known = value && groups.some((group) => group.provider === value.provider
    && group.options.some((option) => option.value === value.model));

  return (
    <select
      id={id}
      aria-label={ariaLabel}
      value={encode(value)}
      onChange={(event) => {
        const [provider, ...rest] = event.target.value.split('::');
        onChange(event.target.value ? { provider: provider as LLMProvider, model: rest.join('::') } : null);
      }}
      className={cn(
        'h-9 w-full rounded-lg border border-input bg-background px-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring',
        !value && 'text-muted-foreground',
        className,
      )}
    >
      <option value="">{t('agent.pickModel')}</option>
      {value && !known && (
        <option value={encode(value)}>{`${PROVIDER_LABELS[value.provider] ?? value.provider} · ${value.model}`}</option>
      )}
      {groups.map((group) => (
        <optgroup key={group.provider} label={PROVIDER_LABELS[group.provider]}>
          {group.options.map((option) => (
            <option key={`${group.provider}-${option.value}`} value={encode({ provider: group.provider, model: option.value })}>
              {option.label}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
