/** Theme provider: system / light / dark, persisted with the rest of the settings. */
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { darkPalette, layout, lightPalette, radius, spacing, typography, type Palette } from './tokens';
import { useSettingsStore } from '../state/settings-store';

export interface Theme {
  readonly colors: Palette;
  readonly spacing: typeof spacing;
  readonly radius: typeof radius;
  readonly typography: typeof typography;
  readonly layout: typeof layout;
  readonly isDark: boolean;
}

const ThemeContext = createContext<Theme | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const systemScheme = useColorScheme();
  const preference = useSettingsStore((state) => state.theme);

  const theme = useMemo<Theme>(() => {
    const isDark = preference === 'system' ? systemScheme !== 'light' : preference === 'dark';
    return {
      colors: isDark ? darkPalette : lightPalette,
      spacing,
      radius,
      typography,
      layout,
      isDark,
    };
  }, [preference, systemScheme]);

  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const theme = useContext(ThemeContext);
  if (theme === null) throw new Error('useTheme must be used inside <ThemeProvider>');
  return theme;
}

export * from './tokens';
