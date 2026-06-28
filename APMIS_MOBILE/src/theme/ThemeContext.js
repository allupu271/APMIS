import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { lightColors, darkColors } from './colors';
import { spacing, radius, font, motion } from './tokens';

const STORAGE_KEY = '@apmis/themePref';

const ThemeContext = createContext(null);

// themePref is one of: 'system' | 'light' | 'dark'
export function ThemeProvider({ children }) {
  const systemScheme = useColorScheme();
  const [themePref, setThemePref] = useState('system');
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((v) => { if (v === 'light' || v === 'dark' || v === 'system') setThemePref(v); })
      .finally(() => setHydrated(true));
  }, []);

  const isDark = themePref === 'system' ? systemScheme === 'dark' : themePref === 'dark';

  function setPref(pref) {
    setThemePref(pref);
    AsyncStorage.setItem(STORAGE_KEY, pref).catch(() => {});
  }

  // Tap-to-toggle simply flips between explicit light/dark.
  function toggleTheme() {
    setPref(isDark ? 'light' : 'dark');
  }

  const theme = useMemo(() => {
    const colors = isDark ? darkColors : lightColors;
    return { isDark, colors, spacing, radius, font, motion };
  }, [isDark]);

  const value = useMemo(
    () => ({ theme, isDark, themePref, setThemePref: setPref, toggleTheme, hydrated }),
    [theme, isDark, themePref, hydrated]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
