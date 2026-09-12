/**
 * MockAIProvider — a real implementation of the AI port, backed by deterministic rules.
 *
 * It is not a stub: it runs the same contract, returns the same Zod-validated types and
 * exercises the same pipeline branches. That is what makes Mock Mode a genuine end-to-end
 * test rather than a screenshot.
 */
import {
  detectMaterialUpdate,
  evaluateOilGasHeuristics,
  headlineSimilarity,
  incidentSimilarityVerdictSchema,
  incidentSummaryResultSchema,
  materialUpdateVerdictSchema,
  oilGasRelevanceResultSchema,
  scoreIncidentSimilarity,
  truncate,
  type ExtractedIncident,
  type IncidentSimilarityVerdict,
  type IncidentSummaryResult,
  type IncidentType,
  type MaterialUpdateVerdict,
  type OilGasRelevanceResult,
} from '@ogii/domain';
import type { AIProvider, AiResult, AiUsage, ArticleForAi, IncidentForAi } from './ai-provider';
import { extractIncidentHeuristically } from './heuristic-extraction';

function usage(durationMs = 0): AiUsage {
  return { provider: 'mock', model: 'rules-v1', promptTokens: 0, completionTokens: 0, durationMs, cached: false };
}

export class MockAiProvider implements AIProvider {
  readonly id = 'mock';
  readonly classifyModel = 'rules-v1';
  readonly extractModel = 'rules-v1';

  isAvailable(): boolean {
    return true;
  }

  async classifyOilAndGasRelevance(article: ArticleForAi): Promise<AiResult<OilGasRelevanceResult>> {
    const verdict = evaluateOilGasHeuristics({
      title: article.title,
      excerpt: article.excerpt,
      publisher: article.publisher,
      sourceTier: article.sourceTier,
    });
    return {
      value: oilGasRelevanceResultSchema.parse({
        isOilAndGasRelated: verdict.passed,
        // Rules are confident about clear cases and honest about the rest.
        confidence: verdict.passed ? Math.min(0.95, 0.55 + verdict.score / 200) : Math.max(0.05, 0.3 - verdict.score / 400),
        oilAndGasSector: verdict.sectorHint,
        isIncident: verdict.hasEventSignal,
        reason: verdict.reason,
      }),
      usage: usage(),
    };
  }

  async extractIncidentData(articles: readonly ArticleForAi[]): Promise<AiResult<ExtractedIncident>> {
    return { value: extractIncidentHeuristically(articles), usage: usage(1) };
  }

  async summarizeIncident(
    incident: IncidentForAi,
    articles: readonly ArticleForAi[],
  ): Promise<AiResult<IncidentSummaryResult>> {
    const publishers = [...new Set(articles.map((article) => article.publisher))];
    const facts = articles
      .map((article) => article.excerpt)
      .filter((excerpt): excerpt is string => excerpt !== null && excerpt.trim().length > 0);

    const summary = [
      incident.summary ?? `${incident.title}.`,
      facts.length > 0 ? facts[0] : null,
      `Reported by ${publishers.length} source${publishers.length === 1 ? '' : 's'}: ${publishers.slice(0, 5).join(', ')}.`,
    ]
      .filter((part): part is string => part !== null)
      .join('\n\n');

    return {
      value: incidentSummaryResultSchema.parse({
        summary,
        highlights: (await this.generateHighlights(incident, articles)).value,
      }),
      usage: usage(1),
    };
  }

  async generateHighlights(
    incident: IncidentForAi,
    articles: readonly ArticleForAi[],
  ): Promise<AiResult<string[]>> {
    const highlights: string[] = [];
    const add = (text: string): void => {
      if (highlights.length < 8 && !highlights.includes(text)) highlights.push(text);
    };

    add(truncate(incident.title, 180));
    if (incident.operator !== null) add(`Operator identified as ${incident.operator}.`);
    if (incident.asset !== null) add(`Asset involved: ${incident.asset}.`);
    if (incident.country !== null) add(`Location reported in ${incident.country}.`);
    if (incident.fatalities !== null) {
      add(
        incident.fatalities === 0
          ? 'No fatalities were reported by the available sources.'
          : `${incident.fatalities} fatality/fatalities reported.`,
      );
    }
    if (incident.injuries !== null && incident.injuries > 0) add(`${incident.injuries} injuries reported.`);
    for (const article of articles.slice(0, 4)) {
      if (article.excerpt !== null && article.excerpt.trim().length > 0) add(truncate(article.excerpt, 180));
    }
    while (highlights.length < 4 && articles.length > 0) {
      add(`Reported by ${articles[highlights.length % articles.length]?.publisher ?? 'a monitored source'}.`);
      if (highlights.length >= 4) break;
      break;
    }

    return { value: highlights, usage: usage() };
  }

