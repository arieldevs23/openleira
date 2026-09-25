import { Settings, ArrowUpCircle, AlertTriangle, FolderOpen, Loader2 } from 'lucide-react';
import type { TFunction } from 'i18next';

import { IS_PLATFORM } from '@/shared/utils';
import type { ReleaseInfo } from '@/shared/types';

type SidebarFooterProps = {
  updateAvailable: boolean;
  restartRequired: boolean;
  releaseInfo: ReleaseInfo | null;
  latestVersion: string | null;
  currentVersion: string;
  onShowVersionModal: () => void;
  onShowSettings: () => void;
  /** Opens the home-directory file browser in the main panel. */
  onOpenFiles: () => void;
  isOpeningFiles: boolean;
  t: TFunction;
};

/** Rendered by SidebarContent at the bottom of the panel for the home file browser, settings, and update status. */
export default function SidebarFooter({
  updateAvailable,
  restartRequired,
  releaseInfo,
  latestVersion,
  currentVersion,
  onShowVersionModal,
  onShowSettings,
  onOpenFiles,
  isOpeningFiles,
  t,
}: SidebarFooterProps) {
  return (
    <div className="flex-shrink-0" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0)' }}>
      {/* Restart-required banner: the running server version differs from the
          installed/frontend version (updated but not restarted). */}
      {restartRequired && (
        <>
          <div className="nav-divider" />
          <div className="px-2 py-1.5 md:px-2 md:py-1.5">
            <div className="flex items-center gap-2.5 rounded-lg px-2.5 py-2">
              <AlertTriangle className="h-4 w-4 flex-shrink-0 text-warn" />
              <span className="min-w-0 flex-1 text-xs font-medium text-warn">
                {t('version.restartRequired')}
              </span>
            </div>
          </div>
        </>
      )}

      {/* Update banner */}
      {updateAvailable && (
        <>
          <div className="nav-divider" />
          {/* Desktop update */}
          <div className="hidden px-2 py-1.5 md:block">
            <button
              className="group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-accent"
              onClick={onShowVersionModal}
            >
              <div className="relative flex-shrink-0">
                <ArrowUpCircle className="h-4 w-4 text-primary" />
                <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <span className="block truncate text-sm font-normal text-foreground">
                  {releaseInfo?.title || `v${latestVersion}`}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {t('version.updateAvailable')}
                </span>
              </div>
            </button>
          </div>

          {/* Mobile update */}
          <div className="px-3 py-2 md:hidden">
            <button
              className="flex h-11 w-full items-center gap-3 rounded-lg px-3.5 transition-colors active:bg-muted"
              onClick={onShowVersionModal}
            >
              <div className="relative flex-shrink-0">
                <ArrowUpCircle className="h-4 w-4 text-primary" />
                <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
              </div>
              <div className="min-w-0 flex-1 text-left">
                <span className="block truncate text-sm font-normal text-foreground">
                  {releaseInfo?.title || `v${latestVersion}`}
                </span>
                <span className="text-xs text-muted-foreground">
                  {t('version.updateAvailable')}
                </span>
              </div>
            </button>
          </div>
        </>
      )}

      {/* Settings */}
      <div className="nav-divider" />

      {/* Desktop files + settings */}
      <div className="hidden space-y-0.5 px-2 py-1.5 md:block">
        <button
          className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-60"
          onClick={onOpenFiles}
          disabled={isOpeningFiles}
          title={isOpeningFiles ? t('files.opening') : undefined}
        >
          {isOpeningFiles ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FolderOpen className="h-3.5 w-3.5" />}
          <span className="text-sm">{t('files.open')}</span>
        </button>
        <button
          className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          onClick={onShowSettings}
        >
          <Settings className="h-3.5 w-3.5" />
          <span className="text-sm">{t('actions.settings')}</span>
        </button>
      </div>

      {/* Desktop version brand line (OSS mode only) */}
      {!IS_PLATFORM && (
        <div className="hidden px-3 py-2 text-center md:block">
          <span className="text-[10px] text-muted-foreground/40">
            OpenLeira v{currentVersion}
          </span>
        </div>
      )}

      {/* Mobile files + settings */}
      <div className="space-y-1 px-3 pb-3 pt-2 md:hidden">
        <button
          className="flex h-10 w-full items-center gap-3 rounded-lg px-3.5 transition-colors active:bg-muted disabled:opacity-60"
          onClick={onOpenFiles}
          disabled={isOpeningFiles}
        >
          <div className="flex h-7 w-7 items-center justify-center">
            {isOpeningFiles
              ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              : <FolderOpen className="h-4 w-4 text-muted-foreground" />}
          </div>
          <span className="text-sm font-normal text-foreground">{t('files.open')}</span>
        </button>
        <button
          className="flex h-10 w-full items-center gap-3 rounded-lg px-3.5 transition-colors active:bg-muted"
          onClick={onShowSettings}
        >
          <div className="flex h-7 w-7 items-center justify-center">
            <Settings className="h-4 w-4 text-muted-foreground" />
          </div>
          <span className="text-sm font-normal text-foreground">{t('actions.settings')}</span>
        </button>
      </div>
    </div>
  );
}
