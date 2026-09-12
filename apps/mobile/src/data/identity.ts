/**
 * Anonymous device identity and (optional) Supabase session token.
 *
 * The device id lets per-user state work before anyone signs in. It is a random
 * opaque value: it is not a hardware identifier and carries no personal data.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const DEVICE_ID_KEY = 'ogii.deviceId.v1';
const AUTH_TOKEN_KEY = 'ogii.authToken.v1';

let cachedDeviceId: string | null = null;

function randomId(): string {
  const bytes = new Uint8Array(16);
  // `crypto.getRandomValues` is available in Hermes via React Native's polyfill.
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function getDeviceId(): Promise<string> {
  if (cachedDeviceId !== null) return cachedDeviceId;
  try {
    const stored = await AsyncStorage.getItem(DEVICE_ID_KEY);
    if (stored !== null && stored.length >= 8) {
      cachedDeviceId = stored;
      return stored;
    }
  } catch {
    // fall through and mint a new one
  }
  const fresh = randomId();
  cachedDeviceId = fresh;
  try {
    await AsyncStorage.setItem(DEVICE_ID_KEY, fresh);
  } catch {
    // in-memory only for this session
  }
  return fresh;
}

export async function getAuthToken(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(AUTH_TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function setAuthToken(token: string | null): Promise<void> {
  try {
    if (token === null) await AsyncStorage.removeItem(AUTH_TOKEN_KEY);
    else await AsyncStorage.setItem(AUTH_TOKEN_KEY, token);
  } catch {
    // best effort
  }
}

export async function clearIdentity(): Promise<void> {
  cachedDeviceId = null;
  try {
    await AsyncStorage.multiRemove([DEVICE_ID_KEY, AUTH_TOKEN_KEY]);
  } catch {
    // best effort
  }
}
