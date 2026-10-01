import {
  CalendarClock,
  FolderTree,
  GitBranch,
  ListOrdered,
  MessagesSquare,
  Mic,
  Plug,
  TerminalSquare,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { APP_RELEASE_NAME } from '@/shared/constants';
import { BrandWordmark, RoseMark } from '@/shared/ui';
import { useVersionCheck } from '@/shared/hooks/useVersionCheck';

const FEATURES: { key: string; icon: LucideIcon }[] = [
  { key: 'chat', icon: MessagesSquare },
  { key: 'queue', icon: ListOrdered },
  { key: 'schedule', icon: CalendarClock },
  { key: 'files', icon: FolderTree },
  { key: 'git', icon: GitBranch },
  { key: 'shell', icon: TerminalSquare },
  { key: 'extensions', icon: Plug },
  { key: 'voice', icon: Mic },
];

const FOUNDER_NAME = 'Ariel Fauzan';

/** Rendered by Settings for the "about" tab: app identity, features, founder and license. */
export default function AboutTab() {
  const { t } = useTranslation('settings');
  const { currentVersion } = useVersionCheck();

  return (
    <div className="space-y-5">
      <header className="flex flex-col items-center pt-1 text-center">
        <RoseMark size={64} alt="" />
        <h2 className="mt-3 text-2xl" aria-label="OpenLeira">
          <BrandWordmark />
        </h2>
        <span className="mt-1.5 rounded bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
          {APP_RELEASE_NAME ? `${APP_RELEASE_NAME} · ` : ''}
          {t('about.version', { version: currentVersion, defaultValue: 'Version {{version}}' })}
        </span>
        <p className="mt-2 max-w-md text-xs leading-relaxed text-muted-foreground">
          {t('about.tagline')}
        </p>
      </header>

      <section>
        <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {t('about.featuresTitle', { defaultValue: 'Features' })}
        </h3>
        <div className="grid grid-cols-2 gap-1.5">
          {FEATURES.map(({ key, icon: Icon }) => (
            <div key={key} className="glass-surface flex items-center gap-2 rounded-lg px-2.5 py-2">
              <Icon className="h-3.5 w-3.5 shrink-0 text-primary" />
              <p className="truncate text-xs font-medium text-foreground">{t(`about.features.${key}`)}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col items-center py-1 text-center">
        <span className="h-px w-10 bg-border" aria-hidden />
        <p className="chapter-label mt-4">
          {t('about.founderRole', { defaultValue: 'CEO & Founder' })}
        </p>
        <p className="mt-1 font-serif text-xl text-foreground">
          {FOUNDER_NAME}
        </p>
      </section>

      <footer className="border-t border-border pt-3 text-center">
        <p className="text-[11px] text-muted-foreground">
          © {new Date().getFullYear()} OpenLeira · {FOUNDER_NAME}
        </p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">{t('about.licensed')}</p>
      </footer>
    </div>
  );
}
