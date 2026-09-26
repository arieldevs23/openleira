import { useTranslation } from 'react-i18next';

import type { AppTab, Project, ProjectSession } from '@/shared/types';
import MobileMenuButton from '@/modules/project-workspace/MobileMenuButton';
import ModeSwitch from '@/modules/project-workspace/ModeSwitch';
import WorkspaceTitle from '@/modules/project-workspace/WorkspaceTitle';

type WorkspaceHeaderProps = {
  activeTab: AppTab;
  selectedProject: Project | null;
  selectedSession: ProjectSession | null;
  shouldShowTasksTab: boolean;
  isMobile: boolean;
  onMenuClick: () => void;
  onModeChange: (workspaceMode: boolean) => void;
};

/**
 * Rendered by WorkspaceMain: the title of what is on screen on the left and
 * the normal / workspace mode switch on the right. The view tabs live in a
 * rail beside the content instead.
 */
export default function WorkspaceHeader({
  activeTab,
  selectedProject,
  selectedSession,
  shouldShowTasksTab,
  isMobile,
  onMenuClick,
  onModeChange,
}: WorkspaceHeaderProps) {
  const { t } = useTranslation();
  const isWorkspaceMode = activeTab === 'office';

  return (
    <header className="pwa-header-safe flex-shrink-0 border-b border-border/40 bg-transparent px-3 py-1.5 sm:px-4 sm:py-2">
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        {isMobile && !isWorkspaceMode && <MobileMenuButton onMenuClick={onMenuClick} />}
        <div className="flex min-w-0 flex-1 items-center">
          {isWorkspaceMode || !selectedProject ? (
            <h2 className="truncate text-sm font-semibold text-foreground">{t('mode.workspaceTitle')}</h2>
          ) : (
            <WorkspaceTitle
              activeTab={activeTab}
              selectedProject={selectedProject}
              selectedSession={selectedSession}
              shouldShowTasksTab={shouldShowTasksTab}
            />
          )}
        </div>
        <ModeSwitch isWorkspaceMode={isWorkspaceMode} onChange={onModeChange} />
      </div>
    </header>
  );
}
