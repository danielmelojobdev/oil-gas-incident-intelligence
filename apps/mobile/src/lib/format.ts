/** Presentation helpers shared by the screens. */
import {
  formatDisplayDate,
  formatDisplayDateTime,
  label,
  relativeTime,
  type ConfidenceLevel,
  type Severity,
  type SourceTier,
} from '@ogii/domain';

export { formatDisplayDate, formatDisplayDateTime, label, relativeTime };

export const SEVERITY_LABEL: Readonly<Record<Severity, string>> = {
  low: 'LOW',
  moderate: 'MODERATE',
  high: 'HIGH',
  critical: 'CRITICAL',
};

export const CONFIDENCE_LABEL: Readonly<Record<ConfidenceLevel, string>> = {
  low: 'LOW',
  medium: 'MEDIUM',
  high: 'HIGH',
};

export const TIER_LABEL: Readonly<Record<SourceTier, string>> = {
  1: 'TIER 1 · OFFICIAL',
  2: 'TIER 2 · MAJOR NEWS',
  3: 'TIER 3 · INDUSTRY',
  4: 'TIER 4 · REGIONAL',
  5: 'TIER 5 · UNVERIFIED',
};

/** Joins the parts of a location, skipping the ones we do not know. */
export function joinDefined(parts: readonly (string | null | undefined)[], separator = ' · '): string {
  return parts.filter((part): part is string => part !== null && part !== undefined && part.trim() !== '').join(separator);
}

/** A count that may simply not have been reported. Never renders "0" for unknown. */
export function formatCount(value: number | null | undefined): string {
  return value === null || value === undefined ? 'Not reported' : String(value);
}

export function formatBoolean(value: boolean | null | undefined): string {
  if (value === null || value === undefined) return 'Not reported';
  return value ? 'Yes' : 'No';
}

export function pluralise(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
