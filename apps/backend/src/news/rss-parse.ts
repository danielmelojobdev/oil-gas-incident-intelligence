/**
 * Minimal, dependency-free RSS 2.0 / Atom parser.
 *
 * A full XML parser is unnecessary here and adds a dependency plus an attack surface;
 * feeds are a narrow, well-known shape. Entities are decoded, CDATA unwrapped, and any
 * embedded markup in descriptions is stripped so we store plain text only.
 */
export interface FeedItem {
  readonly title: string;
  readonly link: string;
  readonly description: string | null;
  readonly pubDate: string | null;
  readonly author: string | null;
  readonly source: string | null;
  readonly guid: string | null;
}

const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '-',
  mdash: '-',
  hellip: '...',
  rsquo: "'",
  lsquo: "'",
  ldquo: '"',
  rdquo: '"',
};

export function decodeEntities(input: string): string {
  return input
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number.parseInt(dec, 10)))
    .replace(/&([a-z]+);/gi, (match, name: string) => NAMED_ENTITIES[name.toLowerCase()] ?? match);
}

/**
 * Feeds carry markup two ways: as real tags, and entity-escaped inside <description>.
 * Decoding first, then stripping, handles both, and a final decode resolves the
 * double-encoded entities (&amp;amp;) that some CMSs emit.
 */
export function stripTags(input: string): string {
  const decoded = decodeEntities(input);
  const withoutTags = decoded.replace(/<[^>]*>/g, ' ');
  return decodeEntities(withoutTags).replace(/\s+/g, ' ').trim();
}

function unwrapCdata(input: string): string {
  const match = /^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/.exec(input);
  return match?.[1] ?? input;
}

function tagContent(block: string, tag: string): string | null {
  const pattern = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'i');
  const match = pattern.exec(block);
  if (match?.[1] === undefined) return null;
  const value = stripTags(unwrapCdata(match[1]));
  return value === '' ? null : value;
}

/** Atom links live in an attribute, not in the element body. */
function atomLink(block: string): string | null {
  const alternate = /<link[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["'][^>]*>/i.exec(block);
  if (alternate?.[1] !== undefined) return decodeEntities(alternate[1]);
  const plain = /<link[^>]*href=["']([^"']+)["'][^>]*\/?>/i.exec(block);
  return plain?.[1] === undefined ? null : decodeEntities(plain[1]);
}

/** Parses an RSS 2.0 or Atom document into items. Unknown shapes yield an empty list. */
export function parseFeed(xml: string): FeedItem[] {
  const items: FeedItem[] = [];
  const blocks = [
    ...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi),
    ...xml.matchAll(/<entry(?:\s[^>]*)?>([\s\S]*?)<\/entry>/gi),
  ];

  for (const match of blocks) {
    const block = match[1];
    if (block === undefined) continue;
    const title = tagContent(block, 'title');
    const link = tagContent(block, 'link') ?? atomLink(block);
    if (title === null || link === null) continue;

    items.push({
      title,
      link,
      description: tagContent(block, 'description') ?? tagContent(block, 'summary') ?? tagContent(block, 'content'),
      pubDate: tagContent(block, 'pubDate') ?? tagContent(block, 'published') ?? tagContent(block, 'updated'),
      author: tagContent(block, 'author') ?? tagContent(block, 'dc:creator'),
      source: tagContent(block, 'source'),
      guid: tagContent(block, 'guid') ?? tagContent(block, 'id'),
    });
  }
  return items;
}

/** Feed dates come in several formats; anything unparseable becomes null, never "now". */
export function parseFeedDate(value: string | null): string | null {
  if (value === null) return null;
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return null;
  return new Date(timestamp).toISOString();
}
