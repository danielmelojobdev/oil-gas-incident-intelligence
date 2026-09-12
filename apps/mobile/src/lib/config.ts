/**
 * App configuration.
 *
 * IMPORTANT: every variable must be read as a STATIC property expression
 * (`process.env.EXPO_PUBLIC_FOO`). Metro inlines these at build time by textual
 * substitution; a dynamic lookup such as `process.env[key]` is NOT replaced and
 * silently evaluates to `undefined` in the bundle.
 *
 * Only EXPO_PUBLIC_* values exist here, and by construction they are public: the app
 * never holds a service-role key, an AI key or a news API key (security model, §12).
 */
export type DataMode = 'mock' | 'api';

const RAW_DATA_MODE = process.env.EXPO_PUBLIC_DATA_MODE;
const RAW_API_URL = process.env.EXPO_PUBLIC_API_URL;
const RAW_SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const RAW_SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

function orDefault(value: string | undefined, fallback: string): string {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : fallback;
}

export const appConfig = {
  dataMode: (orDefault(RAW_DATA_MODE, 'mock') === 'api' ? 'api' : 'mock') as DataMode,
  apiUrl: orDefault(RAW_API_URL, 'http://localhost:8787').replace(/\/+$/, ''),
  supabaseUrl: orDefault(RAW_SUPABASE_URL, ''),
  supabaseAnonKey: orDefault(RAW_SUPABASE_ANON_KEY, ''),
  deepLinkScheme: 'ogii',
} as const;

export const isMockMode = appConfig.dataMode === 'mock';
