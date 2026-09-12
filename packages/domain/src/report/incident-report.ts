/**
 * The PDF report model (brief section 41).
 *
 * Built here, in the pure domain, so that the same structure can be rendered by the
 * mobile PDF exporter today and by a server-side renderer (email digests) later.
 * The disclaimer and the "system-assessed" labelling are part of the model, so a
 * template change cannot silently drop them.
 */
import { PRODUCT } from '../config/defaults';
import type { Article, IncidentDetail } from '../schemas';
import { label } from '../taxonomy';
import { formatDisplayDate, formatDisplayDateTime } from '../time/periods';
import { SOURCE_TIER_LABELS } from '../taxonomy';

export interface ReportField {
  readonly label: string;
  readonly value: string;
  /** Suppressed fields are omitted entirely: the brief says show only known fields. */
  readonly known: boolean;
}

export interface ReportSource {
  readonly index: number;
  readonly publisher: string;
  readonly title: string;
  readonly publishedAt: string;
  readonly url: string;
  readonly tier: string;
}

export interface IncidentReport {
  readonly documentTitle: string;
  readonly incidentTitle: string;
  readonly generatedAt: string;
  readonly isMock: boolean;
  readonly overview: readonly ReportField[];
  readonly highlights: readonly string[];
  readonly summary: string;
  readonly consequences: readonly ReportField[];
  readonly assessment: readonly ReportField[];
  readonly sources: readonly ReportSource[];
  readonly disclaimer: string;
  readonly footer: string;
}

function field(labelText: string, value: string | null | undefined): ReportField {
  const known = value !== null && value !== undefined && value !== '' && value !== 'unknown';
  return { label: labelText, value: known ? String(value) : 'Not reported', known };
}

function countField(labelText: string, value: number | null): ReportField {
  // Section 25: `null` means not reported and must never be rendered as 0.
  return value === null
    ? { label: labelText, value: 'Not reported', known: false }
    : { label: labelText, value: String(value), known: true };
}

function boolField(labelText: string, value: boolean | null): ReportField {
  return value === null
    ? { label: labelText, value: 'Not reported', known: false }
    : { label: labelText, value: value ? 'Yes' : 'No', known: true };
}

function sortArticles(articles: readonly Article[]): Article[] {
  return [...articles].sort((a, b) => {
    if (a.sourceTier !== b.sourceTier) return a.sourceTier - b.sourceTier;
    const timeA = a.publishedAt === null ? 0 : Date.parse(a.publishedAt);
    const timeB = b.publishedAt === null ? 0 : Date.parse(b.publishedAt);
    return timeB - timeA;
  });
}

/**
 * Builds the report model.
 * `includeUnknownFields` controls whether "Not reported" rows are kept (the PDF keeps
 * the core overview rows for completeness but drops unknown optional rows).
 */
export function buildIncidentReport(incident: IncidentDetail, now: Date): IncidentReport {
  const overviewAll: ReportField[] = [
    field('Incident Date', formatDisplayDate(incident.incidentDate)),
    field('Incident Time', incident.incidentTime),
    field('Last Updated', formatDisplayDateTime(incident.lastUpdatedAt)),
    field('Country', incident.country),
    field('Location', [incident.city, incident.region].filter((part) => part !== null && part !== '').join(', ') || null),
    field('Basin', incident.basin),
    field('Block', incident.block),
    field('Operator', incident.operator),
    field('Company', incident.company),
    field('Drilling Contractor', incident.drillingContractor),
    field('Asset', incident.asset),
    field('Installation', incident.installation),
    field('Installation Type', incident.installationType === null ? null : label(incident.installationType)),
    field('Field', incident.field),
    field('Well', [incident.wellName, incident.wellNumber].filter((part) => part !== null && part !== '').join(' ') || null),
    field('Well Type', incident.wellType === null ? null : label(incident.wellType)),
    field('Well Status', incident.wellStatus === null ? null : label(incident.wellStatus)),
    field('Oil & Gas Sector', label(incident.oilGasSector)),
    field('Environment', label(incident.environment)),
    field('Water Depth', incident.waterDepthCategory === null ? null : label(incident.waterDepthCategory)),
    field('Life-Cycle Stage', label(incident.lifecycleStage)),
    field('Incident Type', label(incident.incidentType)),
    field('Well Integrity Category', incident.wellIntegrityCategory === null ? null : label(incident.wellIntegrityCategory)),
    field('Suspected Failed Component', incident.suspectedFailedComponent),
    field('Barrier Function Impacted', incident.barrierFunctionImpacted === null ? null : label(incident.barrierFunctionImpacted)),
    field('Process Safety Category', incident.processSafetyCategory === null ? null : label(incident.processSafetyCategory)),
  ];

  const assessment: ReportField[] = [
    {
      label: 'Severity',
      value: `${label(incident.severity)} (${incident.severityScore}/100) — ${PRODUCT.severityCaveat}`,
      known: true,
    },
    {
      label: 'Confidence',
      value: `${label(incident.confidence)} (${incident.confidenceScore}/100)`,
      known: true,
    },
    { label: 'Relevance Score', value: `${incident.relevanceScore}/100`, known: true },
    { label: 'Sources', value: String(incident.sourceCount), known: true },
    {
      label: 'Highest Source Tier',
      value: SOURCE_TIER_LABELS[incident.highestSourceTier],
      known: true,
    },
  ];

  const consequences: ReportField[] = [
    countField('Fatalities', incident.consequences.fatalities),
    countField('Injuries', incident.consequences.injuries),
    countField('Missing', incident.consequences.missingPersons),
    countField('Evacuated', incident.consequences.evacuatedPersons),
    boolField('Hydrocarbon Release', incident.consequences.hydrocarbonRelease),
    field('Environmental Impact', incident.consequences.environmentalImpact),
    field('Production Impact', incident.consequences.productionImpact),
    field('Asset Damage', incident.consequences.assetDamage),
  ];

  const sources: ReportSource[] = sortArticles(incident.articles).map((article, index) => ({
    index: index + 1,
    publisher: article.publisher,
    title: article.title,
    publishedAt: formatDisplayDate(article.publishedAt),
    url: article.originalUrl,
    tier: SOURCE_TIER_LABELS[article.sourceTier],
  }));

  return {
    documentTitle: 'OIL & GAS INCIDENT INTELLIGENCE REPORT',
    incidentTitle: incident.title,
    generatedAt: formatDisplayDateTime(now.toISOString()),
    isMock: incident.isMock,
    // Keep only rows we actually know, except the always-relevant classification rows.
    overview: overviewAll.filter(
      (row) =>
        row.known ||
        ['Incident Date', 'Country', 'Operator', 'Oil & Gas Sector', 'Environment', 'Incident Type'].includes(row.label),
    ),
    highlights: incident.highlights
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((highlight) => highlight.text),
    summary: incident.summary ?? 'No consolidated summary is available for this incident yet.',
    consequences,
    assessment,
    sources,
    disclaimer: PRODUCT.disclaimer,
    footer: `Generated by ${PRODUCT.name}`,
  };
}
