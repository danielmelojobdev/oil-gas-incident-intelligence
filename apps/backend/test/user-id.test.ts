import { describe, expect, it } from 'vitest';
import { isUuid, toUserUuid } from '../src/http/user-id';

describe('user identity folding', () => {
  it('produces a well-formed UUID from a device identity', () => {
    const id = toUserUuid('device:abcdef1234567890');
    expect(isUuid(id)).toBe(true);
    // Version 5 and an RFC-4122 variant nibble.
    expect(id[14]).toBe('5');
    expect('89ab').toContain(id[19]);
  });

  it('is stable: the same device always gets the same id', () => {
    expect(toUserUuid('device:abc')).toBe(toUserUuid('device:abc'));
  });

  it('separates different devices', () => {
    expect(toUserUuid('device:abc')).not.toBe(toUserUuid('device:abd'));
  });

  it('passes a real UUID through unchanged, lowercased', () => {
    const supabaseSub = '3F2504E0-4F89-41D3-9A0C-0305E82C3301';
    expect(toUserUuid(supabaseSub)).toBe(supabaseSub.toLowerCase());
  });

  it('rejects non-UUID strings in the guard', () => {
    expect(isUuid('device:abc')).toBe(false);
    expect(isUuid('')).toBe(false);
    expect(isUuid('3f2504e0-4f89-41d3-9a0c-0305e82c3301')).toBe(true);
  });
});
