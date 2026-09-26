import { Copy, Sparkles, Trash2, Unlink } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/shared/ui';
import type { OfficeDivision, OfficeInstalledSkill, OfficeSkillNode } from '@/shared/types';

type SkillNodePanelProps = {
  node: OfficeSkillNode;
  divisions: OfficeDivision[];
  installedSkills: OfficeInstalledSkill[];
  onSelectDivision: (divisionId: string) => void;
  onUnlink: (divisionId: string) => void;
  onCopy: () => void;
  onDelete: () => void;
};

/**
 * Right panel of the workspace page for a skill node on the canvas: what the
 * skill does and which agents have it. Agents get a skill by being linked to
 * it on the canvas, so this panel only unlinks; linking happens by drawing.
 */
export default function SkillNodePanel({ node, divisions, installedSkills, onSelectDivision, onUnlink, onCopy, onDelete }: SkillNodePanelProps) {
  const { t } = useTranslation('office');
  const installed = installedSkills.find((skill) => skill.name === node.skillName);
  const linked = divisions.filter((division) => node.divisionIds.includes(division.id));

  return (
    <div className="space-y-3" data-testid="office-skill-panel">
      <header className="space-y-1">
        <h2 className="flex items-center gap-1.5 text-base font-semibold text-foreground">
          <Sparkles className="h-4 w-4 text-info" />
          {node.skillName}
        </h2>
        {installed ? (
          <p className="text-xs text-muted-foreground">
            {installed.description || t('skills.noDescription')}
            <span className="ml-1 text-[10px] uppercase tracking-wide">· {installed.scope}</span>
          </p>
        ) : (
          <p className="text-xs text-warn">{t('skills.notInstalled')}</p>
        )}
      </header>

      <section className="space-y-1.5">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('skills.linkedAgents', { count: linked.length })}</h3>
        {linked.length === 0 && <p className="text-xs text-muted-foreground">{t('skills.noLinks')}</p>}
        <ul className="space-y-1">
          {linked.map((division) => (
            <li key={division.id} className="flex items-center gap-2 rounded-[10px] border border-border px-2.5 py-1.5">
              <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: division.color }} />
              <button type="button" onClick={() => onSelectDivision(division.id)} className="min-w-0 flex-1 truncate text-left text-xs text-foreground hover:underline">
                {division.agent.name} · {division.name}
              </button>
              <button
                type="button"
                onClick={() => onUnlink(division.id)}
                className="shrink-0 rounded-md p-1 text-muted-foreground hover:text-err"
                aria-label={t('skills.unlink', { name: division.agent.name })}
                title={t('skills.unlink', { name: division.agent.name })}
              >
                <Unlink className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
        <p className="text-[11px] text-muted-foreground">{t('skills.howToLink')}</p>
      </section>

      <div className="flex gap-2">
        <Button size="sm" variant="outline" className="h-8 gap-1.5 px-3 text-xs" onClick={onCopy}>
          <Copy className="h-3.5 w-3.5" />
          {t('menu.copySkill')}
        </Button>
        <Button size="sm" variant="ghost" className="h-8 gap-1.5 px-3 text-xs text-err hover:text-err/80" onClick={onDelete}>
          <Trash2 className="h-3.5 w-3.5" />
          {t('menu.deleteSkill')}
        </Button>
      </div>
    </div>
  );
}
