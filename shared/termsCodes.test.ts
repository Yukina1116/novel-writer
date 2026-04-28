import { describe, expect, it } from 'vitest';
import {
    TERMS_VERSION_MISMATCH_CODE,
    USER_DOC_MISSING_CODE,
    isKnownAcceptTerms409Code,
} from './termsCodes';

// FE / BE が独立に観測する「契約値」を pin する。
// 値が変更されると両側を意識的に修正する必要があるため、定数の文字列値そのものを assert する。
// FE 側 (authSlice.isTermsVersionMismatch / AcceptTermsError) と BE 側 (server/routes/users.ts の
// 409 レスポンス) が同 const を参照する構造のため、本 test と server/routes/users.test.ts の
// 両方が PASS する限り値の同期は機械的に保証される。

describe('TERMS_VERSION_MISMATCH_CODE', () => {
    it('matches the literal value the BE returns in 409 responses', () => {
        expect(TERMS_VERSION_MISMATCH_CODE).toBe('TERMS_VERSION_MISMATCH');
    });
});

describe('USER_DOC_MISSING_CODE', () => {
    it('matches the literal value the BE returns when users/{uid} doc is missing', () => {
        expect(USER_DOC_MISSING_CODE).toBe('USER_DOC_MISSING');
    });
});

describe('isKnownAcceptTerms409Code', () => {
    it('returns true for TERMS_VERSION_MISMATCH', () => {
        expect(isKnownAcceptTerms409Code(TERMS_VERSION_MISMATCH_CODE)).toBe(true);
    });

    it('returns true for USER_DOC_MISSING', () => {
        expect(isKnownAcceptTerms409Code(USER_DOC_MISSING_CODE)).toBe(true);
    });

    it('returns false for unknown code strings', () => {
        expect(isKnownAcceptTerms409Code('OTHER_CONFLICT')).toBe(false);
        expect(isKnownAcceptTerms409Code('')).toBe(false);
    });

    it('returns false for non-string values', () => {
        expect(isKnownAcceptTerms409Code(undefined)).toBe(false);
        expect(isKnownAcceptTerms409Code(null)).toBe(false);
        expect(isKnownAcceptTerms409Code(409)).toBe(false);
        expect(isKnownAcceptTerms409Code({})).toBe(false);
    });
});
