/** Mock Mode dataset (brief section 56). All data here is fictional and flagged `isMock`. */
import type { IncidentDetail } from '../schemas';
import { buildMockIncident } from './builders';
import { MOCK_INCIDENT_SPECS } from './specs';

export { MOCK_INCIDENT_SPECS } from './specs';
export { MOCK_BREAKING_ARTICLES } from './breaking';
export type { BreakingArticle } from './breaking';
export { buildMockIncident, EMPTY_CONSEQUENCES } from './builders';
export type { MockArticleSpec, MockIncidentSpec } from './builders';

/** The visible banner text. The UI must never render mock data without it. */
export const MOCK_BANNER = 'MOCK DATA — fictional incidents for testing. Not real events.';

/**
 * Materialises all 15 mock incidents relative to `now`, newest first.
 * Deterministic for a given `now`.
 */
export function buildMockDataset(now: Date): IncidentDetail[] {
  return MOCK_INCIDENT_SPECS.map((spec) => buildMockIncident(spec, now)).sort((a, b) =>
    (b.incidentDate ?? '') < (a.incidentDate ?? '') ? -1 : 1,
  );
}
