/** Data & privacy (brief section 59). */
import { useCallback, useState } from 'react';
import { Alert, ScrollView, Share, View } from 'react-native';
import { useTheme } from '../../src/theme';
import { Button, Chip, Row, Screen, Txt } from '../../src/components/primitives';
import { SettingsGroup, SettingsRow } from '../../src/components/settings';
import { InfoNote } from '../../src/components/states';
import { useSettingsStore } from '../../src/state/settings-store';
import { getRepository } from '../../src/data';
import { clearIdentity } from '../../src/data/identity';
import { cancelAllScheduled } from '../../src/notifications/push';

const RETENTION_OPTIONS = [90, 365, 730, 1825] as const;

export default function PrivacyScreen(): React.JSX.Element {
  const theme = useTheme();
  const retention = useSettingsStore((state) => state.dataRetentionDays);
  const setRetentionDays = useSettingsStore((state) => state.setRetentionDays);
  const resetAll = useSettingsStore((state) => state.resetAll);
  const [busy, setBusy] = useState<string | null>(null);

  const exportData = useCallback(async () => {
    setBusy('export');
    try {
      const data = await getRepository().exportUserData();
      await Share.share({
        message: JSON.stringify(data, null, 2),
        title: 'Your Oil & Gas Incident Intelligence data',
      });
    } catch (error) {
      Alert.alert('Export failed', error instanceof Error ? error.message : 'Unknown error.');
    } finally {
      setBusy(null);
    }
  }, []);

  const deleteData = useCallback(() => {
    Alert.alert(
      'Delete all personal data?',
      'This removes your saved incidents, read state, preferences and device registration. Incident intelligence itself is shared content and is not deleted. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setBusy('delete');
              try {
                await getRepository().deleteUserData();
                await cancelAllScheduled();
                await resetAll();
                await clearIdentity();
                Alert.alert('Deleted', 'Your personal data has been removed from this device and the backend.');
              } catch (error) {
                Alert.alert('Delete failed', error instanceof Error ? error.message : 'Unknown error.');
              } finally {
                setBusy(null);
              }
            })();
          },
        },
      ],
    );
  }, [resetAll]);

  return (
    <Screen padded={false}>
      <ScrollView contentContainerStyle={{ padding: theme.layout.screenPadding }}>
        <InfoNote>
          The app holds no credentials. API keys for news providers and AI models exist only on the backend, and the
          app never sees them. Your saved incidents and preferences are personal data; the incident records
          themselves are shared intelligence.
        </InfoNote>

        <View style={{ height: theme.spacing.lg }} />

        <Txt variant="label" muted uppercase style={{ marginBottom: theme.spacing.sm }}>
          Data retention
        </Txt>
        <Row gap={theme.spacing.xs} wrap style={{ marginBottom: theme.spacing.xl }}>
          {RETENTION_OPTIONS.map((days) => (
            <Chip
              key={days}
              label={days >= 365 ? `${Math.round(days / 365)} year${days >= 730 ? 's' : ''}` : `${days} days`}
              selected={retention === days}
              onPress={() => setRetentionDays(days)}
            />
          ))}
        </Row>

        <SettingsGroup title="Your rights">
          <SettingsRow
            title="Export personal data"
            subtitle="Everything we hold about you, as JSON"
            right={<Button title="Export" variant="secondary" onPress={() => void exportData()} loading={busy === 'export'} />}
          />
          <SettingsRow
            title="Delete personal data"
            subtitle="Saved incidents, state, preferences and device registration"
            destructive
            right={<Button title="Delete" variant="danger" onPress={deleteData} loading={busy === 'delete'} />}
          />
        </SettingsGroup>

        <SettingsGroup title="On this device">
          <SettingsRow
            title="Reset app settings"
            subtitle="Restores the default period, regions, languages and notification preferences"
            right={<Button title="Reset" variant="ghost" onPress={() => void resetAll()} />}
          />
        </SettingsGroup>
      </ScrollView>
    </Screen>
  );
}
