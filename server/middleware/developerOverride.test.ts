import { describe, it, expect, afterEach, vi } from 'vitest';
import { isDeveloperOverrideUid } from './developerOverride';

afterEach(() => {
    vi.unstubAllEnvs();
});

describe('isDeveloperOverrideUid', () => {
    it('returns false when DEVELOPER_UIDS is unset', () => {
        vi.stubEnv('DEVELOPER_UIDS', undefined as unknown as string);
        expect(isDeveloperOverrideUid('alice')).toBe(false);
    });

    it('returns false when DEVELOPER_UIDS is empty string', () => {
        vi.stubEnv('DEVELOPER_UIDS', '');
        expect(isDeveloperOverrideUid('alice')).toBe(false);
    });

    it('returns false when DEVELOPER_UIDS is whitespace only', () => {
        vi.stubEnv('DEVELOPER_UIDS', '   ');
        expect(isDeveloperOverrideUid('alice')).toBe(false);
    });

    it('returns true for exact single uid match', () => {
        vi.stubEnv('DEVELOPER_UIDS', 'alice');
        expect(isDeveloperOverrideUid('alice')).toBe(true);
    });

    it('returns false for non-matching uid', () => {
        vi.stubEnv('DEVELOPER_UIDS', 'alice');
        expect(isDeveloperOverrideUid('bob')).toBe(false);
    });

    it('supports comma-separated multiple uids', () => {
        vi.stubEnv('DEVELOPER_UIDS', 'alice,bob,carol');
        expect(isDeveloperOverrideUid('alice')).toBe(true);
        expect(isDeveloperOverrideUid('bob')).toBe(true);
        expect(isDeveloperOverrideUid('carol')).toBe(true);
        expect(isDeveloperOverrideUid('dave')).toBe(false);
    });

    it('trims whitespace around each uid', () => {
        vi.stubEnv('DEVELOPER_UIDS', '  alice , bob  ');
        expect(isDeveloperOverrideUid('alice')).toBe(true);
        expect(isDeveloperOverrideUid('bob')).toBe(true);
    });

    it('ignores empty elements from consecutive commas', () => {
        vi.stubEnv('DEVELOPER_UIDS', 'alice,,bob,');
        expect(isDeveloperOverrideUid('alice')).toBe(true);
        expect(isDeveloperOverrideUid('bob')).toBe(true);
        expect(isDeveloperOverrideUid('')).toBe(false);
    });

    it('does not partial-match a uid that is a substring of a configured uid', () => {
        vi.stubEnv('DEVELOPER_UIDS', 'abc123');
        expect(isDeveloperOverrideUid('abc')).toBe(false);
        expect(isDeveloperOverrideUid('abc123')).toBe(true);
    });
});
