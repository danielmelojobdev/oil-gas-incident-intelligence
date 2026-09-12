/** URL canonicalisation, normalisation and safety checks. */

const TRACKING_PARAM_PATTERNS: readonly RegExp[] = [
  /^utm_/i,
  /^ga_/i,
  /^gclid$/i,
  /^gbraid$/i,
  /^wbraid$/i,
  /^fbclid$/i,
  /^msclkid$/i,
  /^mc_(cid|eid)$/i,
  /^igshid$/i,
  /^ref$/i,
  /^referrer$/i,
  /^cmpid$/i,
  /^ncid$/i,
  /^smid$/i,
  /^spm$/i,
  /^__twitter_impression$/i,
  /^guccounter$/i,
  /^guce_referrer/i,
  /^at_medium$/i,
  /^at_campaign$/i,
  /^amp$/i,
];

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

/** True when the string is a syntactically valid, safe http(s) URL with no embedded credentials. */
export function isSafeHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (!ALLOWED_PROTOCOLS.has(url.protocol)) return false;
    if (url.username !== '' || url.password !== '') return false;
    if (url.hostname === '') return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * Canonical comparison key for a URL.
 *
 * - protocol forced to https (http/https of the same page is the same page)
 * - host lowercased, `www.` / `m.` / `amp.` prefixes removed
 * - default ports removed
 * - tracking parameters removed, remaining parameters sorted
 * - trailing slash, `/amp` and `/index.html` removed
 * - fragment removed
 *
 * Total function: returns the trimmed, lowercased input when it cannot be parsed.
 */
export function normaliseUrl(value: string): string {
  const trimmed = value.trim();
  if (!isSafeHttpUrl(trimmed)) return trimmed.toLowerCase();

  const url = new URL(trimmed);
  url.protocol = 'https:';
  url.hash = '';
  url.username = '';
  url.password = '';

  url.hostname = url.hostname.toLowerCase().replace(/^(www|m|amp|mobile)\./, '');
  if (url.port === '80' || url.port === '443') url.port = '';

  const params = [...url.searchParams.entries()]
    .filter(([key]) => !TRACKING_PARAM_PATTERNS.some((pattern) => pattern.test(key)))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  url.search = '';
  for (const [key, val] of params) url.searchParams.append(key, val);

  let pathname = url.pathname.replace(/\/amp\/?$/i, '/').replace(/\/index\.(html?|php)$/i, '/');
  if (pathname.length > 1) pathname = pathname.replace(/\/+$/, '');
  if (pathname === '') pathname = '/';
  url.pathname = pathname;

  return url.toString().replace(/\?$/, '');
}

/** Registrable-ish host used to group syndicated copies from the same publisher family. */
export function publisherHost(value: string): string | null {
  if (!isSafeHttpUrl(value)) return null;
  const host = new URL(value).hostname.toLowerCase().replace(/^(www|m|amp|mobile)\./, '');
  const parts = host.split('.');
  if (parts.length <= 2) return host;
  // Handle the two-level public suffixes we actually meet (co.uk, com.br, com.au...).
  const twoLevel = new Set(['co', 'com', 'org', 'net', 'gov', 'ac', 'edu']);
  const secondLast = parts[parts.length - 2];
  if (secondLast !== undefined && twoLevel.has(secondLast) && parts.length >= 3) {
    return parts.slice(-3).join('.');
  }
  return parts.slice(-2).join('.');
}

/**
 * Some aggregators (Google News, Bing) wrap the publisher URL in a redirect with the
 * real destination in a query parameter. Unwrap when it is safely parseable.
 */
export function unwrapRedirect(value: string): string {
  if (!isSafeHttpUrl(value)) return value;
  const url = new URL(value);
  for (const key of ['url', 'u', 'target', 'redirect']) {
    const candidate = url.searchParams.get(key);
    if (candidate !== null && isSafeHttpUrl(candidate)) return candidate;
  }
  return value;
}
