import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useColorScheme } from 'react-native';
import { getAppSetting, setAppSetting } from '@/db/repositories/appSettings';
import {
  darkColors,
  lightColors,
  type ThemeColors,
} from '@/constants/palettes';

const KEY_DARK = 'koomind_dark_mode';

type ThemeContextValue = {
  colors: ThemeColors;
  isDark: boolean;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue>({
  colors: lightColors,
  isDark: false,
  toggleTheme: () => {},
});

export function useColors(): ThemeColors {
  return useContext(ThemeContext).colors;
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [isDark, setIsDark] = useState(system === 'dark');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const saved = await getAppSetting(KEY_DARK);
        if (saved === '1') setIsDark(true);
        else if (saved === '0') setIsDark(false);
      } catch {
        // Banco ainda não pronto — mantém tema do sistema
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  const toggleTheme = useCallback(() => {
    setIsDark((prev) => {
      const next = !prev;
      void setAppSetting(KEY_DARK, next ? '1' : '0');
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({
      colors: isDark ? darkColors : lightColors,
      isDark,
      toggleTheme,
    }),
    [isDark, toggleTheme]
  );

  if (!loaded) {
    return (
      <ThemeContext.Provider
        value={{
          colors: lightColors,
          isDark: false,
          toggleTheme,
        }}
      >
        {children}
      </ThemeContext.Provider>
    );
  }

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}
