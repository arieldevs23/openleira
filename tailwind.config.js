/**
 * Maps a design token (a full CSS colour in src/index.css) onto a Tailwind
 * colour that still supports opacity modifiers such as `bg-card/90`.
 */
const token = (name) => `color-mix(in srgb, var(--${name}) calc(<alpha-value> * 100%), transparent)`;

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      // Font roles from docs/DESIGN.md §3. `font-serif` is Playfair Display and
      // is reserved for the wordmark and page/modal titles; `font-display` is
      // Cinzel for login/setup/splash/empty-state titles only. Everything
      // functional stays on `font-sans` (Inter).
      fontFamily: {
        sans: ['var(--font-sans)'],
        serif: ['var(--font-serif)'],
        display: ['var(--font-display)'],
        mono: ['var(--font-mono)'],
      },
      // The existing semantic colour names resolve to the gothic design tokens
      // defined once in src/index.css (dark on :root, light on
      // [data-theme="light"]). No palette lives here: every entry is a token.
      colors: {
        border: {
          DEFAULT: token('border'),
          strong: token('border-strong'),
        },
        input: token('border'),
        ring: token('accent'),
        background: token('bg'),
        foreground: {
          DEFAULT: token('text'),
          dim: token('text-dim'),
        },
        surface: {
          DEFAULT: token('surface'),
          2: token('surface-2'),
          3: token('surface-3'),
        },
        primary: {
          DEFAULT: token('accent'),
          foreground: token('on-accent'),
        },
        secondary: {
          DEFAULT: token('surface-2'),
          foreground: token('text'),
        },
        destructive: {
          DEFAULT: token('err'),
          foreground: token('on-status'),
        },
        muted: {
          DEFAULT: token('surface-2'),
          foreground: token('muted'),
        },
        accent: {
          DEFAULT: token('accent-dim'),
          foreground: token('text'),
        },
        popover: {
          DEFAULT: token('surface'),
          foreground: token('text'),
        },
        card: {
          DEFAULT: token('surface'),
          foreground: token('text'),
        },
        navy: token('text-dim'),
        // Status tokens (§2). Pair every use with a shape or text.
        ok: token('ok'),
        run: token('run'),
        warn: token('warn'),
        err: token('err'),
        info: token('info'),
        'on-status': token('on-status'),
      },
      letterSpacing: {
        heading: "-0.01em",
      },
      borderRadius: {
        // §4: --radius-s 4px (badge, chip), --radius 6px (button, input, card),
        // --radius-l 10px (modal, floating panel). No full pills except round
        // status indicators, which keep rounded-full.
        '3xl': "var(--radius-l)",
        '2xl': "var(--radius-l)",
        xl: "var(--radius-l)",
        pill: "9999px",
        lg: "var(--radius)",
        md: "var(--radius)",
        DEFAULT: "var(--radius-s)",
        sm: "var(--radius-s)",
      },
      transitionTimingFunction: {
        DEFAULT: "var(--ease)",
        out: "var(--ease)",
        'in-out': "var(--ease)",
      },
      boxShadow: {
        // §4: only floating layers carry a shadow; cards rely on borders.
        sm: "none",
        DEFAULT: "none",
        md: "var(--shadow-float)",
        lg: "var(--shadow-float)",
        xl: "var(--shadow-float)",
        '2xl': "var(--shadow-float)",
      },
      spacing: {
        'safe-area-inset-bottom': 'env(safe-area-inset-bottom)',
        'mobile-nav': 'var(--mobile-nav-total)',
      },
      keyframes: {
        shimmer: {
          '0%': { backgroundPosition: '200% 0' },
          '100%': { backgroundPosition: '-200% 0' },
        },
        'dialog-overlay-show': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'dialog-content-show': {
          from: { opacity: '0', transform: 'translate(-50%, -50%) scale(0.98)' },
          to: { opacity: '1', transform: 'translate(-50%, -50%) scale(1)' },
        },
        'bottom-sheet-content-show': {
          from: { opacity: '0', transform: 'translateY(100%)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        shimmer: 'shimmer 2s linear infinite',
        'dialog-overlay-show': 'dialog-overlay-show 200ms var(--ease)',
        'dialog-content-show': 'dialog-content-show 200ms var(--ease)',
        'bottom-sheet-content-show': 'bottom-sheet-content-show 220ms var(--ease)',
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
}
