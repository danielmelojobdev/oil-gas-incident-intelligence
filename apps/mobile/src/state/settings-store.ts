/**
 * Client-owned settings (Zustand).
 *
 * Only state the client genuinely owns lives here: theme, search defaults, keyword
 * lists and notification preferences. Everything that came from the server is owned by
 * TanStack Query (decision D13).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import {
  DEFAULT_LANGUAGES,
  DEFAULT_PERIOD,
  DEFAULT_REGIONS,
  notificationPreferencesSchema,
  userPreferencesSchema,
  type DateAxis,
  type LanguageCode,
  type NotificationPreferences,
  type Region,
  type SearchPeriod,
  type UserPreferences,
} from '@ogii/domain';

const STORAGE_KEY = 'ogii.settings.v1';

export interface SettingsState extends UserPreferences {
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setTheme: (theme: UserPreferences['theme']) => void;
  setDefaultPeriod: (period: SearchPeriod) => void;
  setDateAxis: (axis: DateAxis) => void;
  toggleRegion: (region: Region) => void;
  toggleLanguage: (language: LanguageCode) => void;
  addKeyword: (term: string) => void;
  removeKeyword: (term: string) => void;
  addExcludedKeyword: (term: string) => void;
  removeExcludedKeyword: (term: string) => void;
  setNotifications: (patch: Partial<NotificationPreferences>) => void;
  setRetentionDays: (days: number) => void;
  resetAll: () => Promise<void>;
}

const defaults: UserPreferences = userPreferencesSchema.parse({
  theme: 'system',
  defaultPeriod: DEFAULT_PERIOD,
  regions: [...DEFAULT_REGIONS],
  languages: [...DEFAULT_LANGUAGES],
  notifications: notificationPreferencesSchema.parse({}),
});

function persist(state: SettingsState): void {
  const snapshot = userPreferencesSchema.parse({
    theme: state.theme,
    defaultPeriod: state.defaultPeriod,
    defaultDateAxis: state.defaultDateAxis,
    regions: state.regions,
    customCountries: state.customCountries,
    languages: state.languages,
    includeKeywords: state.includeKeywords,
    excludeKeywords: state.excludeKeywords,
    notifications: state.notifications,
    dataRetentionDays: state.dataRetentionDays,
  });
  void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot)).catch(() => undefined);
}

function toggle<T>(list: readonly T[], value: T, atLeastOne: boolean): T[] {
  const next = list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
  return atLeastOne && next.length === 0 ? [...list] : next;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  ...defaults,
  hydrated: false,

  hydrate: async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw !== null) {
        const parsed = userPreferencesSchema.safeParse(JSON.parse(raw));
        if (parsed.success) set({ ...parsed.data, hydrated: true });
        else set({ hydrated: true });
        return;
      }
    } catch {
      // Corrupt or unavailable storage falls back to defaults.
    }
    set({ hydrated: true });
  },

  setTheme: (theme) => {
    set({ theme });
    persist(get());
  },
  setDefaultPeriod: (defaultPeriod) => {
    set({ defaultPeriod });
    persist(get());
  },
  setDateAxis: (defaultDateAxis) => {
    set({ defaultDateAxis });
    persist(get());
  },
  toggleRegion: (region) => {
    set({ regions: toggle(get().regions, region, true) });
    persist(get());
  },
  toggleLanguage: (language) => {
    set({ languages: toggle(get().languages, language, true) as LanguageCode[] });
    persist(get());
  },
  addKeyword: (term) => {
    const value = term.trim();
    if (value === '' || get().includeKeywords.includes(value)) return;
    set({ includeKeywords: [...get().includeKeywords, value] });
    persist(get());
  },
  removeKeyword: (term) => {
    set({ includeKeywords: get().includeKeywords.filter((item) => item !== term) });
    persist(get());
  },
  addExcludedKeyword: (term) => {
    const value = term.trim();
    if (value === '' || get().excludeKeywords.includes(value)) return;
    set({ excludeKeywords: [...get().excludeKeywords, value] });
    persist(get());
  },
  removeExcludedKeyword: (term) => {
    set({ excludeKeywords: get().excludeKeywords.filter((item) => item !== term) });
    persist(get());
  },
  setNotifications: (patch) => {
    set({ notifications: notificationPreferencesSchema.parse({ ...get().notifications, ...patch }) });
    persist(get());
  },
  setRetentionDays: (dataRetentionDays) => {
    set({ dataRetentionDays });
    persist(get());
  },
  resetAll: async () => {
    set({ ...defaults, hydrated: true });
    await AsyncStorage.removeItem(STORAGE_KEY).catch(() => undefined);
  },
}));
