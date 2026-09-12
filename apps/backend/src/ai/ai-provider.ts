/**
 * The AI port (brief section 5).
 *
 * No AI call exists anywhere else in the codebase. Adding a model vendor means adding
 * one file in this folder and one line in `registry.ts`; nothing else changes.
 */
import type {
  ExtractedIncident,
  IncidentSimilarityVerdict,
  IncidentSummaryResult,
  MaterialUpdateVerdict,
  OilGasRelevanceResult,
} from '@ogii/domain';

export interface ArticleForAi {
  readonly id: string;
  readonly title: string;
  readonly excerpt: string | null;
  readonly publisher: string;
  readonly publishedAt: string | null;
  readonly url: string;
  readonly language: string | null;
  readonly sourceTier: number;
}

export interface IncidentForAi {
  readonly title: string;
  readonly summary: string | null;
  readonly incidentDate: string | null;
  readonly country: string | null;
  readonly operator: string | null;
  readonly asset: string | null;
  readonly incidentType: string | null;
  readonly fatalities: number | null;
  readonly injuries: number | null;
}

export interface AiUsage {
  readonly provider: string;
  readonly model: string;
  readonly promptTokens: number | null;
  readonly completionTokens: number | null;
  readonly durationMs: number;
  readonly cached: boolean;
}

export interface AiResult<T> {
  readonly value: T;
  readonly usage: AiUsage;
}

/**
 * Every method returns a Zod-validated object. Implementations MUST NOT return raw
 * model JSON: `parseAiJson` is the only permitted path from text to a typed value.
 */
export interface AIProvider {
  readonly id: string;
  readonly classifyModel: string;
  readonly extractModel: string;

  isAvailable(): boolean;

  /** Stage 6 of the cost ladder: cheap, title + excerpt only. */
  classifyOilAndGasRelevance(article: ArticleForAi): Promise<AiResult<OilGasRelevanceResult>>;

  /** Stage 7: full structured extraction, only for candidates that survived the ladder. */
  extractIncidentData(articles: readonly ArticleForAi[]): Promise<AiResult<ExtractedIncident>>;

  /** Stage 8: consolidated summary across every source attached to an incident. */
  summarizeIncident(
    incident: IncidentForAi,
    articles: readonly ArticleForAi[],
  ): Promise<AiResult<IncidentSummaryResult>>;

  /** 4-8 bullet points, each supported by the sources. */
  generateHighlights(
    incident: IncidentForAi,
    articles: readonly ArticleForAi[],
  ): Promise<AiResult<string[]>>;

  /** Tie-breaker for the ambiguous grouping band only. Rules gate this call. */
  compareIncidentSimilarity(
    a: IncidentForAi,
    b: IncidentForAi,
  ): Promise<AiResult<IncidentSimilarityVerdict>>;

  /** Second opinion on materiality. Can never create materiality on its own. */
  determineMaterialUpdate(
    existing: IncidentForAi,
    incoming: ArticleForAi,
  ): Promise<AiResult<MaterialUpdateVerdict>>;
}
