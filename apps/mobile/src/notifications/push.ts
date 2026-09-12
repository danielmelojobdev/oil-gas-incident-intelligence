/**
 * Push notifications (brief section 36).
 *
 * Registration, an Android channel with sound, and deep-link routing from a tapped
 * notification to the incident detail screen.
 *
 * In Mock Mode there is no backend to push from, so `simulateIncidentAlert` schedules
 * a genuine local notification — the delivery, the sound and the deep link are all
 * real, only the sender is local.
 */
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { PRODUCT, truncate, type IncidentSummaryCard } from '@ogii/domain';
import { getRepository } from '../data';
import { isMockMode } from '../lib/config';

export const INCIDENT_CHANNEL_ID = 'incidents';

/** Foreground behaviour: incidents are worth interrupting for. */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export interface RegistrationResult {
  readonly granted: boolean;
  readonly token: string | null;
  readonly reason: string;
}

async function ensureAndroidChannel(sound: boolean): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(INCIDENT_CHANNEL_ID, {
    name: 'Oil & Gas incidents',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#FF6B35',
    sound: sound ? 'default' : undefined,
  });
}

/** Asks for permission, creates the channel and registers the token with the backend. */
export async function registerForPushNotifications(sound = true): Promise<RegistrationResult> {
  await ensureAndroidChannel(sound);

  if (!Device.isDevice) {
    return { granted: false, token: null, reason: 'Push notifications require a physical device.' };
  }

  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  if (status !== 'granted') {
    status = (await Notifications.requestPermissionsAsync()).status;
  }
  if (status !== 'granted') {
    return { granted: false, token: null, reason: 'Notification permission was not granted.' };
  }

  if (isMockMode) {
    // No push service in Mock Mode: local notifications are used instead.
    return { granted: true, token: null, reason: 'Mock Mode uses local notifications.' };
  }

  try {
    const token = (await Notifications.getExpoPushTokenAsync()).data;
    await getRepository().registerDevice(token, Platform.OS === 'ios' ? 'ios' : 'android');
    return { granted: true, token, reason: 'Registered for push notifications.' };
  } catch (error) {
    return {
      granted: true,
      token: null,
      reason: `Permission granted but token registration failed: ${
        error instanceof Error ? error.message : 'unknown error'
      }`,
    };
  }
}

/** Subscribes to notification taps and routes to the incident. */
export function addNotificationTapListener(onIncident: (incidentId: string) => void): () => void {
  const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data as Record<string, unknown> | undefined;
    const incidentId = data?.['incidentId'];
    if (typeof incidentId === 'string' && incidentId.length > 0) onIncident(incidentId);
  });
  return () => subscription.remove();
}

/** Returns the incident id if the app was cold-started from a notification. */
export async function getInitialNotificationIncidentId(): Promise<string | null> {
  const response = await Notifications.getLastNotificationResponseAsync();
  const data = response?.notification.request.content.data as Record<string, unknown> | undefined;
  const incidentId = data?.['incidentId'];
  return typeof incidentId === 'string' && incidentId.length > 0 ? incidentId : null;
}

/**
 * Mock Mode: fire a real local notification for a real incident, so the notification
 * path (sound, banner, tap, deep link) can be tested end to end without a server.
 */
export async function simulateIncidentAlert(incident: IncidentSummaryCard, sound = true): Promise<void> {
  await ensureAndroidChannel(sound);
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'NEW OIL & GAS INCIDENT',
      body: `${truncate(incident.title, 110)}\nTap to view details.`,
      sound: sound ? 'default' : undefined,
      data: { incidentId: incident.id, kind: 'new_incident', product: PRODUCT.shortName },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: 2,
      repeats: false,
    },
  });
}

export async function cancelAllScheduled(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}
