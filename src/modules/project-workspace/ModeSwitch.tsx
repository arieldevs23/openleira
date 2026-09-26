import { Building2, MessageSquare } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Pill, PillBar } from '@/shared/ui';

type ModeSwitchProps = {
  isWorkspaceMode: boolean;
  onChange: (workspaceMode: boolean) => void;
};

/**
 * The switch between normal mode (chat, shell, files of one project) and
 * workspace mode (AI teams across app folders). Rendered in the top-right of
 * the project-workspace header, where the view tabs used to sit.
 */
export default function ModeSwitch({ isWorkspaceMode, onChange }: ModeSwitchProps) {
  const { t } = useTranslation();
  const modes = [
    { id: 'normal', workspace: false, label: t('mode.normal'), icon: MessageSquare },
    { id: 'workspace', workspace: true, label: t('mode.workspace'), icon: Building2 },
  ] as const;

  return (
    <PillBar
      role="radiogroup"
      aria-label={t('mode.label')}
      className="min-w-max border border-border/40 bg-muted/50 shadow-inner"
    >
      {modes.map((mode) => {
        const isActive = mode.workspace === isWorkspaceMode;
        return (
          <Pill
            key={mode.id}
            role="radio"
            aria-checked={isActive}
            isActive={isActive}
            onClick={() => onChange(mode.workspace)}
            className="h-8 px-3 py-[5px]"
            data-testid={`mode-${mode.id}`}
          >
            <mode.icon className="h-3.5 w-3.5 shrink-0" strokeWidth={isActive ? 2.2 : 1.8} />
            <span>{mode.label}</span>
          </Pill>
        );
      })}
    </PillBar>
  );
}
