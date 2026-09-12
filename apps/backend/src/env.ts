/**
 * The single place that reads `process.env`.
 *
 * Everything else receives validated configuration. An invalid environment fails at
 * boot with a readable message rather than at 3am inside a provider.
 */
import { z } from 'zod';
import { SCAN_FREQUENCIES, SEARCH_PERIODS, LANGUAGES } from '@ogii/domain';
import { loadEnvFile } from './load-env-file';

const booleanish = z
  .union([z.boolean(), z.string()])
  .transform((value) => (typeof value === 'boolean' ? value : ['1', 'true', 'yes', 'on'].includes(value.toLowerCase())));

const csv = (fallback: string[] = []) =>
  z
    .string()
    .optional()
    .transform((value) =>
      value === undefined || value.trim() === ''
        ? fallback
        : value
            .split(',')
            .map((part) => part.trim())
            .filter((part) => part.length > 0),
    );

const optionalString = z
  .string()
  .optional()
  .transform((value) => (value === undefined || value.trim() === '' ? null : value.trim()));

export const envSchema = z.object({
  APP_MODE: z.enum(['mock', 'full']).default('mock'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  PORT: z.coerce.number().int().min(1).max(65535).default(8787),
  HOST: z.string().default('0.0.0.0'),
  CORS_ORIGINS: csv(['*']),
  ADMIN_API_TOKEN: z.string().min(1).default('dev-admin-token'),
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).default(120),

  DATABASE_DRIVER: z.enum(['memory', 'postgres']).default('memory'),
  DATABASE_URL: optionalString,
  SUPABASE_URL: optionalString,
  SUPABASE_ANON_KEY: optionalString,
  SUPABASE_SERVICE_ROLE_KEY: optionalString,

  AI_PROVIDER: z.enum(['mock', 'openai', 'anthropic', 'gemini']).default('mock'),
  AI_CLASSIFY_MODEL: optionalString,
  AI_EXTRACT_MODEL: optionalString,
  AI_MAX_CONCURRENCY: z.coerce.number().int().min(1).max(32).default(4),
  AI_TIMEOUT_MS: z.coerce.number().int().min(1000).default(45_000),
  OPENAI_API_KEY: optionalString,
  ANTHROPIC_API_KEY: optionalString,
  GEMINI_API_KEY: optionalString,

  NEWS_PROVIDERS: csv(['mock']),
  NEWS_API_KEY: optionalString,
  BING_API_KEY: optionalString,
  BING_ENDPOINT: z.string().default('https://api.bing.microsoft.com/v7.0/news/search'),
  GOOGLE_SEARCH_API_KEY: optionalString,
  GOOGLE_SEARCH_ENGINE_ID: optionalString,
  HTTP_USER_AGENT: z.string().default('OilGasIncidentIntelligence/0.1 (+contact@example.com)'),
  HTTP_TIMEOUT_MS: z.coerce.number().int().min(1000).default(15_000),
  HTTP_MAX_RETRIES: z.coerce.number().int().min(0).max(5).default(2),

  SCAN_SCHEDULE: z.enum(SCAN_FREQUENCIES).default('every-6-hours'),
  SCAN_ENABLED: booleanish.default(true),
  SCAN_MAX_QUERIES: z.coerce.number().int().min(1).max(500).default(40),
  SCAN_MAX_ARTICLES_PER_QUERY: z.coerce.number().int().min(1).max(100).default(25),
  SCAN_MAX_AI_EXTRACTIONS: z.coerce.number().int().min(0).max(500).default(40),
  SCAN_DEFAULT_PERIOD: z.enum(SEARCH_PERIODS).default('last_30_days'),
  /** Minimum gap between user-triggered "Scan Now" runs. Scans cost money. */
  SCAN_MANUAL_COOLDOWN_SECONDS: z.coerce.number().int().min(0).max(86_400).default(300),
  SCAN_LANGUAGES: csv(['en', 'pt', 'es', 'no']).pipe(z.array(z.enum(LANGUAGES))),

  PUSH_PROVIDER: z.enum(['mock', 'expo']).default('mock'),
  EXPO_ACCESS_TOKEN: optionalString,
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

/** Path of the `.env` that was loaded, for the startup log. */
export let loadedEnvFile: string | null = null;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  // Populate process.env from `.env` before validating, unless a caller passed its own
  // source (the tests do, and they must stay hermetic).
  if (source === process.env) loadedEnvFile = loadEnvFile();

  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  const env = parsed.data;

  // Cross-field checks the schema cannot express.
  if (env.DATABASE_DRIVER === 'postgres' && env.DATABASE_URL === null) {
    throw new Error('DATABASE_DRIVER=postgres requires DATABASE_URL.');
  }
  if (env.AI_PROVIDER === 'openai' && env.OPENAI_API_KEY === null) {
    throw new Error('AI_PROVIDER=openai requires OPENAI_API_KEY.');
  }
  if (env.AI_PROVIDER === 'anthropic' && env.ANTHROPIC_API_KEY === null) {
    throw new Error('AI_PROVIDER=anthropic requires ANTHROPIC_API_KEY.');
  }
  if (env.AI_PROVIDER === 'gemini' && env.GEMINI_API_KEY === null) {
    throw new Error('AI_PROVIDER=gemini requires GEMINI_API_KEY.');
  }
  if (env.NODE_ENV === 'production' && env.ADMIN_API_TOKEN === 'dev-admin-token') {
    throw new Error('ADMIN_API_TOKEN must be set to a real secret in production.');
  }
  return env;
}

export function getEnv(): Env {
  cached ??= loadEnv();
  return cached;
}

/** Test seam: replace the cached environment. */
export function setEnv(env: Env): void {
  cached = env;
}
