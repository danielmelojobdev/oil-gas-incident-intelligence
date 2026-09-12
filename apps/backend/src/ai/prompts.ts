/**
 * Prompts.
 *
 * Every prompt states the anti-hallucination contract explicitly, but the contract is
 * ENFORCED in code (`parseAiJson` + Zod), not by asking politely. The prompt version is
 * logged with each call so a behaviour change can be traced to a prompt change.
 */
import type { ArticleForAi, IncidentForAi } from './ai-provider';

export const PROMPT_VERSION = '2026-09-12.1';

const ANTI_HALLUCINATION = `
RULES — these override anything else:
1. Use ONLY facts stated in the supplied material. Never infer, estimate or complete from general knowledge.
2. If a value is not stated, return null. Never guess. Never return 0 for "not reported":
   0 means a source explicitly reported zero.
3. Never invent: fatalities, injuries, operator, company, location, asset, well, incident date,
   cause, failed component, environmental impact, or any technical failure.
4. Do not state a technical failure mode (barrier failure, component failure) unless the material
   explicitly reports it.
5. Return ONLY a single JSON object. No prose, no markdown, no code fences.
`.trim();

function renderArticle(article: ArticleForAi, index: number): string {
  return [
    `--- SOURCE ${index + 1} ---`,
    `Publisher: ${article.publisher} (source tier ${article.sourceTier}, 1 = official regulator, 5 = unverified)`,
    `Published: ${article.publishedAt ?? 'unknown'}`,
    `Language: ${article.language ?? 'unknown'}`,
    `Headline: ${article.title}`,
    `Excerpt: ${article.excerpt ?? '(no excerpt available)'}`,
  ].join('\n');
}

function renderIncident(incident: IncidentForAi): string {
  return [
    `Title: ${incident.title}`,
    `Date: ${incident.incidentDate ?? 'unknown'}`,
    `Country: ${incident.country ?? 'unknown'}`,
    `Operator: ${incident.operator ?? 'unknown'}`,
    `Asset: ${incident.asset ?? 'unknown'}`,
    `Type: ${incident.incidentType ?? 'unknown'}`,
    `Fatalities: ${incident.fatalities ?? 'not reported'}`,
    `Injuries: ${incident.injuries ?? 'not reported'}`,
    `Summary: ${incident.summary ?? '(none)'}`,
  ].join('\n');
}

export const SYSTEM_PROMPT =
  'You are an Oil & Gas process safety and well integrity analyst. You classify and extract ' +
  'structured facts from public news about incidents in the oil and gas industry. You are ' +
  'precise, conservative, and you never invent information.';

export function relevancePrompt(article: ArticleForAi): string {
  return `
Decide whether this article is about an ACCIDENT, INCIDENT or SAFETY EVENT in the OIL & GAS industry
(upstream, midstream or downstream — including refineries, LNG, pipelines, terminals and
petrochemical facilities that are directly part of the oil and gas chain).

REJECT (isOilAndGasRelated = false) when the article is about:
mining, civil construction, commercial aviation, ordinary road or rail accidents, residential or
commercial fires, agriculture, pharmaceutical or food industry, solar, wind or nuclear energy,
generic industry, or marine incidents unrelated to oil and gas.

REJECT when the article is market, price, earnings or corporate-deal news rather than an incident.

The isolated presence of the words "fire", "explosion", "accident" or "leak" is NOT sufficient.
There must be a clear relation to oil and gas operations.

${renderArticle(article, 0)}

${ANTI_HALLUCINATION}

Return exactly this JSON shape:
{
  "isOilAndGasRelated": boolean,
  "confidence": number between 0 and 1,
  "oilAndGasSector": "upstream" | "midstream" | "downstream" | "integrated" | "unknown",
  "isIncident": boolean or null,
  "reason": "one sentence"
}
`.trim();
}

