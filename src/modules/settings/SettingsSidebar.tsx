import { Bell, Bot, ChevronRight, GitBranch, Info, Key, ListChecks, Mic, MonitorPlay, Palette, Puzzle } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/shared/utils';
import type { SettingsMainTab } from '@/shared/types';

type SettingsSidebarProps = {
  activeTab: SettingsMainTab;
  onChange: (tab: SettingsMainTab) => void;
};

type NavGroup = 'general' | 'agents' | 'info';

type NavItem = {
  id: SettingsMainTab;
  labelKey: string;
  icon: typeof Bot;
  /** Section the item sits in on the mobile grouped list. */
  group: NavGroup;
};

const NAV_ITEMS: NavItem[] = [
  { id: 'agents', labelKey: 'mainTabs.agents', icon: Bot, group: 'agents' },
  { id: 'appearance', labelKey: 'mainTabs.appearance', icon: Palette, group: 'general' },
  { id: 'git', labelKey: 'mainTabs.git', icon: GitBranch, group: 'agents' },
  { id: 'api', labelKey: 'mainTabs.apiTokens', icon: Key, group: 'agents' },
  { id: 'voice', labelKey: 'mainTabs.voice', icon: Mic, group: 'general' },
  { id: 'tasks', labelKey: 'mainTabs.tasks', icon: ListChecks, group: 'agents' },
  { id: 'browser', labelKey: 'mainTabs.browser', icon: MonitorPlay, group: 'agents' },
  { id: 'plugins', labelKey: 'mainTabs.plugins', icon: Puzzle, group: 'agents' },
  { id: 'notifications', labelKey: 'mainTabs.notifications', icon: Bell, group: 'general' },
  { id: 'about', labelKey: 'mainTabs.about', icon: Info, group: 'info' },
];

/** Desktop-only: on mobile, Settings shows SettingsMobileMenu as its own screen instead. */
export default function SettingsSidebar({ activeTab, onChange }: SettingsSidebarProps) {
  const { t } = useTranslation('settings');

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden w-56 flex-shrink-0 border-r border-border bg-muted/30 md:flex md:flex-col">
        <nav className="flex flex-col gap-1 p-3">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;

            return (
              <button
                key={item.id}
                onClick={() => onChange(item.id)}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors duration-150',
                  isActive
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground active:bg-accent/50',
                )}
              >
                <Icon className="h-4 w-4 flex-shrink-0" />
                {t(item.labelKey)}
              </button>
            );
          })}
        </nav>
      </aside>

    </>
  );
}

const GROUP_ORDER: NavGroup[] = ['general', 'agents', 'info'];

/**
 * Rendered by Settings on mobile as the settings home screen: an inset
 * grouped list (ChatGPT/iOS style) where each row opens its section as a
 * pushed screen.
 */
export function SettingsMobileMenu({ onSelect }: { onSelect: (tab: SettingsMainTab) => void }) {
  const { t } = useTranslation('settings');

  return (
    <nav className="flex-1 space-y-6 overflow-y-auto px-4 pb-8 pt-2 md:hidden">
      {GROUP_ORDER.map((group) => (
        <section key={group}>
          <h3 className="mb-1.5 px-4 text-[13px] font-medium text-muted-foreground">
            {t(`mobileGroups.${group}`)}
          </h3>
          <div className="overflow-hidden rounded-2xl bg-muted/50">
            {NAV_ITEMS.filter((item) => item.group === group).map((item, index) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelect(item.id)}
                  className="flex w-full touch-manipulation items-center gap-3.5 px-4 text-left transition-colors active:bg-accent"
                >
                  <Icon className="h-[18px] w-[18px] shrink-0 text-foreground/80" />
                  <span
                    className={cn(
                      'flex min-h-[3.25rem] flex-1 items-center justify-between gap-2 py-3 text-[15px] text-foreground',
                      index > 0 && 'border-t border-border/60',
                    )}
                  >
                    {t(item.labelKey)}
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/60" />
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </nav>
  );
}

/** Label key of one settings section, for the mobile pushed screen's title. */
export function getSettingsTabLabelKey(tab: SettingsMainTab): string {
  return NAV_ITEMS.find((item) => item.id === tab)?.labelKey ?? 'title';
}
