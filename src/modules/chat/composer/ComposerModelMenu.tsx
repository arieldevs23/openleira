import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Check, ChevronRight } from 'lucide-react';

import type { ProviderModelOption } from '@/shared/types';
import { DEFAULT_EFFORT_VALUE } from '@/shared/constants';
import { cn } from '@/shared/utils';
import { useComposerMenuAnchor } from '@/modules/chat/hooks/useComposerMenuAnchor';
import { ComposerMenuItem, ComposerMenuSurface } from '@/modules/chat/composer/ComposerMenuPrimitives';

type EffortOption = NonNullable<ProviderModelOption['effort']>['values'][number];

type ComposerModelMenuProps = {
  effort: string;
  /** Effort values the active provider/model actually accepts; empty hides the effort button. */
  effortOptions: EffortOption[];
  onSelectEffort: (effort: string) => void;
  model: string;
  /** Model catalog for the active provider; empty hides the model button. */
  modelOptions: ProviderModelOption[];
  onSelectModel: (model: string) => void;
  modelsLoading: boolean;
};

/** How many models sit in the short list; each gets a number key (1, 2, …) while the menu is open. */
const MAIN_MODEL_COUNT = 4;

/**
 * Variants and aliases (long context, plan mode, "default", "best available")
 * go under "more models", so the short list holds one entry per model family.
 */
