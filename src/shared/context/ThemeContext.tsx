import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import {
  readUserPreference,
  subscribeToUserPreferences,
  writeUserPreference,
} from '@/shared/userSettings';

type ThemeContextValue = {
  isDarkMode: boolean;
  toggleDarkMode: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

/** The stored choice, or null when the user never picked one. */
function readStoredIsDarkMode(): boolean | null {
  const savedTheme = readUserPreference<string | null>('theme', null);
  if (savedTheme === 'dark' || savedTheme === 'light') {
    return savedTheme === 'dark';
  }
  return null;
}

/**
 * Mirrors the anti-flash script in index.html: `data-theme` drives the design
 * tokens in src/index.css and the `.dark` class drives Tailwind `dark:`
 * variants. The status-bar colour is read back from the --bg token.
 */
function applyThemeToDocument(isDarkMode: boolean): void {
  const root = document.documentElement;
  root.setAttribute('data-theme', isDarkMode ? 'dark' : 'light');
  root.classList.toggle('dark', isDarkMode);
  root.style.colorScheme = isDarkMode ? 'dark' : 'light';

  const statusBarMeta = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
  statusBarMeta?.setAttribute('content', isDarkMode ? 'black-translucent' : 'default');

  const backgroundColor = getComputedStyle(root).getPropertyValue('--bg').trim();
  if (backgroundColor) {
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', backgroundColor);
  }
}

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

/** Mounted once by App so every module can read and switch the colour theme through useTheme. */
export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  // Whether the dark mode (the gothic default, DESIGN.md §1) is active. Read
  // synchronously from the preference mirror so the first render matches what
  // the anti-flash script in index.html already painted.
  const [isDarkMode, setIsDarkMode] = useState(() => readStoredIsDarkMode() ?? true);

  // The theme lives in auth.db, so a change made on another device (or in
  // another tab) arrives through the preference store rather than a re-render.
  useEffect(() => subscribeToUserPreferences(() => {
    const storedIsDarkMode = readStoredIsDarkMode();
    if (storedIsDarkMode !== null) {
      setIsDarkMode(storedIsDarkMode);
    }
  }), []);

  // Applying the theme to the document and persisting it are deliberately
  // separate. Persisting from here would also fire on mount — before the stored
  // theme had been fetched — writing this device's default over the theme the
  // user actually chose on another one.
  useEffect(() => {
    applyThemeToDocument(isDarkMode);
  }, [isDarkMode]);

  // The only writer: a theme is stored because the user picked it, never
  // because this device happened to start on one.
  const toggleDarkMode = useCallback(() => {
    setIsDarkMode((previous) => {
      const next = !previous;
      writeUserPreference('theme', next ? 'dark' : 'light');
      return next;
    });
  }, []);

  // A fresh object here would re-render every consumer in the app on any
  // render of this provider, theme change or not.
  const value = useMemo<ThemeContextValue>(
    () => ({ isDarkMode, toggleDarkMode }),
    [isDarkMode, toggleDarkMode],
  );

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
};