  async compareIncidentSimilarity(
    a: IncidentForAi,
    b: IncidentForAi,
  ): Promise<AiResult<IncidentSimilarityVerdict>> {
    const toCandidate = (incident: IncidentForAi) => ({
      title: incident.title,
      incidentDate: incident.incidentDate,
      country: incident.country,
      operator: incident.operator,
      asset: incident.asset,
      field: null,
      // Pass the type through: dropping it threw away a real signal.
      incidentType: (incident.incidentType ?? null) as IncidentType | null,
    });

    const score = scoreIncidentSimilarity(toCandidate(a), toCandidate(b));
    const headline = headlineSimilarity(a.title, b.title);
    const sameIncident = score.decision === 'same' || (score.decision === 'review' && headline >= 0.7);

    /*
     * Confidence is how sure the verdict is, NOT the raw weighted similarity.
     *
     * Returning the weighted score here was a bug: sparse local reports of one event
     * score around 0.37 because operator, asset and country are all missing, so the
     * verdict "same incident" arrived with a confidence the caller's 0.70 gate always
     * rejected. The result was one blowout filed as three separate incidents. When the
     * headlines are near-identical on the same date, a reader is confident, and so is
     * this stand-in.
     */
    const strength = Math.max(score.score, headline);
    const confidence = sameIncident
      ? Math.min(0.92, Math.max(0.72, strength))
      : Math.min(0.9, Math.max(0.5, 1 - strength));

    return {
      value: incidentSimilarityVerdictSchema.parse({
        sameIncident,
        confidence,
        reason: `${score.reason} Headline similarity ${headline.toFixed(2)}.`,
      }),
      usage: usage(),
    };
  }

  async determineMaterialUpdate(
    existing: IncidentForAi,
    incoming: ArticleForAi,
  ): Promise<AiResult<MaterialUpdateVerdict>> {
    const extracted = extractIncidentHeuristically([incoming]);
    const snapshot = {
      fatalities: existing.fatalities,
      injuries: existing.injuries,
      missingPersons: null,
      evacuatedPersons: null,
      severity: 'moderate',
      severityScore: 45,
      environmentalImpact: null,
      productionImpact: null,
      shutdown: null,
      operator: existing.operator,
      asset: existing.asset,
      wellName: null,
      isWellIntegrityRelated: null,
      wellIntegrityCategory: null,
      suspectedFailedComponent: null,
      barrierFunctionImpacted: null,
      isProcessSafetyEvent: null,
      processSafetyCategory: null,
      cause: null,
      hasOfficialSource: false,
      incidentDate: existing.incidentDate,
    };
    const result = detectMaterialUpdate(snapshot, {
      ...snapshot,
      fatalities: extracted.fatalities ?? existing.fatalities,
      injuries: extracted.injuries ?? existing.injuries,
      missingPersons: extracted.missingPersons,
      environmentalImpact: extracted.environmentalImpact,
      productionImpact: extracted.productionImpact,
      operator: extracted.operator ?? existing.operator,
      hasOfficialSource: incoming.sourceTier === 1,
    });

    return {
      value: materialUpdateVerdictSchema.parse({
        isMaterialUpdate: result.isMaterialUpdate,
        confidence: result.isMaterialUpdate ? 0.8 : 0.85,
        changeTypes: [...result.changes],
        reason: result.reason,
        headline: result.isMaterialUpdate ? truncate(incoming.title, 120) : null,
      }),
      usage: usage(),
    };
  }
}
