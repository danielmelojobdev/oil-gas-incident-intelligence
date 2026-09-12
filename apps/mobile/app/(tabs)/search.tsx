/** Search & History (brief sections 38 and 39). */
import { useCallback, useMemo, useState } from 'react';
import { FlatList, ScrollView, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import {
  CONFIDENCE_LEVELS,
  ENVIRONMENTS,
  INCIDENT_TYPES,
  LIFECYCLE_STAGES,
  OIL_GAS_SECTORS,
  SEARCH_PERIODS,
  SEVERITIES,
  label,
  type IncidentSummaryCard,
} from '@ogii/domain';
import { useTheme } from '../../src/theme';
import { Button, Chip, Row, Screen, Spinner, Txt } from '../../src/components/primitives';
import { IncidentCard } from '../../src/components/incident-card';
import { EmptyState, ErrorState } from '../../src/components/states';
import { flattenPages, useIncidents } from '../../src/hooks/queries';
import { buildFilters, useFilterStore } from '../../src/state/filter-store';

function FilterGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): React.JSX.Element {
  const theme = useTheme();
  return (
    <View style={{ gap: theme.spacing.xs, marginBottom: theme.spacing.md }}>
      <Txt variant="label" muted uppercase>
        {title}
      </Txt>
      <Row gap={theme.spacing.xs} wrap>
        {children}
      </Row>
    </View>
  );
}