const SECONDARY_MODEL = /\(1m|1m context|\bplan\b|default|best available|recommended/i;

/** Effort values with a translated name; anything else shows as the provider names it. */
const KNOWN_EFFORT_LEVELS = new Set(['low', 'medium', 'high', 'xhigh', 'max']);

const triggerClass =
  'flex h-8 shrink-0 items-center rounded-lg px-2 text-xs font-medium transition-colors hover:bg-muted';

/**
 * Model picker: the main models in a short numbered list, the rest in a
 * "more models" flyout.
 */
function ModelPicker({
  model,
  modelOptions,
  onSelectModel,
  modelsLoading,
}: Pick<ComposerModelMenuProps, 'model' | 'modelOptions' | 'onSelectModel' | 'modelsLoading'>) {
  const { t } = useTranslation('chat');
  // Whether the model list is open.
  const [isOpen, setIsOpen] = useState(false);
  // Whether the "more models" flyout is open beside it.
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const close = useCallback(() => {
    setIsOpen(false);
    setIsMoreOpen(false);
  }, []);
  const { triggerRef, menuRef, anchor, updateAnchor } = useComposerMenuAnchor(isOpen, close, 240);

  const { mainModels, moreModels } = useMemo(() => {
    const main = modelOptions.filter((option) => !SECONDARY_MODEL.test(`${option.label} ${option.value}`)).slice(0, MAIN_MODEL_COUNT);
    const mainValues = new Set(main.map((option) => option.value));
    return { mainModels: main, moreModels: modelOptions.filter((option) => !mainValues.has(option.value)) };
  }, [modelOptions]);

  const selected = modelOptions.find((option) => option.value === model) ?? null;
  // The button stays short: "Default (recommended)" reads as "Default".
  const modelLabel = (selected?.label || model).replace(/\s*\(recommended\)\s*$/i, '');
  const ariaLabel = t('composer.modelMenu', { defaultValue: 'Select model' });

  const choose = useCallback((value: string) => {
    onSelectModel(value);
    close();
  }, [close, onSelectModel]);

  // Number keys pick from the short list while it is open.
  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      const index = Number.parseInt(event.key, 10) - 1;
      if (Number.isInteger(index) && index >= 0 && index < mainModels.length && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        event.stopPropagation();
        choose(mainModels[index].value);
      }
    };
    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true });
  }, [choose, isOpen, mainModels]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          updateAnchor();
          setIsMoreOpen(false);
          setIsOpen((current) => !current);
        }}
        className={cn(triggerClass, 'max-w-28 text-foreground sm:max-w-48')}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label={ariaLabel}
        title={ariaLabel}
      >
        <span className="truncate">{modelLabel}</span>
      </button>

      {isOpen && anchor && createPortal(
        <div
          ref={menuRef}
          role="menu"
          aria-label={ariaLabel}
          className="glass-surface animate-pop-in fixed z-[100] w-52 rounded-xl p-1 text-popover-foreground shadow-xl"
          style={{ right: anchor.right, bottom: anchor.bottom }}
        >
          {modelOptions.length === 0 && modelsLoading && (
            <p className="px-2.5 py-1.5 text-sm text-muted-foreground">
              {t('composer.loadingModels', { defaultValue: 'Loading models…' })}
            </p>
          )}
          {mainModels.map((option, index) => (
            <ComposerMenuItem
              key={option.value}
              label={option.label || option.value}
              isSelected={option.value === model}
              onSelect={() => choose(option.value)}
              trailing={option.value === model
                ? <Check className="h-3.5 w-3.5 text-primary" />
                : <span className="text-xs tabular-nums text-muted-foreground">{index + 1}</span>}
            />
          ))}

          {moreModels.length > 0 && (
            <div className="relative" onMouseLeave={() => setIsMoreOpen(false)}>
              {mainModels.length > 0 && <div className="my-1 h-px bg-border" aria-hidden />}
              {/* Hovering the row opens the flyout too, like a desktop submenu. */}
              <div onMouseEnter={() => setIsMoreOpen(true)}>
                <ComposerMenuItem
                  role="menuitem"
                  label={t('composer.moreModels', { defaultValue: 'More models' })}
                  isSelected={false}
                  onSelect={() => setIsMoreOpen((current) => !current)}
                  trailing={<ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                  className={cn(isMoreOpen && 'bg-accent')}
                />
              </div>
              {isMoreOpen && (
                <div
                  role="menu"
                  aria-label={t('composer.moreModels', { defaultValue: 'More models' })}
                  className="glass-surface absolute bottom-0 right-full mr-1 max-h-[60vh] w-56 overflow-y-auto rounded-xl p-1 shadow-xl"
                >
                  {moreModels.map((option) => (
                    <ComposerMenuItem
                      key={option.value}
                      label={option.label || option.value}
                      isSelected={option.value === model}
                      onSelect={() => choose(option.value)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>,
        document.body,
      )}
    </>
  );
}

/** Reasoning effort picker, shown as a quiet label next to the model ("Medium"). */
function EffortPicker({
  effort,
  effortOptions,
  onSelectEffort,
}: Pick<ComposerModelMenuProps, 'effort' | 'effortOptions' | 'onSelectEffort'>) {
  const { t } = useTranslation('chat');
  // Whether the effort list is open.
  const [isOpen, setIsOpen] = useState(false);
  const close = useCallback(() => setIsOpen(false), []);
  const { triggerRef, menuRef, anchor, updateAnchor } = useComposerMenuAnchor(isOpen, close, 260);

  const labelFor = (value: string) => {
    if (value === DEFAULT_EFFORT_VALUE) {
      return t('composer.effortLevels.default', { defaultValue: 'Auto' });
    }
    return KNOWN_EFFORT_LEVELS.has(value)
      ? t(`composer.effortLevels.${value}`, { defaultValue: value })
      : value.charAt(0).toUpperCase() + value.slice(1);
  };
  const options: EffortOption[] = [{ value: DEFAULT_EFFORT_VALUE }, ...effortOptions];
  const ariaLabel = t('composer.effortMenu', { defaultValue: 'Reasoning effort' });

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          updateAnchor();
          setIsOpen((current) => !current);
        }}
        className={cn(triggerClass, 'max-w-24 text-muted-foreground hover:text-foreground')}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label={ariaLabel}
        title={ariaLabel}
      >
        <span className="truncate">{labelFor(effort)}</span>
      </button>

      {isOpen && anchor && createPortal(
        <ComposerMenuSurface anchor={anchor} menuRef={menuRef} ariaLabel={ariaLabel}>
          {options.map((option) => (
            <ComposerMenuItem
              key={option.value}
              label={labelFor(option.value)}
              description={KNOWN_EFFORT_LEVELS.has(option.value) || option.value === DEFAULT_EFFORT_VALUE ? undefined : option.description}
              isSelected={option.value === effort}
              onSelect={() => {
                onSelectEffort(option.value);
                close();
              }}
            />
          ))}
        </ComposerMenuSurface>,
        document.body,
      )}
    </>
  );
}

/**
 * Rendered by chat's ChatComposer: the model for the next turn (a short list
 * plus "more models") and, beside it, the reasoning effort.
 */
function ComposerModelMenu({
  effort,
  effortOptions,
  onSelectEffort,
  model,
  modelOptions,
  onSelectModel,
  modelsLoading,
}: ComposerModelMenuProps) {
  const hasModels = modelOptions.length > 0 || modelsLoading;
  const hasEffort = effortOptions.length > 0;
  if (!hasModels && !hasEffort) {
    return null;
  }
  return (
    <div className="flex shrink-0 items-center">
      {hasModels && (
        <ModelPicker model={model} modelOptions={modelOptions} onSelectModel={onSelectModel} modelsLoading={modelsLoading} />
      )}
      {hasEffort && <EffortPicker effort={effort} effortOptions={effortOptions} onSelectEffort={onSelectEffort} />}
    </div>
  );
}

/** Memoized: the composer re-renders on every keystroke and none of this menu's props change while typing. */
export default memo(ComposerModelMenu);
