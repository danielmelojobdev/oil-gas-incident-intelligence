/** Settings index (brief section 53). */
import { ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { PRODUCT, label } from '@ogii/domain';
import { useTheme } from '../../src/theme';
import { Row, Screen, Txt } from '../../src/components/primitives';
import { SettingsGroup, SettingsRow } from '../../src/components/settings';
import { MockBanner } from '../../src/components/states';
import { useMeta, useScanStatus, useSources } from '../../src/hooks/queries';
import { useSettingsStore } from '../../src/state/settings-store';
import { appConfig } from '../../src/lib/config';
import { formatDisplayDateTime } from '../../src/lib/format';

export default function SettingsScreen(): React.JSX.Element {
  const theme = useTheme();
  const meta = useMeta();
  const scanStatus = useScanStatus();
  const sources = useSources();
  const themePreference = useSettingsStore((state) => state.theme);
  const setTheme = useSettingsStore((state) => state.setTheme);
  const notifications = useSettingsStore((state) => state.notifications);
  const defaultPeriod = useSettingsStore((state) => state.defaultPeriod);
  const languages = useSettingsStore((state) => state.languages);

  const cycleTheme = (): void => {
    const order = ['system', 'light', 'dark'] as const;
    const next = order[(order.indexOf(themePreference) + 1) % order.length] ?? 'system';
    setTheme(next);
  };

  return (
    <Screen padded={false}>
      {meta.data?.isMock === true && meta.data.mockBanner !== null ? (
        <MockBanner text={meta.data.mockBanner} />
      ) : null}

      <ScrollView contentContainerStyle={{ padding: theme.layout.screenPadding }}>
        <SettingsGroup title="Scanner status">
          <SettingsRow
            title="Last scan"
            value={
              scanStatus.data?.run?.finishedAt == null
                ? 'Never'
                : formatDisplayDateTime(scanStatus.data.run.finishedAt)
            }
          />
          <SettingsRow
            title="Next scheduled scan"
            value={
              scanStatus.data?.nextScheduledRun == null
                ? 'Not scheduled'
                : formatDisplayDateTime(scanStatus.data.nextScheduledRun)
            }
          />
          <SettingsRow title="Scan frequency" value={scanStatus.data?.frequency ?? 'unknown'} />
          <SettingsRow title="Sources monitored" value={String(sources.data?.length ?? 0)} />
        </SettingsGroup>

        <SettingsGroup title="Profile">
          <SettingsRow title="Appearance" value={label(themePreference)} onPress={cycleTheme} />
          <SettingsRow title="Data mode" value={appConfig.dataMode === 'mock' ? 'Mock Mode' : 'Live backend'} />
        </SettingsGroup>

        <SettingsGroup title="Monitoring">
          <SettingsRow
            title="Search Settings"
            subtitle="Period, regions, languages, date axis"
            value={label(defaultPeriod)}
            onPress={() => router.push('/settings/search')}
          />
          <SettingsRow
            title="Keywords"
            subtitle="Include and exclude terms"
            onPress={() => router.push('/settings/keywords')}
          />
          <SettingsRow
            title="Notifications"
            value={notifications.enabled ? 'On' : 'Off'}
            onPress={() => router.push('/settings/notifications')}
          />
          <SettingsRow
            title="Scanner"
            subtitle="Run a scan and review the last run"
            onPress={() => router.push('/settings/scanner')}
          />
          <SettingsRow
            title="Sources"
            subtitle="Monitored publishers and regulators"
            value={`${sources.data?.length ?? 0}`}
            onPress={() => router.push('/settings/sources')}
          />
          <SettingsRow title="Languages" value={languages.join(', ').toUpperCase()} onPress={() => router.push('/settings/search')} />
        </SettingsGroup>

        <SettingsGroup title="Data">
          <SettingsRow
            title="Data & Privacy"
            subtitle="Export, delete, retention"
            onPress={() => router.push('/settings/privacy')}
          />
          <SettingsRow title="About" onPress={() => router.push('/settings/about')} />
        </SettingsGroup>

        <View style={{ marginTop: theme.spacing.md }}>
          <Row justify="center">
            <Txt variant="caption" faint align="center">
              {PRODUCT.name} v0.1.0
            </Txt>
          </Row>
        </View>
      </ScrollView>
    </Screen>
  );
}
