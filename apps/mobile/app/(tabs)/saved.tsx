/** Saved and archived incidents (brief sections 39 and 40). */
import { useMemo, useState } from 'react';
import { FlatList } from 'react-native';
import { router } from 'expo-router';
import { incidentFiltersSchema, type UserIncidentState } from '@ogii/domain';
import { useTheme } from '../../src/theme';
import { Chip, Row, Screen, Spinner, Txt } from '../../src/components/primitives';
import { IncidentCard } from '../../src/components/incident-card';
import { EmptyState, ErrorState } from '../../src/components/states';
import { flattenPages, useIncidents } from '../../src/hooks/queries';

const TABS: readonly { state: UserIncidentState; label: string; empty: string }[] = [
  { state: 'saved', label: 'Saved', empty: 'Save an incident from its detail screen to keep it here.' },
  { state: 'monitoring', label: 'Monitoring', empty: 'Incidents you choose to monitor will appear here.' },
  { state: 'read', label: 'Read', empty: 'Incidents you have opened will appear here.' },
  { state: 'archived', label: 'Archived', empty: 'Archived incidents stay searchable but leave the feed.' },
];

export default function SavedScreen(): React.JSX.Element {
  const theme = useTheme();
  const now = useMemo(() => new Date(), []);
  const [active, setActive] = useState<UserIncidentState>('saved');

  const filters = useMemo(
    () =>
      incidentFiltersSchema.parse({
        period: 'all_time',
        states: [active],
        includeArchived: true,
        limit: 50,
      }),
    [active],
  );

  const query = useIncidents(filters);
  const incidents = flattenPages(query.data?.pages);
  const current = TABS.find((tab) => tab.state === active);

  return (
    <Screen padded={false}>
      <Row gap={theme.spacing.xs} wrap style={{ padding: theme.layout.screenPadding }}>
        {TABS.map((tab) => (
          <Chip
            key={tab.state}
            label={tab.label}
            selected={active === tab.state}
            onPress={() => setActive(tab.state)}
          />
        ))}
      </Row>

      {query.isError ? (
        <ErrorState
          message={query.error instanceof Error ? query.error.message : 'Could not load your incidents.'}
          onRetry={() => void query.refetch()}
        />
      ) : query.isLoading ? (
        <Spinner />
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
              {incidents.length} incidents
            </Txt>
          }
          renderItem={({ item }) => (
            <IncidentCard
              incident={item}
              now={now}
              onPress={() => router.push({ pathname: '/incident/[id]', params: { id: item.id } })}
            />
          )}
          ListEmptyComponent={
            <EmptyState title={`Nothing ${current?.label.toLowerCase() ?? 'here'} yet`} message={current?.empty ?? ''} />
          }
        />
      )}
    </Screen>
  );
}
