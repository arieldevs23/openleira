import { Check } from 'lucide-react';

import { cn } from '@/shared/utils';

type ChipOption = { value: string; label: string; description?: string };

type ChipMultiSelectProps = {
  options: ChipOption[];
  value: string[];
  onChange: (next: string[]) => void;
  emptyLabel: string;
  ariaLabel: string;
};

/**
 * Toggle-chip multi-select, used by the office module's agent panel for its
 * allowed tools and skills. Selected values missing from `options` (a skill
 * that was uninstalled) still show so they can be removed.
 */
export default function ChipMultiSelect({ options, value, onChange, emptyLabel, ariaLabel }: ChipMultiSelectProps) {
  const orphaned = value.filter((selected) => !options.some((option) => option.value === selected));
  const allOptions: ChipOption[] = [...options, ...orphaned.map((selected) => ({ value: selected, label: selected }))];

  if (allOptions.length === 0) {
    return <p className="text-xs text-muted-foreground">{emptyLabel}</p>;
  }

  const toggle = (optionValue: string) => {
    onChange(value.includes(optionValue) ? value.filter((entry) => entry !== optionValue) : [...value, optionValue]);
  };

  return (
    <div role="group" aria-label={ariaLabel} className="flex flex-wrap gap-1.5">
      {allOptions.map((option) => {
        const selected = value.includes(option.value);
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            title={option.description}
            onClick={() => toggle(option.value)}
            className={cn(
              'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              selected
                ? 'border-primary/40 bg-primary/10 text-primary'
                : 'border-border text-muted-foreground hover:text-foreground',
            )}
          >
            {selected && <Check className="h-3 w-3" />}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
