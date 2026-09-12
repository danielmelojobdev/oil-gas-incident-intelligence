/** Search settings: period, date axis, regions, languages (brief sections 11 and 12). */
import { ScrollView, View } from 'react-native';
import { DATE_AXES, LANGUAGES, LANGUAGE_LABELS, REGIONS, SEARCH_PERIODS, label } from '@ogii/domain';
import { useTheme } from '../../src/theme';
import { Chip, Row, Screen, Txt } from '../../src/components/primitives';
import { SettingsGroup } from '../../src/components/settings';
import { InfoNote } from '../../src/components/states';
import { useSettingsStore } from '../../src/state/settings-store';

function ChipGroup({ title, children, note }: { title: string; children: React.ReactNode; note?: string }): React.JSX.Element {
  const theme = useTheme();
  return (
    <View style={{ marginBottom: theme.spacing.xl }}>
      <Txt variant="label" muted uppercase style={{ marginBottom: theme.spacing.sm }}>
        {title}
      </Txt>
      <Row gap={theme.spacing.xs} wrap>
        {children}
      </Row>
      {note === undefined ? null : (
        <Txt variant="caption" faint style={{ marginTop: theme.spacing.xs }}>
          {note}
        </Txt>
      )}
    </View>
  );
}

export default function SearchSettingsScreen(): React.JSX.Element {
  const theme = useTheme();
  const state = useSettingsStore();

  return (
    <Screen padded={false}>
      <ScrollView contentContainerStyle={{ padding: theme.layout.screenPadding }}>
        <InfoNote>
          The default window is the last 30 days, filtered by the date the incident happened — not the date an
          article was published. An article published today about a six-month-old event will not appear in the
          30-day feed.
        </InfoNote>

        <View style={{ height: theme.spacing.lg }} />

        <ChipGroup title="Default period">
          {SEARCH_PERIODS.map((period) => (
            <Chip
              key={period}
              label={label(period)}
              selected={state.defaultPeriod === period}
              onPress={() => state.setDefaultPeriod(period)}
            />
          ))}
        </ChipGroup>

        <ChipGroup title="Filter by" note="Publication date is available for retrospective research.">
          {DATE_AXES.map((axis) => (
            <Chip
              key={axis}
              label={label(axis)}
              selected={state.defaultDateAxis === axis}
              onPress={() => state.setDateAxis(axis)}
            />
          ))}
        </ChipGroup>

        <ChipGroup title="Regions" note="Worldwide is the default. Selecting regions narrows the scan queries.">
          {REGIONS.filter((region) => region !== 'custom').map((region) => (
            <Chip
              key={region}
              label={label(region)}
              selected={state.regions.includes(region)}
              onPress={() => state.toggleRegion(region)}
            />
          ))}
        </ChipGroup>

        <ChipGroup
          title="Languages"
          note="Each language uses its own technical glossary, not a literal translation of the English terms."
        >
          {LANGUAGES.map((language) => (
            <Chip
              key={language}
              label={LANGUAGE_LABELS[language]}
              selected={state.languages.includes(language)}
              onPress={() => state.toggleLanguage(language)}
            />
          ))}
        </ChipGroup>

        <SettingsGroup footer="These settings shape the queries the backend scanner generates on your behalf." >
          <View />
        </SettingsGroup>
      </ScrollView>
    </Screen>
  );
}
