import { describe, expect, it } from 'vitest';
import { selectMobileAuthVariant } from './MobileAuthSection';

// 実 component を mount せず、判定式だけを pin する (ModalManager.test.ts と同じスタイル)。
// selectMobileAuthVariant 自体は MobileAuthSection.tsx から export しているため、
// 実コードとロジックが drift する事故は起きない。

describe('selectMobileAuthVariant', () => {
    it('loading: authStatus is initializing', () => {
        expect(selectMobileAuthVariant('initializing', null)).toBe('loading');
    });

    it('cta: authStatus is unauthenticated', () => {
        expect(selectMobileAuthVariant('unauthenticated', null)).toBe('cta');
    });

    it('cta: authenticated but currentUser is null (race window)', () => {
        expect(selectMobileAuthVariant('authenticated', null)).toBe('cta');
    });

    it('cta: authenticated but currentUser is undefined', () => {
        expect(selectMobileAuthVariant('authenticated', undefined)).toBe('cta');
    });

    it('user: authenticated and currentUser exists', () => {
        expect(
            selectMobileAuthVariant('authenticated', {
                uid: 'u1',
                email: 'test@example.com',
                displayName: null,
                photoURL: null,
            }),
        ).toBe('user');
    });
});
