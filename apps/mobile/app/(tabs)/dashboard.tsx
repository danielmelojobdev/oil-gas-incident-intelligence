/** Dashboard (brief section 43). */
import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { PRODUCT } from '@ogii/domain';
import { useTheme } from '../../src/theme';
import { Card, Row, Screen, SectionHeader, Spinner, Txt } from '../../src/components/primitives';
import { BarList, Sparkline, StatTile } from '../../src/components/charts';
import { ErrorState, InfoNote, MockBanner } from '../../src/components/states';
import { useDashboard, useMeta } from '../../src/hooks/queries';
import { formatDisplayDateTime } from '../../src/lib/format';

export default function DashboardScreen(): React.JSX.Element {
  const theme = useTheme();
  const meta = useMeta();
  const query = useDashboard();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await query.refetch();
    setRefreshing(false);
  }, [query]);

  if (query.isLoading) return <Spinner label="Building dashboard" />;

  if (query.isError || query.data === undefined) {
    return (
      <Screen>
        <ErrorState
          message={query.error instanceof Error ? query.error.message : 'The dashboard could not be loaded.'}
          onRetry={() => void query.refetch()}
        />
      </Screen>
    );
  }

  const data = query.data;

  return (
    <Screen padded={false}>
      {meta.data?.isMock === true && meta.data.mockBanner !== null ? (
        <MockBanner text={meta.data.mockBanner} />
      ) : null}

      <ScrollView
        contentContainerStyle={{ padding: theme.layout.screenPadding, paddingBottom: theme.spacing.xxxl }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={theme.colors.accent} />
        }
      >
        <InfoNote>{PRODUCT.dataCaveat}</InfoNote>

        <SectionHeader title="Detected incidents" />
        <Row gap={theme.spacing.sm} wrap>
          <StatTile value={data.incidentsToday} caption="Today" />
          <StatTile value={data.incidentsLast7Days} caption="Last 7 days" />
          <StatTile value={data.incidentsLast30Days} caption="Last 30 days" />
        </Row>

        <SectionHeader title="Severity" />
        <Row gap={theme.spacing.sm} wrap>
          <StatTile value={data.criticalIncidents} caption="Critical" color={theme.colors.severity.critical} />
          <StatTile value={data.highSeverityIncidents} caption="High severity" color={theme.colors.severity.high} />
        </Row>

        <SectionHeader title="Environment" />
        <Row gap={theme.spacing.sm} wrap>
          <StatTile value={data.offshoreIncidents} caption="Offshore & subsea" />
          <StatTile value={data.onshoreIncidents} caption="Onshore" />
        </Row>

        <SectionHeader title="Well & process safety" />
        <Row gap={theme.spacing.sm} wrap>
          <StatTile value={data.wellIntegrityIncidents} caption="Well integrity" color={theme.colors.warning} />
          <StatTile value={data.wellControlIncidents} caption="Well control" color={theme.colors.warning} />
          <StatTile value={data.lossOfContainmentIncidents} caption="Loss of containment" />
        </Row>

        <SectionHeader title="Detections per day" subtitle="Last 30 days, by incident date" />
        <Card style={{ padding: theme.spacing.md }}>
          <Sparkline data={data.trend} />
        </Card>

        <SectionHeader title="Top operators" />
        <Card style={{ padding: theme.spacing.md }}>
          <BarList data={data.topOperators} />
        </Card>

        <SectionHeader title="Top countries" />
        <Card style={{ padding: theme.spacing.md }}>
          <BarList data={data.topCountries} color={theme.colors.info} />
        </Card>

        <SectionHeader title="Top incident types" />
        <Card style={{ padding: theme.spacing.md }}>
          <BarList data={data.topIncidentTypes} color={theme.colors.warning} />
        </Card>

        <SectionHeader title="Upstream / midstream / downstream" />
        <Card style={{ padding: theme.spacing.md }}>
          <BarList data={data.bySector} color={theme.colors.success} />
        </Card>

        <SectionHeader title="By life-cycle stage" />
        <Card style={{ padding: theme.spacing.md }}>
          <BarList data={data.byLifecycleStage} maxItems={11} />
        </Card>

        <SectionHeader title="By severity" />
        <Card style={{ padding: theme.spacing.md }}>
          <BarList data={data.bySeverity} color={theme.colors.severity.high} maxItems={4} />
        </Card>

        <View style={{ marginTop: theme.spacing.xl }}>
          <Txt variant="caption" faint align="center">
            Generated {formatDisplayDateTime(data.generatedAt)}
          </Txt>
        </View>
      </ScrollView>
    </Screen>
  );
}
