/** Home / Feed (brief section 33). */
import { useCallback, useMemo, useState } from 'react';
import { FlatList, RefreshControl, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import {
  FEED_FILTERS,
  SEARCH_PERIODS,
  label,
  relativeTime,
  type FeedFilter,
  type IncidentSummaryCard,
  type SearchPeriod,
} from '@ogii/domain';
import { useTheme } from '../../src/theme';
import { Button, Chip, Row, Screen, Spinner, Txt } from '../../src/components/primitives';
import { IncidentCard } from '../../src/components/incident-card';
import { EmptyState, ErrorState, MockBanner } from '../../src/components/states';
import { ScanProgressSheet } from '../../src/components/scan-progress';
import { flattenPages, useIncidents, useMeta, useScanStatus } from '../../src/hooks/queries';
import { useScanController } from '../../src/hooks/use-scan';
import { buildFilters, useFilterStore } from '../../src/state/filter-store';
import { formatDisplayDateTime } from '../../src/lib/format';

const FILTER_LABELS: Readonly<Record<FeedFilter, string>> = {
  all: 'All',
  critical: 'Critical',
  well_integrity: 'Well Integrity',
  well_control: 'Well Control',
  offshore: 'Offshore',
  drilling: 'Drilling',
  production: 'Production',
  pipeline: 'Pipeline',
  refinery: 'Refinery',
  lng: 'LNG',
  fire: 'Fire',
  explosion: 'Explosion',
  leak_release: 'Leak / Release',
  spill: 'Spill',
};

const PERIODS: readonly SearchPeriod[] = SEARCH_PERIODS.filter((period) => period !== 'all_time');

export default function FeedScreen(): React.JSX.Element {
  const theme = useTheme();
  const now = useMemo(() => new Date(), []);
  const [refreshing, setRefreshing] = useState(false);

  const feedFilter = useFilterStore((state) => state.feedFilter);
  const period = useFilterStore((state) => state.period);
  const setFeedFilter = useFilterStore((state) => state.setFeedFilter);
  const setPeriod = useFilterStore((state) => state.setPeriod);

  const filters = useMemo(
    () => buildFilters(useFilterStore.getState(), { query: null, sort: 'incident_date_desc' }),
    // Only the two controls on this screen change the feed query.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [feedFilter, period],
  );

  const meta = useMeta();
  const scanStatus = useScanStatus();
  const scan = useScanController();
  const query = useIncidents(filters);
  const incidents = flattenPages(query.data?.pages);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await query.refetch();
    setRefreshing(false);
  }, [query]);

  const openIncident = useCallback((incident: IncidentSummaryCard) => {
    router.push({ pathname: '/incident/[id]', params: { id: incident.id } });
  }, []);

  const lastScanText =
    scanStatus.data?.run?.finishedAt == null
      ? 'No scan has completed yet.'
      : `Last scan completed at ${formatDisplayDateTime(scanStatus.data.run.finishedAt)}`;

  const header = (
    <View style={{ gap: theme.spacing.sm, paddingBottom: theme.spacing.sm }}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: theme.spacing.xs, paddingHorizontal: theme.layout.screenPadding }}
      >
        {PERIODS.map((item) => (
          <Chip key={item} label={label(item)} selected={period === item} onPress={() => setPeriod(item)} />
        ))}
      </ScrollView>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: theme.spacing.xs, paddingHorizontal: theme.layout.screenPadding }}
      >
        {FEED_FILTERS.map((item) => (
          <Chip
            key={item}
            label={FILTER_LABELS[item]}
            selected={feedFilter === item}
            onPress={() => setFeedFilter(item)}
          />
        ))}
      </ScrollView>

      <Row justify="space-between" style={{ paddingHorizontal: theme.layout.screenPadding }}>
        <Txt variant="caption" faint uppercase>
          {query.data?.pages[0]?.total ?? 0} incidents · {label(period)}
        </Txt>
        {scanStatus.data?.run?.finishedAt == null ? null : (
          <Txt variant="caption" faint>
            Scanned {relativeTime(scanStatus.data.run.finishedAt, now)}
          </Txt>
        )}
      </Row>
    </View>
  );

  return (
    <Screen padded={false}>
      {meta.data?.isMock === true && meta.data.mockBanner !== null ? (
        <MockBanner text={meta.data.mockBanner} />
      ) : null}

      {query.isError ? (
        <ErrorState
          message={query.error instanceof Error ? query.error.message : 'The feed could not be loaded.'}
          onRetry={() => void query.refetch()}
        />
      ) : query.isLoading ? (
        <Spinner label="Loading incidents" />
      ) : (
        <FlatList
          data={incidents}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={header}
          contentContainerStyle={{
            paddingHorizontal: theme.layout.screenPadding,
            paddingBottom: theme.spacing.xxxl,
            gap: theme.layout.cardGap,
          }}
          renderItem={({ item }) => (
            <IncidentCard incident={item} now={now} onPress={() => openIncident(item)} />
          )}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={theme.colors.accent} />
          }
          onEndReachedThreshold={0.4}
          onEndReached={() => {
            if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
          }}
          ListFooterComponent={
            query.isFetchingNextPage ? <Spinner /> : <View style={{ height: theme.spacing.lg }} />
          }
          ListEmptyComponent={
            <EmptyState
              title="No new Oil & Gas incidents found."
              message={lastScanText}
              actionLabel="Scan Again"
              onAction={() => void scan.start()}
            />
          }
        />
      )}

      <View
        style={{
          position: 'absolute',
          right: theme.spacing.lg,
          bottom: theme.spacing.lg,
        }}
      >
        <Button title="Scan Now" onPress={() => void scan.start()} loading={scan.isStarting} />
      </View>

      <ScanProgressSheet visible={scan.visible} run={scan.run} error={scan.error} onClose={scan.dismiss} />
    </Screen>
  );
}
