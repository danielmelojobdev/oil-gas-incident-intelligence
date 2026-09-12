/** Text normalisation shared by hashing, deduplication and heuristics. */

/** Unicode combining marks (U+0300–U+036F), stripped after NFD decomposition. */
const DIACRITICS = /[\u0300-\u036f]/g;

/** Lowercase + strip diacritics (`explosao` with tilde becomes plain `explosao`). */
export function foldCase(input: string): string {
  return input.normalize('NFD').replace(DIACRITICS, '').toLowerCase();
}

/** Collapse all whitespace runs to a single space and trim. */
export function collapseWhitespace(input: string): string {
  return input.replace(/\s+/g, ' ').trim();
}

/**
 * Canonical form used for comparing titles: case-folded, punctuation removed,
 * whitespace collapsed. Keeps digits (well numbers, dates, casualty counts matter).
 */
export function normaliseText(input: string): string {
  return collapseWhitespace(foldCase(input).replace(/[^\p{L}\p{N}\s]/gu, ' '));
}

/** Multi-language stop words. Small on purpose: we only want to kill pure noise. */
const STOP_WORDS = new Set([
  // en
  'a', 'an', 'the', 'of', 'in', 'on', 'at', 'to', 'for', 'and', 'or', 'as', 'by', 'with',
  'from', 'is', 'are', 'was', 'were', 'be', 'been', 'after', 'over', 'into', 'its', 'it',
  'that', 'this', 'has', 'have', 'had', 'says', 'said', 'new', 'update', 'breaking',
  // pt / es
  'o', 'os', 'as', 'um', 'uma', 'de', 'do', 'da', 'dos', 'das', 'em', 'no', 'na', 'nos',
  'nas', 'por', 'para', 'com', 'e', 'ao', 'aos', 'que', 'se', 'sobre', 'apos', 'del',
  'la', 'las', 'los', 'el', 'un', 'una', 'y', 'en',
  // fr
  'le', 'les', 'des', 'du', 'une', 'au', 'aux', 'dans', 'sur', 'avec',
  // no
  'og', 'i', 'pa', 'av', 'til', 'med', 'er', 'som', 'et', 'den', 'det',
]);

/** Tokenise to meaningful words (at least 2 chars, no stop words). */
export function tokenise(input: string): string[] {
  return normaliseText(input)
    .split(' ')
    .filter((token) => token.length >= 2 && !STOP_WORDS.has(token));
}

export function tokenSet(input: string): Set<string> {
  return new Set(tokenise(input));
}

/**
 * Normalises a company name for comparison: folds case, removes legal suffixes and
 * punctuation, so `Norsea Energy AS` and `NORSEA ENERGY A/S` compare equal.
 */
const LEGAL_SUFFIXES = new Set([
  'inc', 'incorporated', 'llc', 'ltd', 'limited', 'plc', 'corp', 'corporation', 'co',
  'company', 'sa', 'sas', 'as', 'asa', 'ab', 'nv', 'bv', 'gmbh', 'ag', 'spa', 'srl',
  'pte', 'pty', 'oyj', 'kk', 'lp', 'llp', 'group', 'holdings', 'holding',
  'sarl', 'cia', 'ltda', 'eireli',
]);

export function normaliseOrganisationName(input: string): string {
  const tokens = normaliseText(input)
    .split(' ')
    .filter((token) => token.length > 0 && !LEGAL_SUFFIXES.has(token));
  return tokens.join(' ');
}

/** Normalises an asset / field / well name: folds case, strips punctuation, keeps digits. */
export function normaliseAssetName(input: string): string {
  return normaliseText(input).replace(/\s+/g, ' ');
}

/** Truncate on a word boundary with an ellipsis. */
export function truncate(input: string, maxLength: number): string {
  if (input.length <= maxLength) return input;
  const slice = input.slice(0, maxLength);
  const lastSpace = slice.lastIndexOf(' ');
  return `${(lastSpace > maxLength * 0.6 ? slice.slice(0, lastSpace) : slice).trimEnd()}...`;
}
