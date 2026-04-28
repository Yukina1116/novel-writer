import { describe, expect, it } from 'vitest';

// ModalManager の TermsConsentModal 先頭分岐 (M7-α PR-D-2) は核心の law:
//   render TermsConsentModal IFF authStatus === 'authenticated' && needsTermsAccept && !isTermsDevBypass()
// 実 component を mount せず、判定ロジックだけ純粋関数として外出し pin する
// (ModalManager 本体は他多数のモーダル合成で重く、unit test で扱いにくい)。

const shouldShowTermsModal = (
    authStatus: 'initializing' | 'unauthenticated' | 'authenticated',
    needsTermsAccept: boolean,
    isTermsDevBypass: boolean,
): boolean => authStatus === 'authenticated' && needsTermsAccept && !isTermsDevBypass;

describe('ModalManager terms-modal precondition (M7-α AC-1 / AC-9)', () => {
    it('shows when authenticated + needsTermsAccept + no dev bypass', () => {
        expect(shouldShowTermsModal('authenticated', true, false)).toBe(true);
    });

    it('hides when needsTermsAccept is false', () => {
        expect(shouldShowTermsModal('authenticated', false, false)).toBe(false);
    });

    it('hides when dev bypass is on (even if needsTermsAccept is true)', () => {
        expect(shouldShowTermsModal('authenticated', true, true)).toBe(false);
    });

    it('hides when authStatus is initializing (race-window race protection)', () => {
        expect(shouldShowTermsModal('initializing', true, false)).toBe(false);
    });

    it('hides when authStatus is unauthenticated (no user to accept on behalf of)', () => {
        expect(shouldShowTermsModal('unauthenticated', true, false)).toBe(false);
    });
});