export function extractionPrompt(articles: readonly ArticleForAi[]): string {
  return `
Extract structured information about ONE oil and gas incident from the sources below.
All sources describe the same event.

${articles.map(renderArticle).join('\n\n')}

Definitions:
- environment: "offshore" | "onshore" | "subsea" | "unknown".
- lifecycleStage: design | drilling | completion | commissioning | production | injection |
  intervention | workover | suspension | p_and_a | unknown.
- incidentType: fire, explosion, blowout, well_control, well_integrity, gas_leak, oil_leak,
  hydrocarbon_release, toxic_gas_release, loss_of_containment, oil_spill, pipeline_leak,
  pipeline_rupture, structural_failure, equipment_failure, emergency_shutdown, production_shutdown,
  evacuation, marine_incident, vessel_collision, helicopter_incident, crane_incident, dropped_object,
  fatality, injury, environmental_event, process_safety_event, other.
- wellIntegrityCategory (only if the material reports a well integrity issue):
  primary_barrier_failure, secondary_barrier_failure, multiple_barrier_failure, well_control, bop,
  wellhead, christmas_tree, tubing, casing, cement, packer, annulus, dhsv_scssv,
  subsea_safety_system, integrity_monitoring, loss_of_containment, structural_integrity, unknown.
- processSafetyCategory: loss_of_primary_containment, hydrocarbon_release, fire, explosion,
  toxic_gas_release, spill, overpressure, emergency_shutdown, structural_failure, unknown.
- installationType: fixed_platform, jack_up, semi_submersible, drillship, fpso, fso, tlp, spar,
  wellhead_platform, subsea_installation, refinery, pipeline, terminal, lng_facility,
  gas_processing_plant, compressor_station, storage_facility, unknown.
- severity: low | moderate | high | critical, based only on the reported consequences.
- summary: 1 to 3 short paragraphs, factual, no speculation, no adjectives of drama.
- highlights: 4 to 8 short bullet points, each supported by the sources.

Never state water depth. Never state a cause that is not reported. Never state a failed component
that is not reported.

${ANTI_HALLUCINATION}

Return exactly this JSON shape (use null for anything not stated):
{
  "isOilAndGasRelated": boolean,
  "oilAndGasSector": "upstream"|"midstream"|"downstream"|"integrated"|"unknown",
  "confidence": 0..1,
  "title": string,
  "summary": string,
  "highlights": string[],
  "incidentDate": "YYYY-MM-DD"|null,
  "incidentTime": "HH:MM"|null,
  "country": string|null,
  "countryCode": "XX"|null,
  "region": string|null,
  "city": string|null,
  "basin": string|null,
  "block": string|null,
  "field": string|null,
  "latitude": number|null,
  "longitude": number|null,
  "operator": string|null,
  "company": string|null,
  "licenceHolder": string|null,
  "drillingContractor": string|null,
  "serviceCompany": string|null,
  "pipelineOperator": string|null,
  "asset": string|null,
  "installation": string|null,
  "installationType": string|null,
  "vessel": string|null,
  "wellName": string|null,
  "wellNumber": string|null,
  "wellType": string|null,
  "wellStatus": string|null,
  "environment": string,
  "waterDepthCategory": string|null,
  "lifecycleStage": string,
  "incidentType": string,
  "secondaryIncidentTypes": string[],
  "isWellIntegrityRelated": boolean|null,
  "wellIntegrityCategory": string|null,
  "suspectedFailedComponent": string|null,
  "barrierFunctionImpacted": "primary"|"secondary"|"both"|"unknown"|null,
  "isProcessSafetyEvent": boolean|null,
  "processSafetyCategory": string|null,
  "severity": "low"|"moderate"|"high"|"critical",
  "fatalities": number|null,
  "injuries": number|null,
  "missingPersons": number|null,
  "evacuatedPersons": number|null,
  "hydrocarbonRelease": boolean|null,
  "environmentalImpact": string|null,
  "productionImpact": string|null,
  "assetDamage": string|null
}
`.trim();
}

export function summaryPrompt(incident: IncidentForAi, articles: readonly ArticleForAi[]): string {
  return `
Write a consolidated, professional summary of this oil and gas incident using only the sources below.

Known record:
${renderIncident(incident)}

Sources:
${articles.map(renderArticle).join('\n\n')}

Write 1 to 3 short paragraphs of FACTS only. Do not include any system classification
(severity, confidence, scores) in the prose. Then write 4 to 8 highlight bullets, each of which
must be supported by the sources. Where sources disagree, say so explicitly.

${ANTI_HALLUCINATION}

Return: { "summary": string, "highlights": string[] }
`.trim();
}

export function highlightsPrompt(incident: IncidentForAi, articles: readonly ArticleForAi[]): string {
  return `
Produce 4 to 8 short factual bullet points about this oil and gas incident.

${renderIncident(incident)}

Sources:
${articles.map(renderArticle).join('\n\n')}

Each bullet must be one sentence and must be supported by the sources. Do not speculate.
If the sources do not report casualties, you may state that no casualties were reported by the
available sources — but never state that there were none.

${ANTI_HALLUCINATION}

Return: { "summary": "", "highlights": string[] }
`.trim();
}

export function similarityPrompt(a: IncidentForAi, b: IncidentForAi): string {
  return `
Decide whether these two reports describe THE SAME real-world oil and gas incident,
or two different incidents.

REPORT A:
${renderIncident(a)}

REPORT B:
${renderIncident(b)}

Two reports are the same incident only if they describe the same event at the same facility
around the same time. Different wells, different installations, or different countries mean
different incidents, even if the descriptions are similar.

${ANTI_HALLUCINATION}

Return: { "sameIncident": boolean, "confidence": 0..1, "reason": "one sentence" }
`.trim();
}

export function materialUpdatePrompt(existing: IncidentForAi, incoming: ArticleForAi): string {
  return `
An incident is already recorded. A new article about it has arrived. Decide whether the new article
contains a MATERIAL UPDATE that would justify alerting a safety professional again.

Material: newly confirmed or revised fatalities, injuries or missing persons; major escalation;
major environmental impact; an official investigation update; an operator statement; a confirmed
cause; a production shutdown; an increase in severity; significant new well integrity or well
control information.

NOT material: republication of the same facts, syndicated copy, rewritten prose, background,
opinion, or market reaction.

EXISTING RECORD:
${renderIncident(existing)}

NEW ARTICLE:
${renderArticle(incoming, 0)}

${ANTI_HALLUCINATION}

Return: { "isMaterialUpdate": boolean, "confidence": 0..1, "changeTypes": string[], "reason": "one sentence", "headline": string|null }
`.trim();
}
