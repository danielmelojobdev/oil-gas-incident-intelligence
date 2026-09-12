/** Scanner settings and manual scan (brief sections 14 and 55). */
import { ScrollView, View } from 'react-native';
import { useTheme } from '../../src/theme';
import { Button, Row, Screen, Txt } from '../../src/components/primitives';
import { SettingsGroup, SettingsRow } from '../../src/components/settings';
import { InfoNote } from '../../src/components/states';
import { ScanProgressSheet } from '../../src/components/scan-progress';
import { useScanStatus, useSources } from '../../src/hooks/queries';
import { useScanController } from '../../src/hooks/use-scan';
import { formatDisplayDateTime } from '../../src/lib/format';

export default function ScannerSettingsScreen(): React.JSX.Element {
  const theme = useTheme();
  const status = useScanStatus(5000);
  const sources = useSources();
  const scan = useScanController();
  const run = status.data?.run ?? null;

  return (
    <Screen padded={false}>
      <ScrollView contentContainerStyle={{ padding: theme.layout.screenPadding }}>
        <InfoNote>
          Scanning runs on the backend on a schedule, so it does not depend on the app being open. Scan Now asks the
          backend to run immediately.
        </InfoNote>

        <View style={{ height: theme.spacing.lg }} />

        <SettingsGroup title="Schedule">
          <SettingsRow title="Frequency" value={status.data?.frequency ?? 'unknown'} />
          <SettingsRow
            title="Next scheduled scan"
            value={
              status.data?.nextScheduledRun == null ? 'Not scheduled' : formatDisplayDateTime(status.data.nextScheduledRun)
            }
          />
          <SettingsRow title="Sources monitored" value={String(sources.data?.length ?? 0)} />
          <SettingsRow title="Currently running" value={status.data?.running === true ? 'Yes' : 'No'} />
        </SettingsGroup>

        {run === null ? null : (
          <SettingsGroup title="Last run">
            <SettingsRow title="Status" value={run.status} />
            <SettingsRow title="Started" value={formatDisplayDateTime(run.startedAt)} />
            <SettingsRow
              title="Finished"
              value={run.finishedAt === null ? 'In progress' : formatDisplayDateTime(run.finishedAt)}
            />
            <SettingsRow
              title="Duration"
              value={run.durationMs === null ? '—' : `${(run.durationMs / 1000).toFixed(1)}s`}
            />
            <SettingsRow title="Queries generated" value={String(run.queriesGenerated)} />
            <SettingsRow title="Results found" value={String(run.resultsFound)} />
            <SettingsRow title="Articles analysed" value={String(run.articlesProcessed)} />
            <SettingsRow title="Rejected" value={String(run.resultsRejected)} />
            <SettingsRow title="Duplicates" value={String(run.duplicatesFound)} />
            <SettingsRow title="New incidents" value={String(run.newIncidents)} />
            <SettingsRow title="Updated incidents" value={String(run.updatedIncidents)} />
            <SettingsRow title="Notifications sent" value={String(run.notificationsSent)} />
            <SettingsRow title="AI calls" value={String(run.aiCalls)} />
          </SettingsGroup>
        )}

        {run !== null && run.providerResults.length > 0 ? (
          <SettingsGroup title="Provider results">
            {run.providerResults.map((result) => (
              <SettingsRow
                key={result.provider}
                title={result.provider}
                subtitle={`${result.queriesExecuted} queries · ${result.resultsFound} results · ${result.durationMs}ms`}
                value={result.healthy ? 'OK' : 'Degraded'}
              />
            ))}
          </SettingsGroup>
        ) : null}

        {run !== null && run.errors.length > 0 ? (
          <SettingsGroup title="Warnings">
            {run.errors.map((error, index) => (
              <SettingsRow key={index} title={error} />
            ))}
          </SettingsGroup>
        ) : null}

        <Row justify="center">
          <Button title="Scan Now" onPress={() => void scan.start()} loading={scan.isStarting} />
        </Row>

        {scan.error === null ? null : (
          <Txt variant="small" color={theme.colors.danger} align="center" style={{ marginTop: theme.spacing.md }}>
            {scan.error}
          </Txt>
        )}
      </ScrollView>

      <ScanProgressSheet visible={scan.visible} run={scan.run} error={scan.error} onClose={scan.dismiss} />
    </Screen>
  );
}
