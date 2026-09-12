import { beforeEach, describe, expect, it } from 'vitest';
import { buildFilters, useFilterStore } from '../src/state/filter-store';

describe('filter store', () => {
  beforeEach(() => {
    useFilterStore.getState().clearAdvanced();
    useFilterStore.getState().setFeedFilter('all');
    useFilterStore.getState().setPeriod('last_30_days');
    useFilterStore.getState().setSearchTerm('');
  });

  it('defaults to the last 30 days and no quick filter', () => {
    const filters = buildFilters(useFilterStore.getState());
    expect(filters.period).toBe('last_30_days');
    expect(filters.feedFilter).toBe('all');
    expect(filters.dateAxis).toBe('incident_date');
    expect(filters.query).toBeNull();
  });

  it('toggles a severity on and off', () => {
    const store = useFilterStore.getState();
    store.toggleSeverity('critical');
    expect(buildFilters(useFilterStore.getState()).severities).toEqual(['critical']);
    useFilterStore.getState().toggleSeverity('critical');
    expect(buildFilters(useFilterStore.getState()).severities).toEqual([]);
  });

  it('counts the active advanced filters', () => {
    const store = useFilterStore.getState();
    store.toggleSeverity('high');
    useFilterStore.getState().toggleEnvironment('offshore');
    useFilterStore.getState().setWellIntegrityOnly(true);
    expect(useFilterStore.getState().activeAdvancedCount()).toBe(3);
  });

  it('trims the search term and nulls an empty one', () => {
    useFilterStore.getState().setSearchTerm('   ');
    expect(buildFilters(useFilterStore.getState()).query).toBeNull();
    useFilterStore.getState().setSearchTerm('  Kestrel Deep  ');
    expect(buildFilters(useFilterStore.getState()).query).toBe('Kestrel Deep');
  });

  it('accepts overrides for screen-specific behaviour', () => {
    const filters = buildFilters(useFilterStore.getState(), { period: 'all_time', includeArchived: true });
    expect(filters.period).toBe('all_time');
    expect(filters.includeArchived).toBe(true);
  });

  it('clears every advanced filter at once', () => {
    const store = useFilterStore.getState();
    store.toggleSeverity('low');
    useFilterStore.getState().toggleSector('upstream');
    useFilterStore.getState().setProcessSafetyOnly(true);
    useFilterStore.getState().clearAdvanced();
    expect(useFilterStore.getState().activeAdvancedCount()).toBe(0);
  });
});
