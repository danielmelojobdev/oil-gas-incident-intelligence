/** Root layout: providers, theming, deep links and notification routing. */
import { useEffect, useMemo, useState } from 'react';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Linking from 'expo-linking';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider, useTheme } from '../src/theme';
import { useSettingsStore } from '../src/state/settings-store';
import { addNotificationTapListener, getInitialNotificationIncidentId } from '../src/notifications/push';
import { parseIncidentDeepLink } from '../src/lib/links';

function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: 2,
        retryDelay: (attempt) => Math.min(4000, 500 * 2 ** attempt),
        refetchOnWindowFocus: false,
        staleTime: 60 * 1000,
        gcTime: 30 * 60 * 1000,
      },
      mutations: { retry: 0 },
    },
  });
}

function openIncident(incidentId: string): void {
  router.push({ pathname: '/incident/[id]', params: { id: incidentId } });
}

function NavigationStack(): React.JSX.Element {
  const theme = useTheme();
  return (
    <>
      <StatusBar style={theme.isDark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: theme.colors.background },
          headerTintColor: theme.colors.text,
          headerTitleStyle: { fontWeight: '700', fontSize: 17 },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: theme.colors.background },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="incident/[id]" options={{ title: 'Incident', headerBackTitle: 'Back' }} />
        <Stack.Screen name="settings/search" options={{ title: 'Search Settings' }} />
        <Stack.Screen name="settings/keywords" options={{ title: 'Keywords' }} />
        <Stack.Screen name="settings/notifications" options={{ title: 'Notifications' }} />
        <Stack.Screen name="settings/scanner" options={{ title: 'Scanner' }} />
        <Stack.Screen name="settings/sources" options={{ title: 'Sources' }} />
        <Stack.Screen name="settings/privacy" options={{ title: 'Data & Privacy' }} />
        <Stack.Screen name="settings/about" options={{ title: 'About' }} />
        <Stack.Screen name="+not-found" options={{ title: 'Not found' }} />
      </Stack>
    </>
  );
}

export default function RootLayout(): React.JSX.Element {
  const queryClient = useMemo(createQueryClient, []);
  const hydrate = useSettingsStore((state) => state.hydrate);
  const hydrated = useSettingsStore((state) => state.hydrated);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void hydrate().finally(() => setReady(true));
  }, [hydrate]);

  // Notification taps (warm start) and cold start from a notification.
  useEffect(() => {
    const unsubscribe = addNotificationTapListener(openIncident);
    void getInitialNotificationIncidentId().then((incidentId) => {
      if (incidentId !== null) openIncident(incidentId);
    });
    return unsubscribe;
  }, []);

  // Deep links: ogii://incident/<id>
  useEffect(() => {
    const subscription = Linking.addEventListener('url', ({ url }) => {
      const incidentId = parseIncidentDeepLink(url);
      if (incidentId !== null) openIncident(incidentId);
    });
    void Linking.getInitialURL().then((url) => {
      if (url === null) return;
      const incidentId = parseIncidentDeepLink(url);
      if (incidentId !== null) openIncident(incidentId);
    });
    return () => subscription.remove();
  }, []);

  if (!ready && !hydrated) return <></>;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>
            <NavigationStack />
          </ThemeProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
