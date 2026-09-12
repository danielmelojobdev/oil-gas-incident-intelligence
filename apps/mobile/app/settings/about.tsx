/** About: what the product does, and — just as importantly — what it does not claim. */
import { ScrollView, View } from 'react-native';
import { PRODUCT } from '@ogii/domain';
import { useTheme } from '../../src/theme';
import { Row, Screen, Txt } from '../../src/components/primitives';
import { SettingsGroup, SettingsRow } from '../../src/components/settings';
import { InfoNote } from '../../src/components/states';
import { appConfig } from '../../src/lib/config';
import { useMeta } from '../../src/hooks/queries';

export default function AboutScreen(): React.JSX.Element {
  const theme = useTheme();
  const meta = useMeta();

  return (
    <Screen padded={false}>
      <ScrollView contentContainerStyle={{ padding: theme.layout.screenPadding }}>
        <Txt variant="title">{PRODUCT.name}</Txt>
        <Txt variant="small" muted style={{ marginTop: theme.spacing.xs }}>
          An Oil &amp; Gas safety and incident intelligence platform. It monitors public sources, rejects everything
          outside the oil and gas industry, groups the reports that describe the same event, and turns them into one
          structured incident record.
        </Txt>

        <View style={{ height: theme.spacing.xl }} />

        <SettingsGroup title="Build">
          <SettingsRow title="Version" value="0.1.0" />
          <SettingsRow title="Data mode" value={appConfig.dataMode === 'mock' ? 'Mock Mode' : 'Live backend'} />
          <SettingsRow title="Backend" value={appConfig.dataMode === 'api' ? appConfig.apiUrl : 'On device'} />
          <SettingsRow title="Scanner mode" value={meta.data?.mode ?? 'unknown'} />
        </SettingsGroup>

        <Txt variant="label" muted uppercase style={{ marginBottom: theme.spacing.sm }}>
          How to read this app
        </Txt>
        <View style={{ gap: theme.spacing.md, marginBottom: theme.spacing.xl }}>
          <InfoNote>
            {`${PRODUCT.severityCaveat} It is derived from the reported consequences combined with a model's opinion, and it is not a regulator's classification.`}
          </InfoNote>
          <InfoNote>{PRODUCT.dataCaveat}</InfoNote>
          <InfoNote>{PRODUCT.disclaimer}</InfoNote>
        </View>

        <SettingsGroup title="Sourcing policy">
          <SettingsRow
            title="Public sources only"
            subtitle="RSS feeds, official regulator publications and documented search APIs"
          />
          <SettingsRow
            title="No paywall circumvention"
            subtitle="Metadata and excerpts only; the full article always stays with the publisher"
          />
          <SettingsRow
            title="Always attributed"
            subtitle="Every incident links to every source behind it"
          />
        </SettingsGroup>

        <Row justify="center">
          <Txt variant="caption" faint>
            {PRODUCT.shortName} · built for Oil &amp; Gas safety professionals
          </Txt>
        </Row>
      </ScrollView>
    </Screen>
  );
}
