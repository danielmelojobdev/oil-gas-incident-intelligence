import { Link } from 'expo-router';
import { View } from 'react-native';
import { Txt } from '../src/components/primitives';
import { useTheme } from '../src/theme';

export default function NotFoundScreen(): React.JSX.Element {
  const theme = useTheme();
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: theme.spacing.md,
        backgroundColor: theme.colors.background,
      }}
    >
      <Txt variant="title">Screen not found</Txt>
      <Link href="/">
        <Txt variant="body" color={theme.colors.accent}>
          Go to the feed
        </Txt>
      </Link>
    </View>
  );
}
