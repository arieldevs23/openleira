import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { RoseMark, RoseWindowOrnament } from '@/shared/ui';

type AuthScreenLayoutProps = {
  title: string;
  description: string;
  children: ReactNode;
  footerText: string;
  logo?: ReactNode;
};

/** Wraps the auth module's LoginForm and SetupForm so both full-screen auth pages share one card layout. */
export default function AuthScreenLayout({
  title,
  description,
  children,
  footerText,
  logo,
}: AuthScreenLayoutProps) {
  const { t } = useTranslation('auth');
  return (
    <div className="relative h-screen overflow-y-auto bg-background">
      {/* Gothic backdrop (DESIGN.md §5): the login and setup screens are where
          the cathedral rose window is allowed. Fixed so it stays put while the
          form scrolls on short viewports; it never catches pointer events. */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 overflow-hidden">
        <RoseWindowOrnament className="left-1/2 top-1/2 h-[min(56rem,160vw)] w-[min(56rem,160vw)] -translate-x-1/2 -translate-y-1/2" />
      </div>

      <div className="relative mx-auto flex min-h-full w-full max-w-md items-center justify-center p-4 py-8">
        <div className="w-full rounded-2xl border border-border bg-card p-8 sm:p-10">
          <div className="text-center">
            <div className="mb-5 flex justify-center">
              {logo ?? (
                <div className="relative flex h-16 w-16 items-center justify-center">
                  <div aria-hidden="true" className="gothic-glow absolute -inset-6 rounded-full" />
                  <RoseMark size={64} className="relative" />
                </div>
              )}
            </div>
            <h1 className="display-title text-2xl text-foreground">{title}</h1>
            <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-muted-foreground">{description}</p>
          </div>

          <div className="mt-8">{children}</div>

          <div className="mt-6 border-t border-border pt-5 text-center">
            <p className="text-xs leading-relaxed text-muted-foreground">{footerText}</p>
          </div>

        </div>
      </div>
    </div>
  );
}
