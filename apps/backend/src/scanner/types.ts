/** Shared types for the scanner pipeline. */
import type { RawArticle, ScanConfig, ScanRun, ScanTrigger } from '@ogii/domain';
import type { HeuristicVerdict } from '@ogii/domain';

/** Human-readable stages surfaced to the Scan Now progress UI (brief section 14). */
export const SCAN_STAGES = [
  'Scanning...',
  'Searching sources...',
  'Analysing articles...',
  'Removing duplicates...',
  'Grouping incidents...',
  'Generating intelligence...',
  'Complete.',
] as const;
export type ScanStage = (typeof SCAN_STAGES)[number];

export interface ScanRequest {
  readonly trigger: ScanTrigger;
  readonly config: ScanConfig;
}

/** A provider result carried through the pipeline with its accumulated verdicts. */
export interface Candidate {
  readonly raw: RawArticle;
  readonly normalizedUrl: string;
  readonly titleHash: string;
  readonly contentHash: string;
  heuristics?: HeuristicVerdict;
  aiRelevance?: { isRelated: boolean; confidence: number; sector: string; reason: string };
  relevanceScore?: number;
  rejectedReason?: string;
}

export interface ScanSummary {
  readonly scanId: string;
  readonly sourcesSearched: number;
  readonly articlesAnalysed: number;
  readonly potentialIncidents: number;
  readonly rejected: number;
  readonly duplicates: number;
  readonly newIncidents: number;
  readonly updatedIncidents: number;
  readonly notificationsSent: number;
  readonly durationMs: number;
  readonly run: ScanRun;
}
