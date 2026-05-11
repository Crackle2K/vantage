/**
 * @fileoverview Theme context provider and hook. Theme switching is kept in
 * the public API, but the app is currently pinned to light mode.
 */

import { createContext, useContext, useEffect, useMemo, useState } from 'react';

type Theme = 'light' | 'dark';

interface ThemeContextValue {
  theme: Theme;
  isDark: boolean;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const STORAGE_KEY = 'vantage-theme';

function applyTheme(theme: Theme) {
  document.documentElement.classList.remove('dark');
  document.documentElement.style.colorScheme = theme;
}

function getInitialTheme(): Theme {
  return 'light';
}

/**
 * Provides theme state to the component tree. Syncs a light-only value to
 * localStorage and ensures the document root has no `.dark` class.
 *
 * @param {React.ReactNode} children - Child components that need theme access.
 * @returns {JSX.Element} The theme context provider wrapping children.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => getInitialTheme());

  useEffect(() => {
    applyTheme(theme);
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const setTheme = () => {
    setThemeState('light');
  };

  const toggleTheme = () => {
    setThemeState('light');
  };

  const contextValue = useMemo(
    () => ({
      theme,
      isDark: theme === 'dark',
      setTheme,
      toggleTheme,
    }),
    [theme]
  );

  return <ThemeContext.Provider value={contextValue}>{children}</ThemeContext.Provider>;
}

/**
 * Hook to access the theme context. Must be used within a ThemeProvider.
 *
 * @returns {ThemeContextValue} The current theme, toggle, and setter.
 * @throws {Error} If used outside a ThemeProvider.
 */
export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
