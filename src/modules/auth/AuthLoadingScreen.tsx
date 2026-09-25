import { useTranslation } from 'react-i18next';

import { CLOUDCLI_WORDMARK_FONT_FAMILY } from '@/shared/constants';
import { cn } from '@/shared/utils';

type AuthLoadingScreenProps = {
  /** Set while the app is already rendered underneath: the splash fades out over it. */
  exiting?: boolean;
};

/** Rendered by the auth module's ProtectedRoute while the initial auth status check is in flight. */
export default function AuthLoadingScreen({ exiting = false }: AuthLoadingScreenProps) {
  const { t } = useTranslation('auth');
  return (
    <div
      className={cn('nebula fixed inset-0 z-[10000] flex items-center justify-center p-4', exiting && 'splash-exit')}
      role="status"
      aria-live="polite"
    >
      <div aria-hidden className="nebula-layers nebula-layers-enter">
        <div className="nebula-layer" />
        <div className="nebula-layer nebula-layer-2" />
      </div>

      <div className="splash-enter relative flex flex-col items-center">
        <img
          src="/logo-256.png"
          alt="OpenLeira"
          className="splash-logo h-20 w-20 rounded-[1.4rem] bg-card shadow-[0_8px_30px_rgba(15,23,42,0.08)] ring-1 ring-border"
        />
        <h1
          className="mt-5 text-xl font-semibold tracking-tight text-foreground"
          style={{ fontFamily: CLOUDCLI_WORDMARK_FONT_FAMILY }}
        >
          OpenLeira
        </h1>
        <p className="sr-only">{t('misc.loadingState')}</p>
      </div>
    </div>
  );
}
