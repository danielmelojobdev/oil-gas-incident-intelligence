/** Notification preferences (brief section 36). */
import { useCallback, useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { INCIDENT_TYPES, SEVERITIES, label, incidentFiltersSchema } from '@ogii/domain';
import { useTheme } from '../../src/theme';
import { Button, Chip, Row, Screen, Txt } from '../../src/components/primitives';
import { SettingsGroup, SettingsRow, SettingsSwitch } from '../../src/components/settings';
import { InfoNote } from '../../src/components/states';
import { useSettingsStore } from '../../src/state/settings-store';
import { registerForPushNotifications, simulateIncidentAlert } from '../../src/notifications/push';
import { getRepository } from '../../src/data';
import { isMockMode } from '../../src/lib/config';

export default function NotificationSettingsScreen(): React.JSX.Element {
  const theme = useTheme();
  const notifications = useSettingsStore((state) => state.notifications);
  const setNotifications = useSettingsStore((state) => state.setNotifications);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const enable = useCallback(async () => {
    setBusy(true);
    const result = await registerForPushNotifications(notifications.sound);
    setStatus(result.reason);
    setNotifications({ enabled: result.granted });
    setBusy(false);
  }, [notifications.sound, setNotifications]);

  const sendTest = useCallback(async () => {
    setBusy(true);
    try {
      const page = await getRepository().listIncidents(
        incidentFiltersSchema.parse({ period: 'last_30_days', limit: 1, sort: 'severity_desc' }),
      );
      const incident = page.items[0];
      if (incident === undefined) {
        Alert.alert('No incidents', 'There is no incident to demonstrate a notification with yet.');
        return;
      }
      await simulateIncidentAlert(incident, notifications.sound);
      setStatus('A test alert will arrive in a couple of seconds. Tap it to open the incident.');
    } catch (error) {
      Alert.alert('Could not send', error instanceof Error ? error.message : 'Unknown error.');
    } finally {
      setBusy(false);
    }
  }, [notifications.sound]);

  return (
    <Screen padded={false}>
      <ScrollView contentContainerStyle={{ padding: theme.layout.screenPadding }}>
        <InfoNote>
          You are alerted when a new incident passes the relevance and confidence thresholds, and when an existing
          incident receives a MATERIAL update. A republished story with no new facts never triggers an alert.
        </InfoNote>

        <View style={{ height: theme.spacing.lg }} />

        <SettingsGroup title="Delivery">
          <SettingsSwitch
            title="Notifications"
            subtitle="Master switch"
            value={notifications.enabled}
            onValueChange={(value) => {
              if (value) void enable();
              else setNotifications({ enabled: false });
            }}
          />
          <SettingsSwitch
            title="Sound"
            value={notifications.sound}
            onValueChange={(sound) => setNotifications({ sound })}
            disabled={!notifications.enabled}
          />
          <SettingsSwitch
            title="Critical only"
            subtitle="Suppress everything below critical severity"
            value={notifications.criticalOnly}
            onValueChange={(criticalOnly) => setNotifications({ criticalOnly })}
            disabled={!notifications.enabled}
          />
        </SettingsGroup>

        <Txt variant="label" muted uppercase style={{ marginBottom: theme.spacing.sm }}>
          Minimum severity
        </Txt>
        <Row gap={theme.spacing.xs} wrap style={{ marginBottom: theme.spacing.xl }}>
          {SEVERITIES.map((severity) => (
            <Chip
              key={severity}
              label={label(severity)}
              selected={notifications.minSeverity === severity}
              onPress={() => setNotifications({ minSeverity: severity })}
            />
          ))}
        </Row>

        <SettingsGroup title="Specialist alerts">
          <SettingsSwitch
            title="Well integrity alerts"
            value={notifications.wellIntegrityAlerts}
            onValueChange={(wellIntegrityAlerts) => setNotifications({ wellIntegrityAlerts })}
          />
          <SettingsSwitch
            title="Well control alerts"
            value={notifications.wellControlAlerts}
            onValueChange={(wellControlAlerts) => setNotifications({ wellControlAlerts })}
          />
        </SettingsGroup>

        <Txt variant="label" muted uppercase style={{ marginBottom: theme.spacing.sm }}>
          Incident types ({notifications.incidentTypes.length === 0 ? 'all' : notifications.incidentTypes.length})
        </Txt>
        <Row gap={theme.spacing.xs} wrap style={{ marginBottom: theme.spacing.xl }}>
          {INCIDENT_TYPES.map((type) => (
            <Chip
              key={type}
              label={label(type)}
              selected={notifications.incidentTypes.includes(type)}
              onPress={() =>
                setNotifications({
                  incidentTypes: notifications.incidentTypes.includes(type)
                    ? notifications.incidentTypes.filter((item) => item !== type)
                    : [...notifications.incidentTypes, type],
                })
              }
            />
          ))}
        </Row>

        <SettingsGroup
          title="Test"
          footer={
            isMockMode
              ? 'Mock Mode delivers a real local notification, so the banner, the sound and the deep link can all be verified without a backend.'
              : 'A test alert is delivered locally; live alerts come from the scanner backend.'
          }
        >
          <SettingsRow
            title="Send a test alert"
            subtitle="Uses the highest-severity incident currently in the feed"
            right={<Button title="Send" variant="secondary" onPress={() => void sendTest()} loading={busy} />}
          />
        </SettingsGroup>

        {status === null ? null : (
          <Txt variant="small" muted>
            {status}
          </Txt>
        )}
      </ScrollView>
    </Screen>
  );
}
