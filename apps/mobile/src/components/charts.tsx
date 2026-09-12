/**
 * Small, dependency-light charts for the dashboard.
 *
 * Deliberately simple: a horizontal bar list and a 30-day sparkline. A charting
 * library would add weight for two shapes, and these read better at phone width.
 */
import { View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import type { CountBucket } from '@ogii/domain';
import { useTheme } from '../theme';
import { Row, Txt } from './primitives';

export function BarList({
  data,
  color,
  emptyMessage = 'No data in this period.',
  maxItems = 8,
}: {
  data: readonly CountBucket[];
  color?: string;
  emptyMessage?: string;
  maxItems?: number;
}): React.JSX.Element {
  const theme = useTheme();
  const items = data.filter((item) => item.count > 0).slice(0, maxItems);
  const max = items.reduce((highest, item) => Math.max(highest, item.count), 0);
  const barColor = color ?? theme.colors.accent;

  if (items.length === 0) {
    return (
      <Txt variant="small" faint>
        {emptyMessage}
      </Txt>
    );
  }

  return (
    <View style={{ gap: theme.spacing.sm }}>
      {items.map((item) => (
        <View key={item.key} style={{ gap: 4 }}>
          <Row justify="space-between">
            <Txt variant="small" numberOfLines={1} style={{ flex: 1 }}>
              {item.label}
            </Txt>
            <Txt variant="mono" muted>
              {item.count}
            </Txt>
          </Row>
          <View
            style={{
              height: 5,
              borderRadius: 3,
              backgroundColor: theme.colors.surfaceSunken,
              overflow: 'hidden',
            }}
          >
            <View
              style={{
                width: `${max === 0 ? 0 : Math.max(4, (item.count / max) * 100)}%`,
                height: '100%',
                backgroundColor: barColor,
              }}
            />
          </View>
        </View>
      ))}
    </View>
  );
}

/**
 * A 30-day column chart of daily detections.
 *
 * Columns, not a line: the counts are discrete daily totals, and a joined line would
 * imply a continuous quantity between days on which nothing was detected.
 */
export function Sparkline({
  data,
  height = 64,
}: {
  data: readonly { date: string; count: number }[];
  height?: number;
}): React.JSX.Element {
  const theme = useTheme();
  const width = 320;
  const max = Math.max(1, ...data.map((point) => point.count));
  const slot = data.length === 0 ? width : width / data.length;
  const barWidth = Math.max(2, slot * 0.62);
  const baseline = height - 8;

  return (
    <View>
      <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        <Rect x={0} y={baseline} width={width} height={0.75} fill={theme.colors.border} />
        {data.map((point, index) => {
          const barHeight = point.count === 0 ? 0 : Math.max(2, (point.count / max) * (baseline - 4));
          return (
            <Rect
              key={point.date}
              x={index * slot + (slot - barWidth) / 2}
              y={baseline - barHeight}
              width={barWidth}
              height={barHeight}
              rx={1}
              fill={theme.colors.accent}
              opacity={point.count === 0 ? 0 : 1}
            />
          );
        })}
      </Svg>
      <Row justify="space-between" style={{ marginTop: 2 }}>
        <Txt variant="caption" faint>
          30 days ago
        </Txt>
        <Txt variant="caption" faint>
          Peak {max}/day
        </Txt>
        <Txt variant="caption" faint>
          Today
        </Txt>
      </Row>
    </View>
  );
}

export function StatTile({
  value,
  caption,
  color,
}: {
  value: number | string;
  caption: string;
  color?: string;
}): React.JSX.Element {
  const theme = useTheme();
  return (
    <View
      style={{
        flexGrow: 1,
        flexBasis: '30%',
        minWidth: 96,
        backgroundColor: theme.colors.surface,
        borderColor: theme.colors.border,
        borderWidth: 1,
        borderRadius: theme.radius.md,
        padding: theme.spacing.md,
        gap: 2,
      }}
    >
      <Txt variant="title" color={color}>
        {value}
      </Txt>
      <Txt variant="caption" muted uppercase numberOfLines={2}>
        {caption}
      </Txt>
    </View>
  );
}
