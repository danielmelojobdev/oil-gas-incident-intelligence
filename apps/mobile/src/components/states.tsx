/** Empty, error and mock-mode banners (brief sections 54 and 56). */
import { View } from 'react-native';
import { useTheme } from '../theme';
import { Button, Row, Txt } from './primitives';

export function MockBanner({ text }: { text: string }): React.JSX.Element {
  const theme = useTheme();
  return (
    <View
      accessibilityRole="alert"
      style={{
        backgroundColor: theme.colors.mockBanner,
        paddingHorizontal: theme.spacing.md,
        paddingVertical: theme.spacing.sm,
      }}
    >
      <Txt variant="caption" color={theme.colors.mockBannerText} uppercase align="center">
        {text}
      </Txt>
    </View>
  );
}

export function EmptyState({
  title,
  message,
  actionLabel,
  onAction,
}: {
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}): React.JSX.Element {
  const theme = useTheme();
  return (
    <View style={{ alignItems: 'center', paddingVertical: theme.spacing.xxxl, paddingHorizontal: theme.spacing.xl, gap: theme.spacing.sm }}>
      <Txt variant="heading" align="center">
        {title}
      </Txt>
      <Txt variant="small" muted align="center">
        {message}
      </Txt>
      {actionLabel !== undefined && onAction !== undefined ? (
        <Button title={actionLabel} onPress={onAction} variant="secondary" style={{ marginTop: theme.spacing.md }} />
      ) : null}
    </View>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}): React.JSX.Element {
  const theme = useTheme();
  return (
    <View style={{ padding: theme.spacing.xl, gap: theme.spacing.sm, alignItems: 'center' }}>
      <Txt variant="heading" color={theme.colors.danger} align="center">
        Something went wrong
      </Txt>
      <Txt variant="small" muted align="center">
        {message}
      </Txt>
      {onRetry === undefined ? null : (
        <Button title="Try again" onPress={onRetry} variant="secondary" style={{ marginTop: theme.spacing.sm }} />
      )}
    </View>
  );
}

export function InfoNote({ children }: { children: string }): React.JSX.Element {
  const theme = useTheme();
  return (
    <View
      style={{
        backgroundColor: theme.colors.surfaceSunken,
        borderRadius: theme.radius.sm,
        padding: theme.spacing.md,
      }}
    >
      <Row gap={theme.spacing.sm} align="flex-start">
        <Txt variant="small" color={theme.colors.info}>
          i
        </Txt>
        <Txt variant="small" muted style={{ flex: 1 }}>
          {children}
        </Txt>
      </Row>
    </View>
  );
}