export default function SearchScreen(): React.JSX.Element {
  const theme = useTheme();
  const now = useMemo(() => new Date(), []);
  const [showFilters, setShowFilters] = useState(false);

  const store = useFilterStore();
  const [draft, setDraft] = useState(store.searchTerm);

  const filters = useMemo(
    () =>
      buildFilters(useFilterStore.getState(), {
        // History searches the whole archive, not just the feed window.
        period: store.searchTerm.trim() === '' ? store.period : 'all_time',
        feedFilter: 'all',
        includeArchived: true,
        sort: 'incident_date_desc',
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      store.searchTerm,
      store.period,
      store.severities,
      store.confidences,
      store.sectors,
      store.environments,
      store.lifecycleStages,
      store.incidentTypes,
      store.wellIntegrityOnly,
      store.processSafetyOnly,
    ],
  );

  const query = useIncidents(filters);
  const incidents = flattenPages(query.data?.pages);
  const activeCount = store.activeAdvancedCount();

  const submit = useCallback(() => {
    store.setSearchTerm(draft);
  }, [draft, store]);

  return (
    <Screen padded={false}>
      <View style={{ padding: theme.layout.screenPadding, gap: theme.spacing.sm }}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={submit}
          onBlur={submit}
          placeholder="Keyword, operator, country, asset, field, well…"
          placeholderTextColor={theme.colors.textFaint}
          returnKeyType="search"
          autoCorrect={false}
          accessibilityLabel="Search incidents"
          style={{
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border,
            borderWidth: 1,
            borderRadius: theme.radius.md,
            paddingHorizontal: theme.spacing.md,
            paddingVertical: theme.spacing.md,
            color: theme.colors.text,
            fontSize: 15,
          }}
        />

        <Row justify="space-between">
          <Button
            title={showFilters ? 'Hide filters' : `Filters${activeCount > 0 ? ` (${activeCount})` : ''}`}
            variant="secondary"
            onPress={() => setShowFilters((value) => !value)}
          />
          {activeCount > 0 || store.searchTerm !== '' ? (
            <Button
              title="Clear"
              variant="ghost"
              onPress={() => {
                store.clearAdvanced();
                store.setSearchTerm('');
                setDraft('');
              }}
            />
          ) : null}
        </Row>
      </View>

      {showFilters ? (
        <ScrollView
          style={{ maxHeight: 340 }}
          contentContainerStyle={{ paddingHorizontal: theme.layout.screenPadding, paddingBottom: theme.spacing.md }}
        >
          <FilterGroup title="Date range">
            {SEARCH_PERIODS.map((period) => (
              <Chip
                key={period}
                label={label(period)}
                selected={store.period === period}
                onPress={() => store.setPeriod(period)}
              />
            ))}
          </FilterGroup>

          <FilterGroup title="Severity">
            {SEVERITIES.map((severity) => (
              <Chip
                key={severity}
                label={label(severity)}
                selected={store.severities.includes(severity)}
                onPress={() => store.toggleSeverity(severity)}
              />
            ))}
          </FilterGroup>

          <FilterGroup title="Confidence">
            {CONFIDENCE_LEVELS.map((confidence) => (
              <Chip
                key={confidence}
                label={label(confidence)}
                selected={store.confidences.includes(confidence)}
                onPress={() => store.toggleConfidence(confidence)}
              />
            ))}
          </FilterGroup>

          <FilterGroup title="Sector">
            {OIL_GAS_SECTORS.map((sector) => (
              <Chip
                key={sector}
                label={label(sector)}
                selected={store.sectors.includes(sector)}
                onPress={() => store.toggleSector(sector)}
              />
            ))}
          </FilterGroup>

          <FilterGroup title="Environment">
            {ENVIRONMENTS.map((environment) => (
              <Chip
                key={environment}
                label={label(environment)}
                selected={store.environments.includes(environment)}
                onPress={() => store.toggleEnvironment(environment)}
              />
            ))}
          </FilterGroup>

          <FilterGroup title="Life-cycle stage">
            {LIFECYCLE_STAGES.map((stage) => (
              <Chip
                key={stage}
                label={label(stage)}
                selected={store.lifecycleStages.includes(stage)}
                onPress={() => store.toggleLifecycleStage(stage)}
              />
            ))}
          </FilterGroup>

          <FilterGroup title="Incident type">
            {INCIDENT_TYPES.map((type) => (
              <Chip
                key={type}
                label={label(type)}
                selected={store.incidentTypes.includes(type)}
                onPress={() => store.toggleIncidentType(type)}
              />
            ))}
          </FilterGroup>

          <FilterGroup title="Classification">
            <Chip
              label="Well Integrity only"
              selected={store.wellIntegrityOnly}
              onPress={() => store.setWellIntegrityOnly(!store.wellIntegrityOnly)}
            />
            <Chip
              label="Process Safety only"
              selected={store.processSafetyOnly}
              onPress={() => store.setProcessSafetyOnly(!store.processSafetyOnly)}
            />
          </FilterGroup>
        </ScrollView>
      ) : null}

      {query.isError ? (
        <ErrorState
          message={query.error instanceof Error ? query.error.message : 'Search failed.'}
          onRetry={() => void query.refetch()}
        />
      ) : query.isLoading ? (
        <Spinner label="Searching" />
      ) : (
        <FlatList
          data={incidents}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{
            paddingHorizontal: theme.layout.screenPadding,
            paddingBottom: theme.spacing.xxxl,
            gap: theme.layout.cardGap,
          }}
          ListHeaderComponent={
            <Txt variant="caption" faint uppercase style={{ marginBottom: theme.spacing.xs }}>
              {query.data?.pages[0]?.total ?? 0} results
            </Txt>
          }
          renderItem={({ item }: { item: IncidentSummaryCard }) => (
            <IncidentCard
              incident={item}
              now={now}
              onPress={() => router.push({ pathname: '/incident/[id]', params: { id: item.id } })}
            />
          )}
          onEndReachedThreshold={0.4}
          onEndReached={() => {
            if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
          }}
          ListFooterComponent={query.isFetchingNextPage ? <Spinner /> : null}
          ListEmptyComponent={
            <EmptyState
              title="No incidents match"
              message="Try a different keyword, widen the date range, or clear some filters."
            />
          }
        />
      )}
    </Screen>
  );
}
