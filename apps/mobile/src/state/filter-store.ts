/** Transient UI filter state for the Home feed and the Search screen. */
import { create } from 'zustand';
import {
  incidentFiltersSchema,
  type ConfidenceLevel,
  type FeedFilter,
  type IncidentEnvironment,
  type IncidentFilters,
  type IncidentType,
  type LifecycleStage,
  type OilGasSector,
  type SearchPeriod,
  type Severity,
} from '@ogii/domain';

export interface FilterState {
  readonly feedFilter: FeedFilter;
  readonly period: SearchPeriod;
  readonly searchTerm: string;
  readonly sectors: OilGasSector[];
  readonly severities: Severity[];
  readonly confidences: ConfidenceLevel[];
  readonly environments: IncidentEnvironment[];
  readonly lifecycleStages: LifecycleStage[];
  readonly incidentTypes: IncidentType[];
  readonly countries: string[];
  readonly operators: string[];
  readonly wellIntegrityOnly: boolean;
  readonly processSafetyOnly: boolean;
  setFeedFilter: (filter: FeedFilter) => void;
  setPeriod: (period: SearchPeriod) => void;
  setSearchTerm: (term: string) => void;
  toggleSeverity: (severity: Severity) => void;
  toggleConfidence: (confidence: ConfidenceLevel) => void;
  toggleSector: (sector: OilGasSector) => void;
  toggleEnvironment: (environment: IncidentEnvironment) => void;
  toggleLifecycleStage: (stage: LifecycleStage) => void;
  toggleIncidentType: (type: IncidentType) => void;
  toggleCountry: (country: string) => void;
  toggleOperator: (operator: string) => void;
  setWellIntegrityOnly: (value: boolean) => void;
  setProcessSafetyOnly: (value: boolean) => void;
  clearAdvanced: () => void;
  activeAdvancedCount: () => number;
}

function toggleValue<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

const emptyAdvanced = {
  sectors: [] as OilGasSector[],
  severities: [] as Severity[],
  confidences: [] as ConfidenceLevel[],
  environments: [] as IncidentEnvironment[],
  lifecycleStages: [] as LifecycleStage[],
  incidentTypes: [] as IncidentType[],
  countries: [] as string[],
  operators: [] as string[],
  wellIntegrityOnly: false,
  processSafetyOnly: false,
};

export const useFilterStore = create<FilterState>((set, get) => ({
  feedFilter: 'all',
  period: 'last_30_days',
  searchTerm: '',
  ...emptyAdvanced,

  setFeedFilter: (feedFilter) => set({ feedFilter }),
  setPeriod: (period) => set({ period }),
  setSearchTerm: (searchTerm) => set({ searchTerm }),
  toggleSeverity: (severity) => set({ severities: toggleValue(get().severities, severity) }),
  toggleConfidence: (confidence) => set({ confidences: toggleValue(get().confidences, confidence) }),
  toggleSector: (sector) => set({ sectors: toggleValue(get().sectors, sector) }),
  toggleEnvironment: (environment) => set({ environments: toggleValue(get().environments, environment) }),
  toggleLifecycleStage: (stage) => set({ lifecycleStages: toggleValue(get().lifecycleStages, stage) }),
  toggleIncidentType: (type) => set({ incidentTypes: toggleValue(get().incidentTypes, type) }),
  toggleCountry: (country) => set({ countries: toggleValue(get().countries, country) }),
  toggleOperator: (operator) => set({ operators: toggleValue(get().operators, operator) }),
  setWellIntegrityOnly: (wellIntegrityOnly) => set({ wellIntegrityOnly }),
  setProcessSafetyOnly: (processSafetyOnly) => set({ processSafetyOnly }),
  clearAdvanced: () => set({ ...emptyAdvanced }),
  activeAdvancedCount: () => {
    const state = get();
    return (
      state.sectors.length +
      state.severities.length +
      state.confidences.length +
      state.environments.length +
      state.lifecycleStages.length +
      state.incidentTypes.length +
      state.countries.length +
      state.operators.length +
      (state.wellIntegrityOnly ? 1 : 0) +
      (state.processSafetyOnly ? 1 : 0)
    );
  },
}));

/** Projects the UI filter state onto the domain filter object the repository expects. */
export function buildFilters(
  state: FilterState,
  overrides: Partial<IncidentFilters> = {},
): IncidentFilters {
  return incidentFiltersSchema.parse({
    period: state.period,
    feedFilter: state.feedFilter,
    query: state.searchTerm.trim() === '' ? null : state.searchTerm.trim(),
    sectors: state.sectors,
    severities: state.severities,
    confidences: state.confidences,
    environments: state.environments,
    lifecycleStages: state.lifecycleStages,
    incidentTypes: state.incidentTypes,
    countries: state.countries,
    operators: state.operators,
    wellIntegrityOnly: state.wellIntegrityOnly,
    processSafetyOnly: state.processSafetyOnly,
    ...overrides,
  });
}
