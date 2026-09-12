/**
 * Stable user identifiers.
 *
 * The app works before anyone signs in, identifying itself with an anonymous device
 * id. Supabase Auth, when configured, supplies a real UUID instead. Both have to land
 * in the same `uuid` columns, so anything that is not already a UUID is folded into a
 * deterministic one here, at the HTTP boundary.
 *
 * This exists because the in-memory store used the identity as a plain map key, so a
 * raw "device:ab12..." string worked there and blew up with `invalid input syntax for
 * type uuid` the moment a real Postgres appeared.
 */
import { stableHash } from '@ogii/domain';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

/**
 * Folds any identity string into a stable RFC-4122-shaped UUID.
 *
 * The same device id always produces the same UUID, so per-user state survives
 * restarts, and two different devices cannot collide in practice. Version nibble 5 and
 * the variant bits are set so the value is a well-formed UUID, not merely 32 hex
 * characters with dashes.
 */
export function toUserUuid(identity: string): string {
  if (isUuid(identity)) return identity.toLowerCase();

  const digest = stableHash(`ogii:user:${identity}`);
  const variantNibble = '89ab'[Number.parseInt(digest[16] ?? '0', 16) % 4] ?? '8';

  return [
    digest.slice(0, 8),
    digest.slice(8, 12),
    `5${digest.slice(13, 16)}`,
    `${variantNibble}${digest.slice(17, 20)}`,
    digest.slice(20, 32),
  ].join('-');
}
