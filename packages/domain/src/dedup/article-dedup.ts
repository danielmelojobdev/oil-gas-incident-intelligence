/**
 * Article deduplication (brief section 15).
 *
 * The user must never see the same article twice. Five independent signals, cheapest
 * first, each of which is on its own sufficient:
 *
 *   1. canonical URL            exact
 *   2. normalised URL           exact
 *   3. title hash + publisher   within 7 days
 *   4. content hash             exact
 *   5. fuzzy title similarity   within 48h, same publisher family (syndication)
 */
import { contentHash as computeContentHash, titleHash as computeTitleHash } from '../text/hash';
import { normaliseUrl, publisherHost } from '../text/url';
import { headlineSimilarity } from '../text/similarity';
import { normaliseOrganisationName } from '../text/normalise';

export interface DedupCandidate {
  readonly id: string;
  readonly title: string;
  readonly url: string;
  readonly canonicalUrl?: string | null;
  readonly normalizedUrl?: string | null;
  readonly publisher: string;
  readonly publishedAt?: string | null;
  readonly excerpt?: string | null;
  readonly titleHash?: string | null;
  readonly contentHash?: string | null;
}

export type DuplicateReason =
  | 'canonical_url'
  | 'normalized_url'
  | 'title_hash_same_publisher'
  | 'content_hash'
  | 'fuzzy_syndication';

export interface DuplicateVerdict {
  readonly isDuplicate: boolean;
  readonly reason: DuplicateReason | null;
  readonly matchedId: string | null;
  readonly similarity: number | null;
}

const NOT_DUPLICATE: DuplicateVerdict = {
  isDuplicate: false,
  reason: null,
  matchedId: null,
  similarity: null,
};

/** Fills in the derived dedup keys for a candidate. */
export function withDedupKeys(candidate: DedupCandidate): Required<
  Pick<DedupCandidate, 'normalizedUrl' | 'titleHash' | 'contentHash'>
> & DedupCandidate {
  return {
    ...candidate,
    normalizedUrl: candidate.normalizedUrl ?? normaliseUrl(candidate.canonicalUrl ?? candidate.url),
    titleHash: candidate.titleHash ?? computeTitleHash(candidate.title),
    contentHash: candidate.contentHash ?? computeContentHash(candidate.title, candidate.excerpt ?? null),
  };
}

function hoursBetween(a: string | null | undefined, b: string | null | undefined): number | null {
  if (a === null || a === undefined || b === null || b === undefined) return null;
  const timeA = Date.parse(a);
  const timeB = Date.parse(b);
  if (Number.isNaN(timeA) || Number.isNaN(timeB)) return null;
  return Math.abs(timeA - timeB) / 3_600_000;
}

function samePublisher(a: DedupCandidate, b: DedupCandidate): boolean {
  const nameA = normaliseOrganisationName(a.publisher);
  const nameB = normaliseOrganisationName(b.publisher);
  if (nameA.length > 0 && nameA === nameB) return true;
  const hostA = publisherHost(a.url);
  const hostB = publisherHost(b.url);
  return hostA !== null && hostA === hostB;
}

/** Compares one candidate against one known article. */
export function compareArticles(candidate: DedupCandidate, known: DedupCandidate): DuplicateVerdict {
  const left = withDedupKeys(candidate);
  const right = withDedupKeys(known);

  if (
    left.canonicalUrl !== null &&
    left.canonicalUrl !== undefined &&
    right.canonicalUrl !== null &&
    right.canonicalUrl !== undefined &&
    normaliseUrl(left.canonicalUrl) === normaliseUrl(right.canonicalUrl)
  ) {
    return { isDuplicate: true, reason: 'canonical_url', matchedId: known.id, similarity: 1 };
  }

  if (left.normalizedUrl === right.normalizedUrl) {
    return { isDuplicate: true, reason: 'normalized_url', matchedId: known.id, similarity: 1 };
  }

  if (left.contentHash === right.contentHash) {
    return { isDuplicate: true, reason: 'content_hash', matchedId: known.id, similarity: 1 };
  }

  const hours = hoursBetween(left.publishedAt, right.publishedAt);
  if (left.titleHash === right.titleHash && samePublisher(left, right) && (hours === null || hours <= 24 * 7)) {
    return { isDuplicate: true, reason: 'title_hash_same_publisher', matchedId: known.id, similarity: 1 };
  }

  // Syndication: the same wire story republished by a sibling outlet within two days.
  const similarity = headlineSimilarity(left.title, right.title);
  if (similarity >= 0.85 && (hours === null || hours <= 48)) {
    return { isDuplicate: true, reason: 'fuzzy_syndication', matchedId: known.id, similarity };
  }

  return NOT_DUPLICATE;
}

/** Finds the first known article that duplicates the candidate. */
export function findDuplicate(
  candidate: DedupCandidate,
  known: readonly DedupCandidate[],
): DuplicateVerdict {
  for (const other of known) {
    if (other.id === candidate.id) continue;
    const verdict = compareArticles(candidate, other);
    if (verdict.isDuplicate) return verdict;
  }
  return NOT_DUPLICATE;
}

export interface DedupeBatchResult<T extends DedupCandidate> {
  readonly unique: T[];
  readonly duplicates: { readonly item: T; readonly verdict: DuplicateVerdict }[];
}

/**
 * Deduplicates a batch against itself (and optionally against already-known articles).
 * Stable: the first occurrence wins, so provider priority order is preserved.
 */
export function dedupeArticles<T extends DedupCandidate>(
  items: readonly T[],
  known: readonly DedupCandidate[] = [],
): DedupeBatchResult<T> {
  const unique: T[] = [];
  const duplicates: { item: T; verdict: DuplicateVerdict }[] = [];
  const pool: DedupCandidate[] = [...known];

  for (const item of items) {
    const verdict = findDuplicate(item, pool);
    if (verdict.isDuplicate) {
      duplicates.push({ item, verdict });
      continue;
    }
    unique.push(item);
    pool.push(item);
  }

  return { unique, duplicates };
}
