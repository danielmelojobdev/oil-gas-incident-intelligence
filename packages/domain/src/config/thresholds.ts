/** Tunable thresholds. Everything the pipeline decides with lives here, not inline. */

export const THRESHOLDS = {
  relevance: {
    /** >= feed goes straight into the feed. */
    feed: 70,
    /** >= review is kept but flagged for review and never notifies. */
    review: 50,
  },
  aiRelevance: {
    /** Below this AI confidence we never notify automatically (brief section 4). */
    notifyMinConfidence: 0.7,
    /** Below this the candidate is rejected outright. */
    rejectBelow: 0.35,
  },
  grouping: {
    match: 0.72,
    review: 0.55,
    maxDateGapDays: 7,
    /** The LLM tie-break must be at least this confident to merge. */
    aiMinConfidence: 0.7,
  },
  dedup: {
    fuzzyTitleSimilarity: 0.85,
    syndicationWindowHours: 48,
    titleHashWindowDays: 7,
  },
  notification: {
    /** Confidence score (0-100) below which a new incident is queued instead of pushed. */
    minConfidenceScore: 50,
  },
  cost: {
    /** Cache TTL for AI responses keyed by content hash. */
    aiCacheTtlMs: 24 * 60 * 60 * 1000,
  },
} as const;

export type Thresholds = typeof THRESHOLDS;
