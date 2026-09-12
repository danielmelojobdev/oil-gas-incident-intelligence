/** Reusable settings rows. */
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';
import { useTheme } from '../theme';
import { Row, Txt } from './primitives';

export function SettingsGroup({
  title,
  children,
  footer,
}: {
  title?: string;
  children: ReactNode;
  footer?: string;
}): React.JSX.Element {
  const theme = useTheme();
  return (
    <View style={{ marginBottom: theme.spacing.xl }}>
      {title === undefined ? null : (
        <Txt variant="label" muted uppercase style={{ marginBottom: theme.spacing.sm }}>
          {title}
        </Txt>
      )}
      <View
        style={{
          backgroundColor: theme.colors.surface,
          borderRadius: theme.radius.md,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: theme.colors.border,
          overflow: 'hidden',
        }}
      >
        {children}
      </View>
      {footer === undefined ? null : (
        <Txt variant="caption" faint style={{ marginTop: theme.spacing.xs, paddingHorizontal: 2 }}>
          {footer}
        </Txt>
      )}
    </View>
  );
}

export function SettingsRow({
  title,
  subtitle,
  value,
  onPress,
  right,
  destructive = false,
}: {
  title: string;
  subtitle?: string;
  value?: string;
  onPress?: () => void;
  right?: ReactNode;
  destructive?: boolean;
}): React.JSX.Element {
  const theme = useTheme();
  const body = (
    <View
      style={{
        paddingHorizontal: theme.spacing.md,
        paddingVertical: theme.spacing.md,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: theme.colors.border,
      }}
    >
      <Row justify="space-between" gap={theme.spacing.md}>
        <View style={{ flex: 1, gap: 2 }}>
          <Txt variant="body" color={destructive ? theme.colors.danger : undefined}>
            {title}
          </Txt>
          {subtitle === undefined ? null : (
            <Txt variant="caption" faint>
              {subtitle}
            </Txt>
          )}
        </View>
        {value === undefined ? null : (
          <Txt variant="small" muted numberOfLines={1} style={{ maxWidth: 170 }} align="right">
            {value}
          </Txt>
        )}
        {right}
        {onPress === undefined ? null : (
          <Txt variant="body" faint>
            ›
          </Txt>
        )}
      </Row>
    </View>
  );

  if (onPress === undefined) return body;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
      {body}
    </Pressable>
  );
}

export function SettingsSwitch({
  title,
  subtitle,
  value,
  onValueChange,
  disabled = false,
}: {
  title: string;
  subtitle?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
}): React.JSX.Element {
  const theme = useTheme();
  return (
    <SettingsRow
      title={title}
      subtitle={subtitle}
      right={
        <Switch
          value={value}
          onValueChange={onValueChange}
          disabled={disabled}
          trackColor={{ true: theme.colors.accent, false: theme.colors.borderStrong }}
          thumbColor={theme.colors.surface}
        />
      }
    />
  );
}
