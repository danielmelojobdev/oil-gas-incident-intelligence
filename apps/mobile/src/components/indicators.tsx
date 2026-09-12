/** Severity, confidence and source-tier indicators. */
import { StyleSheet, View } from 'react-native';
import { label, type ConfidenceLevel, type Severity, type SourceTier } from '@ogii/domain';
import { useTheme } from '../theme';
import { Badge, Row, Txt } from './primitives';
import { CONFIDENCE_LABEL, SEVERITY_LABEL, TIER_LABEL } from '../lib/format';

export function SeverityPill({ severity, compact = false }: { severity: Severity; compact?: boolean }): React.JSX.Element {
  const theme = useTheme();
  const color = theme.colors.severity[severity];
  return (
    <Badge
      label={compact ? SEVERITY_LABEL[severity] : `Severity: ${SEVERITY_LABEL[severity]}`}
      color={color}
      background={theme.colors.severitySoft[severity]}
    />
  );
}

export function ConfidencePill({
  confidence,
  compact = false,
}: {
  confidence: ConfidenceLevel;
  compact?: boolean;
}): React.JSX.Element {
  const theme = useTheme();
  const color = theme.colors.confidence[confidence];
  // The compact form keeps the "CONF" prefix: a bare "HIGH" next to the severity pill
  // is genuinely ambiguous on a dense card.
  return (
    <Badge
      label={compact ? `CONF ${CONFIDENCE_LABEL[confidence]}` : `Confidence: ${CONFIDENCE_LABEL[confidence]}`}
      color={color}
      outline
    />
  );
}

export function TierBadge({ tier }: { tier: SourceTier }): React.JSX.Element {
  const theme = useTheme();
  return <Badge label={TIER_LABEL[tier]} color={theme.colors.tier[tier]} />;
}

/** The coloured rail down the left edge of a feed card. */
export function SeverityRail({ severity }: { severity: Severity }): React.JSX.Element {
  const theme = useTheme();
  return (
    <View
      style={{
        width: theme.layout.severityRailWidth,
        backgroundColor: theme.colors.severity[severity],
      }}
    />
  );
}

/** A labelled 0-100 bar, used for severity and confidence scores in the detail view. */
export function ScoreBar({
  value,
  color,
  caption,
}: {
  value: number;
  color: string;
  caption?: string;
}): React.JSX.Element {
  const theme = useTheme();
  return (
    <View style={{ gap: 4 }}>
      <View
        style={{
          height: 6,
          borderRadius: 3,
          backgroundColor: theme.colors.surfaceSunken,
          overflow: 'hidden',
        }}
      >
        <View
          style={{
            width: `${Math.max(2, Math.min(100, value))}%`,
            height: '100%',
            backgroundColor: color,
          }}
        />
      </View>
      {caption === undefined ? null : (
        <Txt variant="caption" faint>
          {caption}
        </Txt>
      )}
    </View>
  );
}

/** "New" / "Updated" marker on a feed card. */
export function StatusTag({ status }: { status: string }): React.JSX.Element | null {
  const theme = useTheme();
  if (status === 'new') return <Badge label="NEW" color={theme.colors.accent} />;
  if (status === 'updated') return <Badge label="UPDATED" color={theme.colors.info} />;
  if (status === 'under_review') return <Badge label="REVIEW" color={theme.colors.textFaint} outline />;
  if (status === 'monitoring') return <Badge label="MONITORING" color={theme.colors.info} outline />;
  return null;
}

/** Field name + value, the workhorse of the detail screen. */
export function FieldRow({
  name,
  value,
  emphasis = false,
}: {
  name: string;
  value: string;
  emphasis?: boolean;
}): React.JSX.Element {
  const theme = useTheme();
  const unknown = value === 'Not reported' || value === 'Unknown';
  return (
    <View
      style={{
        paddingVertical: theme.spacing.sm,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: theme.colors.border,
      }}
    >
      <Row justify="space-between" align="flex-start" gap={theme.spacing.lg}>
        <Txt variant="label" muted uppercase style={{ flex: 1, paddingTop: 3 }}>
          {name}
        </Txt>
        <Txt
          variant={emphasis ? 'bodyStrong' : 'body'}
          faint={unknown}
          align="right"
          style={{ flex: 1.6 }}
        >
          {value}
        </Txt>
      </Row>
    </View>
  );
}

export function WellIntegrityFlag({ category }: { category: string | null }): React.JSX.Element {
  const theme = useTheme();
  return (
    <Badge label={category === null ? 'WELL INTEGRITY' : `WI · ${label(category)}`} color={theme.colors.warning} />
  );
}
