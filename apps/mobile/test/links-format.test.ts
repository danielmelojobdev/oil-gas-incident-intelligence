import { describe, expect, it } from 'vitest';
import { incidentDeepLink, parseIncidentDeepLink } from '../src/lib/deep-links';
import { formatBoolean, formatCount, joinDefined, pluralise } from '../src/lib/format';

describe('deep links', () => {
  it('round-trips an incident id', () => {
    const link = incidentDeepLink('mock-incident-offshore-fire-northstar');
    expect(link).toBe('ogii://incident/mock-incident-offshore-fire-northstar');
    expect(parseIncidentDeepLink(link)).toBe('mock-incident-offshore-fire-northstar');
  });

  it('handles ids that need encoding', () => {
    const id = 'a b/c';
    expect(parseIncidentDeepLink(incidentDeepLink(id))).toBe(id);
  });

  it('accepts an https universal link form', () => {
    expect(parseIncidentDeepLink('https://ogii.example.com/incident/abc-123')).toBe('abc-123');
  });

  it('rejects anything that is not an incident link', () => {
    expect(parseIncidentDeepLink('ogii://settings')).toBeNull();
    expect(parseIncidentDeepLink('not a url')).toBeNull();
    expect(parseIncidentDeepLink('javascript:alert(1)')).toBeNull();
  });
});

describe('formatting', () => {
  it('never renders an unreported count as zero', () => {
    expect(formatCount(null)).toBe('Not reported');
    expect(formatCount(undefined)).toBe('Not reported');
    expect(formatCount(0)).toBe('0');
    expect(formatCount(3)).toBe('3');
  });

  it('distinguishes unknown from false', () => {
    expect(formatBoolean(null)).toBe('Not reported');
    expect(formatBoolean(false)).toBe('No');
    expect(formatBoolean(true)).toBe('Yes');
  });

  it('joins only the parts it knows', () => {
    expect(joinDefined(['United Kingdom', null, '10 Sep 2026'])).toBe('United Kingdom · 10 Sep 2026');
    expect(joinDefined([null, undefined, ''])).toBe('');
  });

  it('pluralises source counts', () => {
    expect(pluralise(1, 'source')).toBe('1 source');
    expect(pluralise(4, 'source')).toBe('4 sources');
  });
});
