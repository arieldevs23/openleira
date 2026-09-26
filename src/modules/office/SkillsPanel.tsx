import { useTranslation } from 'react-i18next';

import type { OfficeDivision, OfficeInstalledSkill } from '@/shared/types';

type SkillsPanelProps = {
  divisions: OfficeDivision[];
  skills: OfficeInstalledSkill[];
  onSelectDivision: (divisionId: string) => void;
};

/** Right panel of the office page for the skills layer: installed skills and which agents use them. */
export default function SkillsPanel({ divisions, skills, onSelectDivision }: SkillsPanelProps) {
  const { t } = useTranslation('office');
  const usedNames = new Set(divisions.flatMap((division) => division.agent.skills));
  const missing = [...usedNames].filter((name) => !skills.some((skill) => skill.name === name));

  const renderUsers = (skillName: string) => {
    const users = divisions.filter((division) => division.agent.skills.includes(skillName));
    if (users.length === 0) {
      return <span className="text-muted-foreground">{t('skills.unused')}</span>;
    }
    return users.map((division) => (
      <button
        key={division.id}
        type="button"
        onClick={() => onSelectDivision(division.id)}
        className="rounded-full border border-border px-1.5 py-0.5 hover:border-primary/40 hover:text-primary"
      >
        {division.name}
      </button>
    ));
  };

  return (
    <div className="flex flex-col gap-3">
      <header>
        <h2 className="text-base font-semibold text-foreground">{t('skills.title')}</h2>
        <p className="text-xs text-muted-foreground">{t('skills.subtitle')}</p>
      </header>
      {skills.length === 0 && <p className="text-xs text-muted-foreground">{t('skills.none')}</p>}
      <ul className="space-y-2">
        {skills.map((skill) => (
          <li key={skill.name} className="rounded-[10px] border border-border bg-card/60 p-2.5 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="font-medium text-foreground">{skill.name}</span>
              <span className="text-[10px] text-muted-foreground">{t(`skills.scope.${skill.scope === 'project' ? 'project' : 'user'}`)}</span>
            </div>
            {skill.description && <p className="mt-0.5 text-muted-foreground">{skill.description}</p>}
            <div className="mt-1.5 flex flex-wrap gap-1 text-[10.5px]">{renderUsers(skill.name)}</div>
          </li>
        ))}
        {missing.map((name) => (
          <li key={name} className="rounded-[10px] border border-warn/40 bg-warn/5 p-2.5 text-xs">
            <span className="font-medium text-foreground">{name}</span>
            <p className="mt-0.5 text-warn">{t('skills.missing')}</p>
            <div className="mt-1.5 flex flex-wrap gap-1 text-[10.5px]">{renderUsers(name)}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}
