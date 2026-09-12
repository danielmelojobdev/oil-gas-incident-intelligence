/** Bottom navigation: Home · Search · Saved · Dashboard · Settings (brief section 33). */
import { Tabs } from 'expo-router';
import { StyleSheet, Text, type ColorValue } from 'react-native';
import { useTheme } from '../../src/theme';

/**
 * Compact text glyphs rather than an icon font: they are legible at tab size, carry no
 * extra dependency, and match the technical tone of the product.
 */
function TabGlyph({ glyph, color }: { glyph: string; color: ColorValue }): React.JSX.Element {
  return <Text style={{ color, fontSize: 17, fontWeight: '700', lineHeight: 20 }}>{glyph}</Text>;
}

export default function TabsLayout(): React.JSX.Element {
  const theme = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.background },
        headerTintColor: theme.colors.text,
        headerTitleStyle: { fontWeight: '700', fontSize: 18 },
        headerShadowVisible: false,
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.border,
          borderTopWidth: StyleSheet.hairlineWidth,
        },
        tabBarActiveTintColor: theme.colors.accent,
        tabBarInactiveTintColor: theme.colors.textFaint,
        tabBarLabelStyle: { fontSize: 10.5, fontWeight: '600' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Feed',
          headerTitle: 'Incident Feed',
          tabBarIcon: ({ color }) => <TabGlyph glyph="▤" color={color} />,
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: 'Search',
          headerTitle: 'Search & History',
          tabBarIcon: ({ color }) => <TabGlyph glyph="⌕" color={color} />,
        }}
      />
      <Tabs.Screen
        name="saved"
        options={{
          title: 'Saved',
          headerTitle: 'Saved Incidents',
          tabBarIcon: ({ color }) => <TabGlyph glyph="★" color={color} />,
        }}
      />
      <Tabs.Screen
        name="dashboard"
        options={{
          title: 'Dashboard',
          headerTitle: 'Dashboard',
          tabBarIcon: ({ color }) => <TabGlyph glyph="◫" color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          headerTitle: 'Settings',
          tabBarIcon: ({ color }) => <TabGlyph glyph="⚙" color={color} />,
        }}
      />
    </Tabs>
  );
}
