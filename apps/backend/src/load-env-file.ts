/**
 * Minimal `.env` loader.
 *
 * The README told people to copy `.env.example` to `.env`, and nothing ever read it:
 * every value they set was silently ignored and the process quietly ran on defaults.
 * That is worse than having no `.env` support at all, because it fails invisibly.
 *
 * Deliberately dependency-free and deliberately non-overriding: a variable already
 * present in the real environment always wins, so `APP_MODE=mock npm run scan` still
 * behaves the way the command line says it should.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

function parse(contents: string): Record<string, string> {
  const values: Record<string, string> = {};

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) continue;

    const separator = line.indexOf('=');
    if (separator <= 0) continue;

    const key = line.slice(0, separator).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;

    let value = line.slice(separator + 1).trim();
    // Strip matching quotes; leave the contents alone otherwise.
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1);
    } else {
      // An unquoted trailing comment is not part of the value.
      const comment = value.indexOf(' #');
      if (comment !== -1) value = value.slice(0, comment).trim();
    }
    values[key] = value;
  }

  return values;
}

/** Candidate locations, nearest first: the repo root is where `.env.example` lives. */
function candidatePaths(): string[] {
  const here = dirname(fileURLToPath(import.meta.url));
  return [
    resolve(process.cwd(), '.env'),
    resolve(here, '../.env'),
    resolve(here, '../../../.env'),
  ];
}

/** Loads the first `.env` found. Returns the path used, or null. */
export function loadEnvFile(explicitPath?: string): string | null {
  const paths = explicitPath === undefined ? candidatePaths() : [resolve(explicitPath)];

  for (const path of paths) {
    if (!existsSync(path)) continue;
    try {
      for (const [key, value] of Object.entries(parse(readFileSync(path, 'utf8')))) {
        // Never clobber something the caller set explicitly.
        if (process.env[key] === undefined) process.env[key] = value;
      }
      return path;
    } catch {
      // An unreadable .env must not stop the process; validated defaults still apply.
      return null;
    }
  }
  return null;
}
