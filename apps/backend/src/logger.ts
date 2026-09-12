/**
 * Structured logging (brief section 49).
 *
 * Deliberately dependency-free: one JSON line per event on stdout, which every log
 * platform ingests. Secrets are redacted by key pattern before anything is written.
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Readonly<Record<LogLevel, number>> = { debug: 10, info: 20, warn: 30, error: 40 };

const SECRET_KEY_PATTERN = /(authorization|cookie|api[-_]?key|secret|token|password|service[-_]?role)/i;
const REDACTED = '[redacted]';

export type LogFields = Record<string, unknown>;

function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[depth-limit]';
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));
  if (value instanceof Error) return { name: value.name, message: value.message, stack: value.stack };
  if (typeof value === 'object') {
    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      output[key] = SECRET_KEY_PATTERN.test(key) ? REDACTED : redact(item, depth + 1);
    }
    return output;
  }
  if (typeof value === 'string' && value.length > 4000) return `${value.slice(0, 4000)}...[truncated]`;
  return value;
}

export interface Logger {
  readonly level: LogLevel;
  debug(message: string, fields?: LogFields): void;
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
  child(bindings: LogFields): Logger;
}

export function createLogger(level: LogLevel = 'info', bindings: LogFields = {}): Logger {
  const write = (entryLevel: LogLevel, message: string, fields?: LogFields): void => {
    if (LEVEL_ORDER[entryLevel] < LEVEL_ORDER[level]) return;
    const entry = {
      time: new Date().toISOString(),
      level: entryLevel,
      message,
      ...(redact(bindings) as LogFields),
      ...(fields === undefined ? {} : (redact(fields) as LogFields)),
    };
    const line = JSON.stringify(entry);
    if (entryLevel === 'error') process.stderr.write(`${line}\n`);
    else process.stdout.write(`${line}\n`);
  };

  return {
    level,
    debug: (message, fields) => write('debug', message, fields),
    info: (message, fields) => write('info', message, fields),
    warn: (message, fields) => write('warn', message, fields),
    error: (message, fields) => write('error', message, fields),
    child: (extra) => createLogger(level, { ...bindings, ...extra }),
  };
}

/** A logger that discards everything — used by tests. */
export const silentLogger: Logger = {
  level: 'error',
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  child: () => silentLogger,
};
