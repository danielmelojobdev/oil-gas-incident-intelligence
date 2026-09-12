/** Similarity measures used by article deduplication and incident grouping. */
import { tokenSet } from './normalise';

/** |A intersect B| / |A union B| over token sets. */
export function jaccard(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection += 1;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/** |A intersect B| / min(|A|,|B|): tolerant of one text being much longer than the other. */
export function containment(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection += 1;
  return intersection / Math.min(a.size, b.size);
}

/** Token-set Jaccard between two raw strings. */
export function textSimilarity(a: string, b: string): number {
  return jaccard(tokenSet(a), tokenSet(b));
}

/**
 * Headline similarity: the better of Jaccard and (discounted) containment, because a
 * wire headline is often a strict subset of a feature headline about the same event.
 */
export function headlineSimilarity(a: string, b: string): number {
  const setA = tokenSet(a);
  const setB = tokenSet(b);
  return Math.max(jaccard(setA, setB), containment(setA, setB) * 0.95);
}

/** Character trigram set, for short strings where token overlap is too coarse. */
export function trigrams(input: string): Set<string> {
  const padded = ` ${input.toLowerCase().replace(/\s+/g, ' ').trim()} `;
  const result = new Set<string>();
  for (let i = 0; i + 3 <= padded.length; i += 1) result.add(padded.slice(i, i + 3));
  return result;
}

export function trigramSimilarity(a: string, b: string): number {
  return jaccard(trigrams(a), trigrams(b));
}

/** Normalised Levenshtein similarity in [0,1]; O(n*m), only used on short names. */
export function levenshteinSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;
  const maxLength = Math.max(a.length, b.length);
  if (maxLength > 128) return trigramSimilarity(a, b);

  let previous: number[] = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const current: number[] = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const deletion = (previous[j] ?? 0) + 1;
      const insertion = (current[j - 1] ?? 0) + 1;
      const substitution = (previous[j - 1] ?? 0) + cost;
      current[j] = Math.min(deletion, insertion, substitution);
    }
    previous = current;
  }
  const distance = previous[b.length] ?? maxLength;
  return 1 - distance / maxLength;
}
