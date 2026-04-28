import { describe, expect, it } from 'vitest';
import { TERMS_VERSION_MISMATCH_CODE } from './termsCodes';

// FE / BE が独立に観測する「契約値」を pin する。
// 値が変更されると両側を意識的に修正する必要があるため、定数の文字列値そのものを assert する。
// FE 側 (authSlice.isTermsVersionMismatch) と BE 側 (server/routes/users.ts の 409 レスポンス) が
// 同 const を参照する構造のため、本 test と server/routes/users.test.ts の両方が PASS する限り
// 値の同期は機械的に保証される。

describe('TERMS_VERSION_MISMATCH_CODE', () => {
    it('matches the literal value the BE returns in 409 responses', () => {
        expect(TERMS_VERSION_MISMATCH_CODE).toBe('TERMS_VERSION_MISMATCH');
    });
});
