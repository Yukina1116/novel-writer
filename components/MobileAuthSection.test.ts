import { describe, expect, it } from 'vitest';
import { selectMobileAuthVariant } from './mobileAuthVariant';

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
