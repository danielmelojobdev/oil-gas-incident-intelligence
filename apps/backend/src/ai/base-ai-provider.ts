/**
 * Shared implementation for every LLM-backed provider.
 *
 * Subclasses implement exactly one method — `complete()` — and inherit prompting,
 * JSON extraction, Zod validation, caching and usage accounting. That is what keeps
 * "add a new AI provider" to about 60 lines.
 */
import {
  extractedIncidentSchema,
  incidentSimilarityVerdictSchema,
  incidentSummaryResultSchema,
  materialUpdateVerdictSchema,
  oilGasRelevanceResultSchema,
  THRESHOLDS,
  contentHash,
  type ExtractedIncident,
  type IncidentSimilarityVerdict,
  type IncidentSummaryResult,
  type MaterialUpdateVerdict,
  type OilGasRelevanceResult,
} from '@ogii/domain';
import { z } from 'zod';
import type { AIProvider, AiResult, AiUsage, ArticleForAi, IncidentForAi } from './ai-provider';
import { parseAiJson } from './json';
import {
  PROMPT_VERSION,
  SYSTEM_PROMPT,
  extractionPrompt,
  highlightsPrompt,
  materialUpdatePrompt,
  relevancePrompt,
  similarityPrompt,
  summaryPrompt,
} from './prompts';
import { TtlCache } from '../util/cache';
import type { Logger } from '../logger';
import { AiResponseError } from '../util/errors';

/** `generateHighlights` only needs the bullets; the summary field is optional there. */
const highlightsOnlySchema = z.object({
  highlights: z.array(z.string().min(1)).min(1).max(12),
});

export interface CompletionRequest {
  readonly system: string;
  readonly user: string;
  readonly model: string;
  readonly maxOutputTokens: number;
  /** Low temperature: extraction is not a creative task. */
  readonly temperature: number;
}

export interface CompletionResponse {
  readonly text: string;
  readonly promptTokens: number | null;
  readonly completionTokens: number | null;
}

export interface BaseAiOptions {
  readonly classifyModel: string;
  readonly extractModel: string;
  readonly logger: Logger;
  readonly cacheTtlMs?: number;
}

export abstract class BaseAiProvider implements AIProvider {
  abstract readonly id: string;
  readonly classifyModel: string;
  readonly extractModel: string;

  protected readonly logger: Logger;
  private readonly cache: TtlCache<unknown>;

  constructor(options: BaseAiOptions) {
    this.classifyModel = options.classifyModel;
    this.extractModel = options.extractModel;
    this.logger = options.logger.child({ component: 'ai', provider: this.constructor.name });
    this.cache = new TtlCache<unknown>(options.cacheTtlMs ?? THRESHOLDS.cost.aiCacheTtlMs);
  }

  abstract isAvailable(): boolean;

  /** The only vendor-specific piece. */
  protected abstract complete(request: CompletionRequest): Promise<CompletionResponse>;

  /**
   * Prompt -> completion -> JSON -> Zod, with a content-addressed cache and one retry
   * that explicitly asks the model to return JSON only.
   */
  private async call<S extends z.ZodTypeAny>(
    kind: string,
    schema: S,
    prompt: string,
    model: string,
    maxOutputTokens: number,
  ): Promise<AiResult<z.output<S>>> {
    const cacheKey = `${kind}:${PROMPT_VERSION}:${model}:${contentHash(prompt, null)}`;
    const cached = this.cache.get(cacheKey) as z.output<S> | undefined;
    if (cached !== undefined) {
      return {
        value: cached,
        usage: {
          provider: this.id,
          model,
          promptTokens: 0,
          completionTokens: 0,
          durationMs: 0,
          cached: true,
        },
      };
    }

    const startedAt = Date.now();
    let lastError: unknown = null;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const user = attempt === 0 ? prompt : `${prompt}\n\nYour previous reply was not valid JSON. Reply with the JSON object only.`;
      try {
        const response = await this.complete({
          system: SYSTEM_PROMPT,
          user,
          model,
          maxOutputTokens,
          temperature: 0,
        });
        const value = parseAiJson(schema, response.text);
        const usage: AiUsage = {
          provider: this.id,
          model,
          promptTokens: response.promptTokens,
          completionTokens: response.completionTokens,
          durationMs: Date.now() - startedAt,
          cached: false,
        };
        this.cache.set(cacheKey, value);
        this.logger.debug('ai call complete', {
          kind,
          model,
          attempt,
          durationMs: usage.durationMs,
          promptTokens: usage.promptTokens,
          completionTokens: usage.completionTokens,
          promptVersion: PROMPT_VERSION,
        });
        return { value, usage };
      } catch (error) {
        lastError = error;
        if (!(error instanceof AiResponseError)) throw error;
        this.logger.warn('ai response failed validation', { kind, model, attempt, error: error.message });
      }
    }

    throw lastError instanceof Error ? lastError : new AiResponseError('AI call failed', '');
  }

  async classifyOilAndGasRelevance(article: ArticleForAi): Promise<AiResult<OilGasRelevanceResult>> {
    return this.call('relevance', oilGasRelevanceResultSchema, relevancePrompt(article), this.classifyModel, 400);
  }

  async extractIncidentData(articles: readonly ArticleForAi[]): Promise<AiResult<ExtractedIncident>> {
    return this.call('extract', extractedIncidentSchema, extractionPrompt(articles), this.extractModel, 2400);
  }

  async summarizeIncident(
    incident: IncidentForAi,
    articles: readonly ArticleForAi[],
  ): Promise<AiResult<IncidentSummaryResult>> {
    return this.call(
      'summary',
      incidentSummaryResultSchema,
      summaryPrompt(incident, articles),
      this.extractModel,
      1200,
    );
  }

  async generateHighlights(
    incident: IncidentForAi,
    articles: readonly ArticleForAi[],
  ): Promise<AiResult<string[]>> {
    const result = await this.call(
      'highlights',
      highlightsOnlySchema,
      highlightsPrompt(incident, articles),
      this.classifyModel,
      800,
    );
    return { value: result.value.highlights, usage: result.usage };
  }

  async compareIncidentSimilarity(
    a: IncidentForAi,
    b: IncidentForAi,
  ): Promise<AiResult<IncidentSimilarityVerdict>> {
    return this.call(
      'similarity',
      incidentSimilarityVerdictSchema,
      similarityPrompt(a, b),
      this.classifyModel,
      300,
    );
  }

  async determineMaterialUpdate(
    existing: IncidentForAi,
    incoming: ArticleForAi,
  ): Promise<AiResult<MaterialUpdateVerdict>> {
    return this.call(
      'material-update',
      materialUpdateVerdictSchema,
      materialUpdatePrompt(existing, incoming),
      this.classifyModel,
      400,
    );
  }
}
