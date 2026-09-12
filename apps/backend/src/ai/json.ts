/**
 * The single gate between model text and typed domain objects (brief section 26).
 *
 * Models wrap JSON in prose and code fences, emit trailing commas, and occasionally
 * emit the string "null" where a number belongs. We repair only what is unambiguous
 * and then hand the result to Zod. If Zod rejects it, the candidate is dropped — a
 * malformed response never becomes an incident.
 */
import type { z } from 'zod';
import { AiResponseError } from '../util/errors';

/** Extracts the outermost JSON object from a model response. */
export function extractJsonObject(raw: string): string {
  const text = raw.trim();

  // ```json ... ``` or ``` ... ```
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const candidate = fenced?.[1]?.trim() ?? text;

  const start = candidate.indexOf('{');
  if (start === -1) throw new AiResponseError('No JSON object found in the model response', raw);

  // Walk to the matching brace, respecting strings and escapes.
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < candidate.length; i += 1) {
    const char = candidate[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return candidate.slice(start, i + 1);
    }
  }
  throw new AiResponseError('Unbalanced JSON object in the model response', raw);
}

/** Removes trailing commas, which are the single most common model JSON defect. */
function repairTrailingCommas(json: string): string {
  return json.replace(/,\s*([}\]])/g, '$1');
}

/** Turns the strings models sometimes emit for absent values into real nulls. */
function normaliseNullish(value: unknown): unknown {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    const lower = trimmed.toLowerCase();
    // NOTE: "unknown" is deliberately NOT in this list. It is a valid value in several
    // taxonomies (sector, environment, lifecycle stage). Mapping it to null for the
    // free-text fields is the job of the domain schema, which knows which is which.
    if (
      lower === 'null' ||
      lower === 'none' ||
      lower === 'n/a' ||
      lower === 'na' ||
      lower === 'not reported' ||
      lower === 'not specified' ||
      lower === 'not available' ||
      lower === 'undefined' ||
      trimmed === ''
    ) {
      return null;
    }
    return trimmed;
  }
  if (Array.isArray(value)) return value.map(normaliseNullish);
  if (value !== null && typeof value === 'object') {
    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      output[key] = normaliseNullish(item);
    }
    return output;
  }
  return value;
}

/**
 * Parses and validates a model response.
 *
 * Sentinel strings that mean "the model has nothing" ("n/a", "not reported", "") are
 * normalised to `null` first. The literal "unknown" is left alone because it is a
 * valid member of several taxonomies; `nullableString` in the domain schema maps it to
 * null for the free-text fields where it means "not reported".
 */
export function parseAiJson<S extends z.ZodTypeAny>(schema: S, raw: string): z.output<S> {
  const jsonText = repairTrailingCommas(extractJsonObject(raw));
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (error) {
    throw new AiResponseError(
      `Model response was not valid JSON: ${error instanceof Error ? error.message : 'parse error'}`,
      raw,
    );
  }

  const result = schema.safeParse(normaliseNullish(parsed));
  if (!result.success) {
    const issues = result.error.issues
      .slice(0, 8)
      .map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
      .join('; ');
    throw new AiResponseError(`Model response failed validation: ${issues}`, raw);
  }
  return result.data;
}
