/**
 * Deep-link construction and parsing.
 *
 * Kept free of React Native imports so it can be unit-tested in plain Node, and so
 * nothing about link *parsing* depends on a native module being available.
 */
import { isSafeHttpUrl } from '@ogii/domain';

export const DEEP_LINK_SCHEME = 'ogii';

/** Deep link for an incident: `ogii://incident/<id>`. */
export function incidentDeepLink(incidentId: string): string {
  return `${DEEP_LINK_SCHEME}://incident/${encodeURIComponent(incidentId)}`;
}

/**
 * Extracts an incident id from a deep link, or null if it is not one.
 *
 * Accepts both the custom scheme (`ogii://incident/<id>`) and an https universal link
 * (`https://host/incident/<id>`), and refuses anything else — including
 * `javascript:` and `data:` URLs.
 */
export function parseIncidentDeepLink(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  const allowedScheme = parsed.protocol === `${DEEP_LINK_SCHEME}:` || isSafeHttpUrl(url);
  if (!allowedScheme) return null;

  const segments = parsed.pathname.split('/').filter((segment) => segment.length > 0);

  // ogii://incident/<id> parses with host="incident" and pathname="/<id>".
  if (parsed.host === 'incident' && segments.length > 0) {
    return decodeURIComponent(segments.join('/'));
  }
  if (segments[0] === 'incident' && segments.length > 1) {
    return decodeURIComponent(segments.slice(1).join('/'));
  }
  return null;
}
