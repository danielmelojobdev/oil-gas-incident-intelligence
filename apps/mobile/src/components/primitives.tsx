/** Small themed building blocks used across every screen. */
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { useTheme } from '../theme';

type TypographyVariant = keyof ReturnType<typeof useTheme>['typography'];

export interface TxtProps {
  readonly children: ReactNode;
  readonly variant?: TypographyVariant;
  readonly color?: string;
  readonly muted?: boolean;
  readonly faint?: boolean;
  readonly uppercase?: boolean;
  readonly numberOfLines?: number;
  readonly align?: 'left' | 'center' | 'right';
  readonly style?: StyleProp<TextStyle>;
}

export function Txt({
  children,
  variant = 'body',
  color,
  muted = false,
  faint = false,
  uppercase = false,
  numberOfLines,
  align,
  style,
}: TxtProps): React.JSX.Element {
  const theme = useTheme();
  const base = theme.typography[variant];
  const resolved = color ?? (faint ? theme.colors.textFaint : muted ? theme.colors.textMuted : theme.colors.text);
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[
        {
          fontSize: base.fontSize,
          lineHeight: base.lineHeight,
          fontWeight: base.fontWeight as TextStyle['fontWeight'],
          letterSpacing: 'letterSpacing' in base ? base.letterSpacing : undefined,
          color: resolved,
          textTransform: uppercase ? 'uppercase' : undefined,
          textAlign: align,
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

export function Card({
  children,
  style,
  onPress,
  accessibilityLabel,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  accessibilityLabel?: string;
}): React.JSX.Element {
  const theme = useTheme();
  const content = (
    <View
      style={[
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          borderWidth: StyleSheet.hairlineWidth,
          borderRadius: theme.radius.md,
          overflow: 'hidden',
        },
        style,
      ]}
    >
      {children}
    </View>
  );
  if (onPress === undefined) return content;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1 })}
    >
      {content}
    </Pressable>
  );
}

export function Divider({ inset = 0 }: { inset?: number }): React.JSX.Element {
  const theme = useTheme();
  return (
    <View
      style={{
        height: StyleSheet.hairlineWidth,
        backgroundColor: theme.colors.border,
        marginLeft: inset,
      }}
    />
  );
}

export function Row({
  children,
  gap = 8,
  align = 'center',
  justify = 'flex-start',
  wrap = false,
  style,
}: {
  children: ReactNode;
  gap?: number;
  align?: ViewStyle['alignItems'];
  justify?: ViewStyle['justifyContent'];
  wrap?: boolean;
  style?: StyleProp<ViewStyle>;
}): React.JSX.Element {
  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: align,
          justifyContent: justify,
          gap,
          flexWrap: wrap ? 'wrap' : 'nowrap',
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function Badge({
  label,
  color,
  background,
  outline = false,
}: {
  label: string;
  color: string;
  background?: string;
  outline?: boolean;
}): React.JSX.Element {
  const theme = useTheme();
  return (
    <View
      style={{
        paddingHorizontal: 7,
        paddingVertical: 3,
        borderRadius: theme.radius.sm,
        backgroundColor: outline ? 'transparent' : (background ?? `${color}22`),
        borderWidth: outline ? StyleSheet.hairlineWidth : 0,
        borderColor: color,
      }}
    >
      <Txt variant="caption" color={color} uppercase>
        {label}
      </Txt>
    </View>
  );
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  icon,
  style,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  disabled?: boolean;
  loading?: boolean;
  icon?: ReactNode;
  style?: StyleProp<ViewStyle>;
}): React.JSX.Element {
  const theme = useTheme();
  const palette = {
    primary: { bg: theme.colors.accent, fg: theme.colors.accentText, border: theme.colors.accent },
    secondary: { bg: theme.colors.surfaceRaised, fg: theme.colors.text, border: theme.colors.borderStrong },
    ghost: { bg: 'transparent', fg: theme.colors.textMuted, border: 'transparent' },
    danger: { bg: 'transparent', fg: theme.colors.danger, border: theme.colors.danger },
  }[variant];

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading }}
      style={({ pressed }) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          paddingVertical: 11,
          paddingHorizontal: 16,
          borderRadius: theme.radius.md,
          backgroundColor: palette.bg,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: palette.border,
          opacity: disabled ? 0.45 : pressed ? 0.8 : 1,
        },
        style,
      ]}
    >
      {loading ? <ActivityIndicator size="small" color={palette.fg} /> : icon}
      <Txt variant="bodyStrong" color={palette.fg}>
        {title}
      </Txt>
    </Pressable>
  );
}

export function Chip({
  label,
  selected,
  onPress,
  count,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  count?: number;
}): React.JSX.Element {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={({ pressed }) => ({
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: theme.radius.pill,
        backgroundColor: selected ? theme.colors.accent : theme.colors.surface,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: selected ? theme.colors.accent : theme.colors.border,
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <Txt variant="smallStrong" color={selected ? theme.colors.accentText : theme.colors.textMuted}>
        {label}
        {count === undefined ? '' : `  ${count}`}
      </Txt>
    </Pressable>
  );
}

export function SectionHeader({
  title,
  action,
  subtitle,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}): React.JSX.Element {
  const theme = useTheme();
  return (
    <View style={{ marginBottom: theme.spacing.sm, marginTop: theme.spacing.lg }}>
      <Row justify="space-between">
        <Txt variant="label" muted uppercase>
          {title}
        </Txt>
        {action}
      </Row>
      {subtitle === undefined ? null : (
        <Txt variant="small" faint style={{ marginTop: 2 }}>
          {subtitle}
        </Txt>
      )}
    </View>
  );
}

export function Screen({
  children,
  padded = true,
  style,
}: {
  children: ReactNode;
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
}): React.JSX.Element {
  const theme = useTheme();
  return (
    <View
      style={[
        { flex: 1, backgroundColor: theme.colors.background, padding: padded ? theme.layout.screenPadding : 0 },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function Spinner({ label }: { label?: string }): React.JSX.Element {
  const theme = useTheme();
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', padding: theme.spacing.xxl, gap: 10 }}>
      <ActivityIndicator color={theme.colors.accent} />
      {label === undefined ? null : (
        <Txt variant="small" muted>
          {label}
        </Txt>
      )}
    </View>
  );
}
