/** Product defaults. The brief is explicit about several of these. */
import type { DateAxis, LanguageCode, Region, ScanFrequency, SearchPeriod } from '../taxonomy';

/** Brief section 11: default period is the last 30 days. */
export const DEFAULT_PERIOD: SearchPeriod = 'last_30_days';
/** Brief section 12: filter by incident date, not publication date. */
export const DEFAULT_DATE_AXIS: DateAxis = 'incident_date';
/** Brief section 11: worldwide. */
export const DEFAULT_REGIONS: readonly Region[] = ['worldwide'];
export const DEFAULT_LANGUAGES: readonly LanguageCode[] = ['en', 'pt', 'es', 'no'];
export const DEFAULT_SCAN_FREQUENCY: ScanFrequency = 'every-6-hours';

export const DEFAULT_SCAN_LIMITS = {
  maxQueries: 40,
  maxResultsPerQuery: 25,
  maxAiExtractions: 40,
  /** Hard ceiling on articles considered in one run, whatever the providers return. */
  maxArticlesPerRun: 600,
} as const;

export const PRODUCT = {
  name: 'Oil & Gas Incident Intelligence',
  shortName: 'OGII',
  deepLinkScheme: 'ogii',
  disclaimer:
    'This report was automatically generated from publicly available information. ' +
    'Information should be verified against the original sources before being used for ' +
    'technical, operational, regulatory, safety or legal decisions.',
  dataCaveat:
    'Figures represent incidents detected by this system from the sources it monitors. ' +
    'They are not an official accident rate and are not a complete record of industry events.',
  severityCaveat: 'System-assessed severity — not an official classification.',
} as const;
