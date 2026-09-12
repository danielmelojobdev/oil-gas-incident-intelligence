/**
 * Deterministic, dependency-free hashing (see decision D12).
 *
 * A 128-bit FNV-1a variant implemented over four 32-bit lanes. These hashes are
 * DEDUPLICATION KEYS, not security primitives: nothing in the system relies on them
 * being preimage- or collision-resistant against an adversary. They exist because the
 * exact same function must produce the exact same value in Hermes (React Native), in
 * Node and in the test runner, without pulling in `node:crypto` or a wasm build.
 */
import { normaliseText, tokenise } from './normalise';

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

function fnv1a32(input: string, seed: number): number {
  let hash = (FNV_OFFSET ^ seed) >>> 0;
  for (let i = 0; i < input.length; i += 1) {
    const code = input.charCodeAt(i);
    hash ^= code & 0xff;
    hash = Math.imul(hash, FNV_PRIME) >>> 0;
    hash ^= (code >>> 8) & 0xff;
    hash = Math.imul(hash, FNV_PRIME) >>> 0;
  }
  return hash >>> 0;
}

function toHex8(value: number): string {
  return (value >>> 0).toString(16).padStart(8, '0');
}

/** 128-bit hex digest (32 chars). Stable across runtimes and process restarts. */
export function stableHash(input: string): string {
  const a = fnv1a32(input, 0);
  const b = fnv1a32(input, 0x9e3779b9);
  const c = fnv1a32(`${input}#c`, 0x85ebca6b);
  const d = fnv1a32(`${input}#d`, 0xc2b2ae35);
  return toHex8(a) + toHex8(b) + toHex8(c) + toHex8(d);
}

/**
 * Hash of a headline: normalised, with tokens sorted, so that
 * "Fire on North Sea platform" and "North Sea platform fire" collide on purpose.
 * Word order is not evidence of a different article.
 */
export function titleHash(title: string): string {
  const tokens = tokenise(title).sort();
  return stableHash(tokens.join(' '));
}

/** Hash of title + excerpt, used to detect byte-level republication. */
export function contentHash(title: string, excerpt: string | null | undefined): string {
  return stableHash(`${normaliseText(title)} ${normaliseText(excerpt ?? '')}`);
}

/**
 * Fingerprint of the *facts* of an incident update. Two articles that change nothing
 * produce the same fingerprint, which is how repeated notifications are suppressed.
 */
export function updateFingerprint(
  parts: readonly (string | number | boolean | null | undefined)[],
): string {
  return stableHash(parts.map((part) => (part === null || part === undefined ? 'NULL' : String(part))).join('|'));
}
