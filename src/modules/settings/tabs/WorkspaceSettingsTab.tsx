import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import SettingsCard from '@/modules/settings/SettingsCard';
import SettingsRow from '@/modules/settings/SettingsRow';
import SettingsSection from '@/modules/settings/SettingsSection';
import {
  OBROLAN_WORKSPACE_PATH,
  OFFICE_CHAT_DOCK_STORAGE_KEY,
  OFFICE_COLLAPSED_PANELS_STORAGE_KEY,
} from '@/shared/constants';
import type { SettingsMainTab } from '@/shared/types';

type DockMode = 'collapsed' | 'expanded' | 'hidden';

const readDockMode = (): DockMode => {
  try {
    const stored = window.localStorage.getItem(OFFICE_CHAT_DOCK_STORAGE_KEY);
    return stored === 'hidden' || stored === 'expanded' ? stored : 'collapsed';
  } catch {
    return 'collapsed';
  }
};

const SHORTCUTS = ['select', 'shapes', 'marquee', 'shiftClick', 'selectAll', 'delete', 'arrowEnd', 'copySkill', 'zoom', 'escape'] as const;

type WorkspaceSettingsTabProps = {
  /** Opens another settings tab (the Git tab holds the GitHub tokens). */
  onOpenTab: (tab: SettingsMainTab) => void;
};

/**
 * Rendered by Settings for the "Node Design" tab: how projects, free chat and
 * the workspace canvas fit together, the canvas layout choices (the same
 * browser-stored values the canvas page uses), git access for workspaces,
 * what happens when a task fails, and the canvas shortcuts.
 */
export default function WorkspaceSettingsTab({ onOpenTab }: WorkspaceSettingsTabProps) {
  const { t } = useTranslation('settings');
  // Where the coordinator chat sits over the canvas when a workspace opens.
  const [dockMode, setDockMode] = useState<DockMode>(readDockMode);
  // Brief confirmation after the side panels were reset.
  const [panelsReset, setPanelsReset] = useState(false);

  const changeDockMode = (mode: DockMode) => {
    setDockMode(mode);
    try {
      window.localStorage.setItem(OFFICE_CHAT_DOCK_STORAGE_KEY, mode);
    } catch {
      // Not remembered in private windows.
    }
  };

  const resetPanels = () => {
    try {
      window.localStorage.removeItem(OFFICE_COLLAPSED_PANELS_STORAGE_KEY);
    } catch {
      // Nothing stored to reset.
    }
    setPanelsReset(true);
    window.setTimeout(() => setPanelsReset(false), 1500);
  };

  return (
    <div className="space-y-6 md:space-y-8" data-testid="settings-workspace-tab">
      <SettingsSection title={t('workspace.modelTitle')} description={t('workspace.modelBody')}>
        <SettingsCard divided>
          <SettingsRow label={t('workspace.projectsLabel')} description={t('workspace.projectsBody')}>
            <span className="shrink-0 rounded-md border border-border px-2 py-0.5 text-xs text-muted-foreground">{t('workspace.canvasOnly')}</span>
          </SettingsRow>
          <SettingsRow label={t('workspace.freeChatLabel')} description={t('workspace.freeChatBody')}>
            <code className="max-w-[45%] shrink-0 truncate rounded-md bg-muted px-2 py-0.5 text-xs text-foreground" title={OBROLAN_WORKSPACE_PATH}>
              {OBROLAN_WORKSPACE_PATH}
            </code>
          </SettingsRow>
          <SettingsRow label={t('workspace.lockLabel')} description={t('workspace.lockBody')}>
            <span className="shrink-0 text-xs text-muted-foreground">{t('workspace.automatic')}</span>
          </SettingsRow>
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title={t('workspace.canvasTitle')}>
        <SettingsCard divided>
          <SettingsRow label={t('workspace.dockLabel')} description={t('workspace.dockBody')}>
            <select
              value={dockMode}
              onChange={(event) => changeDockMode(event.target.value as DockMode)}
              className="h-9 shrink-0 rounded-md border border-input bg-background px-2 text-sm text-foreground"
              aria-label={t('workspace.dockLabel')}
            >
              <option value="collapsed">{t('workspace.dock.collapsed')}</option>
              <option value="expanded">{t('workspace.dock.expanded')}</option>
              <option value="hidden">{t('workspace.dock.hidden')}</option>
            </select>
          </SettingsRow>
          <SettingsRow label={t('workspace.panelsLabel')} description={t('workspace.panelsBody')}>
            <button type="button" onClick={resetPanels} className="h-9 shrink-0 rounded-md border border-border px-3 text-sm text-foreground hover:bg-muted">
              {panelsReset ? t('workspace.panelsDone') : t('workspace.panelsReset')}
            </button>
          </SettingsRow>
          <SettingsRow label={t('workspace.flowLabel')} description={t('workspace.flowBody')}>
            <span className="shrink-0 text-xs text-muted-foreground">{t('workspace.automatic')}</span>
          </SettingsRow>
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title={t('workspace.gitTitle')} description={t('workspace.gitBody')}>
        <SettingsCard divided>
          <SettingsRow label={t('workspace.tokensLabel')} description={t('workspace.tokensBody')}>
            <button type="button" onClick={() => onOpenTab('git')} className="h-9 shrink-0 rounded-md border border-border px-3 text-sm text-foreground hover:bg-muted">
              {t('workspace.openGit')}
            </button>
          </SettingsRow>
          <SettingsRow label={t('workspace.sshLabel')} description={t('workspace.sshBody')}>
            <code className="shrink-0 rounded-md bg-muted px-2 py-0.5 text-xs text-foreground">~/.ssh</code>
          </SettingsRow>
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title={t('workspace.failTitle')}>
        <SettingsCard divided>
          <SettingsRow label={t('workspace.limitLabel')} description={t('workspace.limitBody')}>
            <span className="shrink-0 text-xs text-muted-foreground">{t('workspace.automatic')}</span>
          </SettingsRow>
          <SettingsRow label={t('workspace.retryLabel')} description={t('workspace.retryBody')}>
            <span className="shrink-0 text-xs text-muted-foreground">{t('workspace.manual')}</span>
          </SettingsRow>
          <SettingsRow label={t('workspace.quickLabel')} description={t('workspace.quickBody')}>
            <span className="shrink-0 text-xs text-muted-foreground">{t('workspace.manual')}</span>
          </SettingsRow>
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title={t('workspace.shortcutsTitle')}>
        <SettingsCard divided>
          {SHORTCUTS.map((shortcut) => (
            <div key={shortcut} className="flex items-center justify-between gap-4 px-4 py-2.5">
              <span className="text-sm text-foreground">{t(`workspace.shortcuts.${shortcut}.action`)}</span>
              <kbd className="shrink-0 rounded-md border border-border bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground">
                {t(`workspace.shortcuts.${shortcut}.keys`)}
              </kbd>
            </div>
          ))}
        </SettingsCard>
      </SettingsSection>
    </div>
  );
}
