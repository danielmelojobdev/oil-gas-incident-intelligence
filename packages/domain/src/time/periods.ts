/**
 * Time-window arithmetic.
 *
 * Decision D8: the primary axis is `incident_date`. An article published today about an
 * event six months ago must NOT appear in the "last 30 days" feed.
 */
import type { DateAxis, SearchPeriod } from '../taxonomy';

export interface TimeWindow {
  /** Inclusive lower bound, `YYYY-MM-DD`. `null` for all-time. */
  readonly fromDate: string | null;
  /** Inclusive upper bound, `YYYY-MM-DD`. */
  readonly toDate: string;
  readonly period: SearchPeriod;
  readonly axis: DateAxis;
  readonly days: number | null;
}

export const PERIOD_DAYS: Readonly<Record<SearchPeriod, number | null>> = {
  today: 0,
  last_7_days: 7,
  last_14_days: 14,
  last_30_days: 30,
  all_time: null,
};

/** `YYYY-MM-DD` in UTC. */
export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function parseIsoDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

export function daysBetween(a: string, b: string): number | null {
  const dateA = parseIsoDate(a);
  const dateB = parseIsoDate(b);
  if (dateA === null || dateB === null) return null;
  return Math.round((dateA.getTime() - dateB.getTime()) / 86_400_000);
}

/**
 * Resolves a period into a concrete window.
 * `now` is injected — the domain package never reads the clock by itself.
 */
export function resolveTimeWindow(
  period: SearchPeriod,
  now: Date,
  axis: DateAxis = 'incident_date',
): TimeWindow {
  const toDate = toIsoDate(now);
  const days = PERIOD_DAYS[period];
  if (days === null) return { fromDate: null, toDate, period, axis, days: null };
  // "today" = 0 days back, i.e. the current UTC day only.
  const fromDate = toIsoDate(addDays(now, -days));
  return { fromDate, toDate, period, axis, days };
}

/** Explicit from/to overrides the period when both are supplied. */
export function resolveExplicitWindow(
  from: string | null,
  to: string | null,
  period: SearchPeriod,
  now: Date,
  axis: DateAxis = 'incident_date',
): TimeWindow {
  if (from !== null && parseIsoDate(from) !== null) {
    return {
      fromDate: from,
      toDate: to !== null && parseIsoDate(to) !== null ? to : toIsoDate(now),
      period,
      axis,
      days: null,
    };
  }
  return resolveTimeWindow(period, now, axis);
}

/** Is `date` (YYYY-MM-DD) inside the window? Unknown dates are never inside. */
export function isWithinWindow(date: string | null | undefined, window: TimeWindow): boolean {
  if (date === null || date === undefined) return false;
  if (window.fromDate !== null && date < window.fromDate) return false;
  if (date > window.toDate) return false;
  return true;
}

/**
 * Chooses the date to filter on.
 *
 * When the incident date is unknown we fall back to the publication date as a clearly
 * flagged proxy — otherwise a breaking story with no stated date would be invisible.
 */
export function effectiveFilterDate(
  incidentDate: string | null | undefined,
  publishedAt: string | null | undefined,
  axis: DateAxis,
): { date: string | null; isEstimated: boolean } {
  if (axis === 'published_at') {
    return { date: publishedAt?.slice(0, 10) ?? null, isEstimated: false };
  }
  if (incidentDate !== null && incidentDate !== undefined && incidentDate !== '') {
    return { date: incidentDate, isEstimated: false };
  }
  const fallback = publishedAt?.slice(0, 10) ?? null;
  return { date: fallback, isEstimated: fallback !== null };
}

/** "18 min ago" / "3 h ago" / "2 d ago" — used on feed cards. */
export function relativeTime(from: string | Date, now: Date): string {
  const timestamp = typeof from === 'string' ? Date.parse(from) : from.getTime();
  if (Number.isNaN(timestamp)) return '';
  const diffSeconds = Math.max(0, Math.round((now.getTime() - timestamp) / 1000));
  if (diffSeconds < 60) return 'just now';
  const minutes = Math.round(diffSeconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} d ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months} mo ago`;
  return `${Math.round(months / 12)} y ago`;
}

/** Human date for cards and PDF: `12 Sep 2026`. */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

export function formatDisplayDate(value: string | null | undefined): string {
  if (value === null || value === undefined || value === '') return 'Date not reported';
  const date = parseIsoDate(value.slice(0, 10));
  if (date === null) return 'Date not reported';
  const month = MONTHS[date.getUTCMonth()] ?? '';
  return `${String(date.getUTCDate()).padStart(2, '0')} ${month} ${date.getUTCFullYear()}`;
}

export function formatDisplayDateTime(value: string | null | undefined): string {
  if (value === null || value === undefined || value === '') return 'Not reported';
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return 'Not reported';
  const date = new Date(timestamp);
  const month = MONTHS[date.getUTCMonth()] ?? '';
  const hh = String(date.getUTCHours()).padStart(2, '0');
  const mm = String(date.getUTCMinutes()).padStart(2, '0');
  return `${String(date.getUTCDate()).padStart(2, '0')} ${month} ${date.getUTCFullYear()} ${hh}:${mm} UTC`;
}
