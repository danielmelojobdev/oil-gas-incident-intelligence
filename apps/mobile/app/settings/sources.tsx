/** Monitored sources and their tiers (brief sections 7 and 8). */
import { SectionList, View } from 'react-native';
import { SOURCE_TIER_LABELS, type NewsSource, type SourceTier } from '@ogii/domain';
import { useTheme } from '../../src/theme';
import { Row, Screen, Spinner, Txt } from '../../src/components/primitives';
import { InfoNote } from '../../src/components/states';
import { useSources } from '../../src/hooks/queries';

export default function SourcesScreen(): React.JSX.Element {
  const theme = useTheme();
  const query = useSources();

  if (query.isLoading) return <Spinner />;

  const sources = query.data ?? [];
  const tiers: SourceTier[] = [1, 2, 3, 4, 5];
  const sections = tiers
    .map((tier) => ({
      tier,
      title: SOURCE_TIER_LABELS[tier],
      data: sources.filter((source) => source.tier === tier),
    }))
    .filter((section) => section.data.length > 0);

  return (
    <Screen padded={false}>
      <SectionList
        sections={sections}
        keyExtractor={(item: NewsSource) => item.id}
        contentContainerStyle={{ padding: theme.layout.screenPadding, paddingBottom: theme.spacing.xxxl }}
        ListHeaderComponent={
          <View style={{ marginBottom: theme.spacing.lg }}>
            <InfoNote>
              Only publicly published feeds and documented APIs are used. Article bodies are never copied: the app
              stores metadata, a link to the publisher, and its own generated summary.
            </InfoNote>
          </View>
        }
        renderSectionHeader={({ section }) => (
          <View
            style={{
              backgroundColor: theme.colors.background,
              paddingTop: theme.spacing.lg,
              paddingBottom: theme.spacing.xs,
            }}
          >
            <Txt variant="label" color={theme.colors.tier[section.tier]} uppercase>
              {section.title}
            </Txt>
          </View>
        )}
        renderItem={({ item }) => (
          <View
            style={{
              paddingVertical: theme.spacing.sm,
              borderBottomWidth: 1,
              borderBottomColor: theme.colors.border,
            }}
          >
            <Row justify="space-between" gap={theme.spacing.sm}>
              <Txt variant="body" style={{ flex: 1 }}>
                {item.name}
              </Txt>
              {item.isOfficial ? (
                <Txt variant="caption" color={theme.colors.success} uppercase>
                  Official
                </Txt>
              ) : null}
            </Row>
            <Txt variant="caption" faint>
              {[item.country ?? 'International', item.feedUrl === null ? 'via search provider' : 'RSS feed'].join(' · ')}
            </Txt>
          </View>
        )}
      />
    </Screen>
  );
}
