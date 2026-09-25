import type { ReactNode } from 'react';

import { CLOUDCLI_WORDMARK_FONT_FAMILY } from '@/shared/constants';

type AuthScreenLayoutProps = {
  /** One sentence under the wordmark telling the user what this screen is for. */
  intro: string;
  children: ReactNode;
};

/** Wraps the auth module's LoginForm and SetupForm so both full-screen auth pages share one card layout. */
export default function AuthScreenLayout({ intro, children }: AuthScreenLayoutProps) {
  return (
    <div className="relative h-screen overflow-y-auto bg-background">
      {/* Ambient, on-brand backdrop that gives the screen depth without
          competing with the card content. Fixed so it stays put while the
          form scrolls on short viewports. */}
      <div aria-hidden className="pointer-events-none fixed inset-0">
        <div className="absolute -top-40 left-1/2 h-[36rem] w-[36rem] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute -bottom-32 -left-24 h-[26rem] w-[26rem] rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(hsl(var(--foreground)/0.04)_1px,transparent_1px)] opacity-60 [background-size:22px_22px]" />
      </div>

      <div className="relative mx-auto flex min-h-full w-full max-w-md items-center justify-center p-4 py-8">
        <div className="w-full rounded-2xl border border-border/70 bg-card/90 p-8 shadow-[0_24px_60px_-20px_hsl(var(--foreground)/0.18)] ring-1 ring-foreground/5 backdrop-blur-xl sm:p-10">
          <div className="text-center">
            {/* "Open" follows the theme's foreground (black in light mode) so it
                stays readable on the dark card; "Leira" is the fixed brand blue. */}
            <h1
              className="text-4xl font-semibold tracking-tight"
              style={{ fontFamily: CLOUDCLI_WORDMARK_FONT_FAMILY }}
            >
              <span className="text-foreground">Open</span>
              <span className="text-[#2551BD]">Leira</span>
            </h1>
            <p className="mx-auto mt-3 max-w-xs text-sm leading-relaxed text-muted-foreground">{intro}</p>
          </div>

          <div className="mt-8">{children}</div>
        </div>
      </div>
    </div>
  );
}
