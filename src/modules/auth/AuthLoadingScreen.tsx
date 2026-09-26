import { useTranslation } from 'react-i18next';

import { RoseMark, RoseWindowOrnament } from '@/shared/ui';
import { cn } from '@/shared/utils';

type AuthLoadingScreenProps = {
  /** Set while the app is already rendered underneath: the splash fades out over it. */
  exiting?: boolean;
};

/**
 * Rendered by the auth module's ProtectedRoute while the initial auth status
 * check is in flight. The splash is one of the few places the gothic ornament
 * is allowed (DESIGN.md §5): the slowly turning rose window behind the rose
 * mark and a Cinzel title.
 */
export default function AuthLoadingScreen({ exiting = false }: AuthLoadingScreenProps) {
  const { t } = useTranslation('auth');
  return (
    <div
      className={cn(
        'fixed inset-0 z-[10000] flex items-center justify-center overflow-hidden bg-background p-4',
        exiting && 'splash-exit',
      )}
      role="status"
      aria-live="polite"
    >
      <RoseWindowOrnament className="left-1/2 top-1/2 h-[min(46rem,140vw)] w-[min(46rem,140vw)] -translate-x-1/2 -translate-y-1/2" />

      <div className="splash-enter relative flex flex-col items-center">
        <div aria-hidden="true" className="gothic-glow absolute -inset-10 rounded-full" />
        <RoseMark size={96} alt="" className="relative" />
        <h1 className="display-title relative mt-5 text-xl text-foreground">OpenLeira</h1>
        <p className="sr-only">{t('misc.loadingState')}</p>
      </div>
    </div>
  );
}
