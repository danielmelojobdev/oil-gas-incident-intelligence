/**
 * The feed card (brief section 33).
 *
 * One card = one INCIDENT, never one article. The source count is a real count of
 * distinct publishers behind the record.
 */
import { View } from 'react-native';
import { label, relativeTime, formatDisplayDate, type IncidentSummaryCard } from '@ogii/domain';
import { useTheme } from '../theme';
import { Card, Row, Txt } from './primitives';
import { ConfidencePill, SeverityPill, SeverityRail, StatusTag } from './indicators';
import { joinDefined, pluralise } from '../lib/format';

export function IncidentCard({
  incident,
  onPress,
  now,
}: {
  incident: IncidentSummaryCard;
  onPress: () => void;
  now: Date;
}): React.JSX.Element {
  const theme = useTheme();

  const classification = joinDefined([
    label(incident.environment),
    label(incident.oilGasSector),
    label(incident.incidentType),
  ]);

  const location = joinDefined([incident.country, formatDisplayDate(incident.incidentDate)]);

  return (
    <Card onPress={onPress} accessibilityLabel={`Open incident: ${incident.title}`}>
      <Row align="stretch" gap={0}>
        <SeverityRail severity={incident.severity} />
        <View style={{ flex: 1, padding: theme.spacing.md, gap: theme.spacing.xs }}>
          <Row justify="space-between" align="flex-start" gap={theme.spacing.sm}>
            <Txt variant="heading" numberOfLines={3} style={{ flex: 1 }}>
              {incident.title}
            </Txt>
            <StatusTag status={incident.status} />
          </Row>

          <Txt variant="small" muted>
            {location}
          </Txt>

          {incident.operator === null ? null : (
            <Txt variant="small" muted numberOfLines={1}>
              Operator: {incident.operator}
              {incident.asset === null ? '' : `  ·  ${incident.asset}`}
            </Txt>
          )}

          <Txt variant="caption" faint uppercase style={{ marginTop: 2 }}>
            {classification}
          </Txt>

          {incident.summary === null ? null : (
            <Txt variant="small" muted numberOfLines={2} style={{ marginTop: theme.spacing.xs }}>
              {incident.summary.replace(/\n+/g, ' ')}
            </Txt>
          )}

          <Row gap={theme.spacing.xs} wrap style={{ marginTop: theme.spacing.sm }}>
            <SeverityPill severity={incident.severity} compact />
            <ConfidencePill confidence={incident.confidence} compact />
            {incident.isWellIntegrityRelated === true ? (
              <Txt variant="caption" color={theme.colors.warning} uppercase>
                WELL INTEGRITY
              </Txt>
            ) : null}
          </Row>

          <Row justify="space-between" style={{ marginTop: theme.spacing.xs }}>
            <Txt variant="caption" faint>
              {pluralise(incident.sourceCount, 'source')}
            </Txt>
            <Txt variant="caption" faint>
              Updated {relativeTime(incident.lastUpdatedAt, now)}
            </Txt>
          </Row>
        </View>
      </Row>
    </Card>
  );
}
