import { Search, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button, Dialog, DialogContent, DialogTitle } from '@/shared/ui';
import type { OfficeInstalledSkill } from '@/shared/types';

type SkillPickerModalProps = {
  skills: OfficeInstalledSkill[];
  /** Skills already on the canvas, marked in the list (they can still be placed again). */
  placedNames: string[];
  onCancel: () => void;
  onPick: (skillName: string) => Promise<void>;
};

/**
 * "Add skill here": picks one of the installed skills (or types the name of
 * one) to place as a node on the workspace canvas where it was right-clicked.
 */
export default function SkillPickerModal({ skills, placedNames, onCancel, onPick }: SkillPickerModalProps) {
  const { t } = useTranslation('office');
  // The search text, also usable as the name of a skill that is not listed.
  const [query, setQuery] = useState('');
  // Placing in flight.
  const [isBusy, setIsBusy] = useState(false);
  // Why placing failed.
  const [error, setError] = useState<string | null>(null);

  const needle = query.trim().toLowerCase();
  const matches = skills.filter((skill) => !needle
    || skill.name.toLowerCase().includes(needle)
    || skill.description.toLowerCase().includes(needle));

  const pick = async (skillName: string) => {
    setIsBusy(true);
    setError(null);
    try {
      await onPick(skillName);
    } catch (pickError) {
      setError(pickError instanceof Error ? pickError.message : String(pickError));
      setIsBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onCancel(); }}>
      <DialogContent className="flex max-h-[80vh] max-w-md flex-col gap-3 p-5">
        <DialogTitle className="not-sr-only text-base font-semibold text-foreground">{t('skills.pickTitle')}</DialogTitle>
        <label className="relative block">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('skills.search')}
            aria-label={t('skills.search')}
            className="h-9 w-full rounded-md border border-input bg-background pl-7 pr-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </label>
        <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto" data-testid="office-skill-picker">
          {matches.map((skill) => (
            <li key={`${skill.scope}:${skill.name}`}>
              <button
                type="button"
                disabled={isBusy}
                onClick={() => void pick(skill.name)}
                className="flex w-full items-start gap-2 rounded-[10px] px-2.5 py-2 text-left hover:bg-muted/70 disabled:opacity-60"
              >
                <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-info" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-foreground">
                    {skill.name}
                    {placedNames.includes(skill.name) && <span className="ml-1.5 text-[10px] text-muted-foreground">{t('skills.onCanvas')}</span>}
                  </span>
                  {skill.description && <span className="line-clamp-2 block text-[11px] text-muted-foreground">{skill.description}</span>}
                </span>
              </button>
            </li>
          ))}
          {matches.length === 0 && <li className="px-2 py-1 text-xs text-muted-foreground">{skills.length === 0 ? t('agent.noSkills') : t('skills.noMatch')}</li>}
        </ul>
        {error && <p className="text-xs text-err">{error}</p>}
        <div className="flex justify-between gap-2">
          <Button type="button" variant="ghost" size="sm" className="h-8 px-3 text-xs" onClick={onCancel}>{t('common.cancel')}</Button>
          {query.trim() && !skills.some((skill) => skill.name === query.trim()) && (
            <Button type="button" size="sm" className="h-8 px-3 text-xs" disabled={isBusy} onClick={() => void pick(query.trim())}>
              {t('skills.useName', { name: query.trim() })}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
