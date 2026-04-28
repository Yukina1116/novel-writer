import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// `useStore` の import チェーン (→ authSlice → firebaseClient) は CI 環境 (.env なし) で
// load 時に throw するため遮断する。本テストは isTermsDevBypass 純粋関数のみ検証 (実 render は E2E manual)。
vi.mock('../../store/index', () => ({
    useStore: {
        getState: () => ({}),
    },
}));

// `TermsConsentModal.tsx` は authSlice から `isTermsVersionMismatch` / `AcceptTermsError` を
// 直接 import するようになり、import チェーンが firebaseClient に到達する (CI で .env なし → throw)。
// PR #65 と同パターンで authSlice 自体も遮断する。本テストは isTermsDevBypass のみ検証。
vi.mock('../../store/authSlice', () => ({
    isTermsVersionMismatch: () => false,
}));

const { isTermsDevBypass } = await import('./TermsConsentModal');

describe('isTermsDevBypass', () => {
    let originalWindow: unknown;

    beforeEach(() => {
        originalWindow = (globalThis as { window?: unknown }).window;
    });

    afterEach(() => {
        if (originalWindow === undefined) {
            delete (globalThis as { window?: unknown }).window;
        } else {
            (globalThis as { window?: unknown }).window = originalWindow;
        }
        vi.unstubAllEnvs();
    });

    const setLocation = (search: string): void => {
        (globalThis as { window?: { location: { search: string } } }).window = {
            location: { search },
        };
    };

    it('returns true in dev when ?skip-terms=1 is set', () => {
        vi.stubEnv('PROD', false);
        setLocation('?skip-terms=1');
        expect(isTermsDevBypass()).toBe(true);
    });

    it('returns false in dev when query param is absent', () => {
        vi.stubEnv('PROD', false);
        setLocation('');
        expect(isTermsDevBypass()).toBe(false);
    });

    it('returns false in dev when ?skip-terms is not exactly "1"', () => {
        vi.stubEnv('PROD', false);
        setLocation('?skip-terms=true');
        expect(isTermsDevBypass()).toBe(false);
    });

    it('returns false in prod even when ?skip-terms=1 is set (double guard)', () => {
        vi.stubEnv('PROD', true);
        setLocation('?skip-terms=1');
        expect(isTermsDevBypass()).toBe(false);
    });

    it('returns false when window is undefined (SSR-safety)', () => {
        vi.stubEnv('PROD', false);
        delete (globalThis as { window?: unknown }).window;
        expect(isTermsDevBypass()).toBe(false);
    });
});
