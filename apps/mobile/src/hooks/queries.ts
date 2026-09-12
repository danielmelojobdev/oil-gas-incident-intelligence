/**
 * TanStack Query hooks — the only place the app reads server state.
 *
 * Query keys are structured so that a targeted invalidation (one incident, or the
 * whole feed) is cheap and obvious at the call site.
 */
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import type {
  Dashboard,
  IncidentDetail,
  IncidentFilters,
  IncidentPage,
  IncidentSummaryCard,
  NewsSource,
  ScanRun,
  UserIncidentState,
} from '@ogii/domain';
import { getRepository } from '../data';
import type { AppMeta, ScanStatus } from '../data/repository';

export const queryKeys = {
  meta: ['meta'] as const,
  incidents: (filters: IncidentFilters) => ['incidents', filters] as const,
  incident: (id: string) => ['incident', id] as const,
  dashboard: ['dashboard'] as const,
  sources: ['sources'] as const,
  scanStatus: ['scan', 'status'] as const,
  scanRun: (id: string) => ['scan', 'run', id] as const,
  incidentStates: ['incidentStates'] as const,
};

export function useMeta(): UseQueryResult<AppMeta> {
  return useQuery({
    queryKey: queryKeys.meta,
    queryFn: () => getRepository().getMeta(),
    staleTime: 10 * 60 * 1000,
  });
}

/** Paginated feed. `fetchNextPage` drives the infinite list. */
export function useIncidents(filters: IncidentFilters) {
  return useInfiniteQuery({
    queryKey: queryKeys.incidents(filters),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => getRepository().listIncidents({ ...filters, cursor: pageParam }),
    getNextPageParam: (lastPage: IncidentPage) => lastPage.nextCursor,
    staleTime: 60 * 1000,
  });
}

/** Flattens infinite-query pages into a single list for the FlatList. */
export function flattenPages(pages: readonly IncidentPage[] | undefined): IncidentSummaryCard[] {
  return (pages ?? []).flatMap((page) => page.items);
}

export function useIncident(id: string | undefined): UseQueryResult<IncidentDetail | null> {
  return useQuery({
    queryKey: queryKeys.incident(id ?? ''),
    queryFn: () => (id === undefined ? Promise.resolve(null) : getRepository().getIncident(id)),
    enabled: id !== undefined && id !== '',
    staleTime: 60 * 1000,
  });
}

export function useDashboard(): UseQueryResult<Dashboard> {
  return useQuery({
    queryKey: queryKeys.dashboard,
    queryFn: () => getRepository().getDashboard(),
    staleTime: 2 * 60 * 1000,
  });
}

export function useSources(): UseQueryResult<NewsSource[]> {
  return useQuery({
    queryKey: queryKeys.sources,
    queryFn: () => getRepository().listSources(),
    staleTime: 30 * 60 * 1000,
  });
}

export function useScanStatus(pollMs: number | false = false): UseQueryResult<ScanStatus> {
  return useQuery({
    queryKey: queryKeys.scanStatus,
    queryFn: () => getRepository().getScanStatus(),
    refetchInterval: pollMs,
    staleTime: 15 * 1000,
  });
}

export function useScanRun(scanId: string | null, pollMs: number | false): UseQueryResult<ScanRun | null> {
  return useQuery({
    queryKey: queryKeys.scanRun(scanId ?? ''),
    queryFn: () => (scanId === null ? Promise.resolve(null) : getRepository().getScanRun(scanId)),
    enabled: scanId !== null,
    refetchInterval: pollMs,
  });
}

/** Optimistic save / archive / read. */
export function useSetIncidentState(): UseMutationResult<
  void,
  Error,
  { id: string; state: UserIncidentState }
> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, state }) => getRepository().setIncidentState(id, state),
    onMutate: async ({ id, state }) => {
      await client.cancelQueries({ queryKey: queryKeys.incident(id) });
      const previous = client.getQueryData<IncidentDetail | null>(queryKeys.incident(id));
      if (previous !== undefined && previous !== null) {
        client.setQueryData<IncidentDetail>(queryKeys.incident(id), { ...previous, userState: state });
      }
      return { previous };
    },
    onError: (_error, variables, context) => {
      const previous = (context as { previous?: IncidentDetail | null } | undefined)?.previous;
      if (previous !== undefined) client.setQueryData(queryKeys.incident(variables.id), previous);
    },
    onSettled: () => {
      void client.invalidateQueries({ queryKey: ['incidents'] });
      void client.invalidateQueries({ queryKey: queryKeys.dashboard });
    },
  });
}

export function useStartScan(): UseMutationResult<{ scanId: string; accepted: boolean; message: string }, Error, void> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => getRepository().startScan(),
    onSettled: () => {
      void client.invalidateQueries({ queryKey: queryKeys.scanStatus });
    },
  });
}

/** Invalidates everything that a completed scan could have changed. */
export function useRefreshAfterScan(): () => void {
  const client = useQueryClient();
  return () => {
    void client.invalidateQueries({ queryKey: ['incidents'] });
    void client.invalidateQueries({ queryKey: queryKeys.dashboard });
    void client.invalidateQueries({ queryKey: queryKeys.scanStatus });
  };
}
