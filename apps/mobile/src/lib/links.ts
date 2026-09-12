/** Safe outbound links. Deep-link parsing lives in `deep-links.ts` (no native imports). */
import * as WebBrowser from 'expo-web-browser';
import { Linking } from 'react-native';
import { isSafeHttpUrl } from '@ogii/domain';

export { DEEP_LINK_SCHEME, incidentDeepLink, parseIncidentDeepLink } from './deep-links';

/**
 * Opens an article.
 *
 * Only http(s) URLs are ever opened, so a malformed or hostile `javascript:`/`data:`
 * URL arriving from a provider can never be executed.
 */
export async function openArticle(url: string): Promise<boolean> {
  if (!isSafeHttpUrl(url)) return false;
  try {
    await WebBrowser.openBrowserAsync(url, {
      presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
      enableBarCollapsing: true,
    });
    return true;
  } catch {
    // Fall back to the system browser if the in-app browser is unavailable.
    const supported = await Linking.canOpenURL(url);
    if (!supported) return false;
    await Linking.openURL(url);
    return true;
  }
}
