import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

type Theme = 'dark' | 'light';

type ThemeContextValue = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
};

const THEME_STORAGE_KEY = 'theme';
const DEFAULT_THEME: Theme = 'dark';

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const isTheme = (value: string | null): value is Theme => value === 'dark' || value === 'light';

const getStoredTheme = (): Theme => {
  if (typeof window === 'undefined') return DEFAULT_THEME;
  const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
  return isTheme(storedTheme) ? storedTheme : DEFAULT_THEME;
};

const applyTheme = (theme: Theme) => {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = theme;
};

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, updateTheme] = useState<Theme>(getStoredTheme);

  useEffect(() => {
    applyTheme(theme);
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  const setTheme = useCallback((nextTheme: Theme) => {
    updateTheme(nextTheme);
  }, []);

  const toggleTheme = useCallback(() => {
    updateTheme((currentTheme) => currentTheme === 'dark' ? 'light' : 'dark');
  }, []);

  const value = useMemo(() => ({ theme, setTheme, toggleTheme }), [theme, setTheme, toggleTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme debe usarse dentro de ThemeProvider');
  return value;
}
