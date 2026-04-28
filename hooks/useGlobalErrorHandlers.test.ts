import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// `useGlobalErrorHandlers.ts` は top-level で `useStore` を import し、その import
// チェーンは `authSlice.ts` → `firebaseClient.ts` (VITE_FIREBASE_* env 必須) まで到達する。
// CI 環境 (.env なし) でモジュール load 時に throw する経路を遮断するため、
// vi.mock で `../store/index` を stub する。本テストは buildHandlers の引数注入版を
// 検証する設計のため、useStore の実体は使わない。
vi.mock('../store/index', () => ({
    useStore: {
        getState: () => ({ showToast: () => {} }),
    },
}));

const {
    GLOBAL_ERROR_MESSAGE,
    UNHANDLED_REJECTION_MESSAGE,
    buildHandlers,
    registerGlobalErrorHandlers,
} = await import('./useGlobalErrorHandlers');

// `useGlobalErrorHandlers` は React hook のため node 環境では実 render 不可。
// 純粋関数の `registerGlobalErrorHandlers` (window event listener の登録/解放) を
// fake target object で検証する。実 mount/unmount cycle は E2E manual で確認 (DoD §5)。

describe('registerGlobalErrorHandlers', () => {
    interface FakeTarget {
        addEventListener: ReturnType<typeof vi.fn>;
        removeEventListener: ReturnType<typeof vi.fn>;
    }
    let target: FakeTarget;
    let onError: ReturnType<typeof vi.fn>;
    let onUnhandledRejection: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        target = {
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
        };
        onError = vi.fn();
        onUnhandledRejection = vi.fn();
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('registers error and unhandledrejection listeners on target', () => {
        registerGlobalErrorHandlers({
            onError,
            onUnhandledRejection,
            target: target as unknown as Window,
        });
        expect(target.addEventListener).toHaveBeenCalledWith('error', onError);
        expect(target.addEventListener).toHaveBeenCalledWith('unhandledrejection', onUnhandledRejection);
        expect(target.addEventListener).toHaveBeenCalledTimes(2);
    });

    it('returns cleanup that removes both listeners', () => {
        const unregister = registerGlobalErrorHandlers({
            onError,
            onUnhandledRejection,
            target: target as unknown as Window,
        });
        expect(target.removeEventListener).not.toHaveBeenCalled();
        unregister();
        expect(target.removeEventListener).toHaveBeenCalledWith('error', onError);
        expect(target.removeEventListener).toHaveBeenCalledWith('unhandledrejection', onUnhandledRejection);
        expect(target.removeEventListener).toHaveBeenCalledTimes(2);
    });

    it('cleanup is idempotent enough to call without errors when listeners were already removed', () => {
        const unregister = registerGlobalErrorHandlers({
            onError,
            onUnhandledRejection,
            target: target as unknown as Window,
        });
        unregister();
        // 2 度目の呼び出しでも throw しない (target 側の removeEventListener が冪等な前提)
        expect(() => unregister()).not.toThrow();
    });

    it('returns no-op cleanup when target is missing (SSR / non-browser)', () => {
        // target が null のケース: addEventListener を持つグローバル window もない想定。
        // useGlobalErrorHandlers が SSR で読まれた場合に throw しないことを担保。
        // node 環境では globalThis.window は元から undefined のため delete は不要。
        const originalWindow = (globalThis as { window?: Window }).window;
        (globalThis as { window?: Window }).window = undefined;
        try {
            const unregister = registerGlobalErrorHandlers({
                onError,
                onUnhandledRejection,
            });
            expect(typeof unregister).toBe('function');
            expect(() => unregister()).not.toThrow();
        } finally {
            if (originalWindow === undefined) {
                delete (globalThis as { window?: Window }).window;
            } else {
                (globalThis as { window?: Window }).window = originalWindow;
            }
        }
    });
});

describe('buildHandlers (引数注入版)', () => {
    let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        consoleErrorSpy.mockRestore();
    });

    it('onError calls showToast with GLOBAL_ERROR_MESSAGE and error type', () => {
        const showToast = vi.fn();
        const { onError } = buildHandlers(showToast);
        const event = { error: new Error('synthetic'), message: 'synthetic' } as unknown as ErrorEvent;
        onError(event);
        expect(showToast).toHaveBeenCalledWith(GLOBAL_ERROR_MESSAGE, 'error');
        expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('onUnhandledRejection calls showToast with UNHANDLED_REJECTION_MESSAGE', () => {
        const showToast = vi.fn();
        const { onUnhandledRejection } = buildHandlers(showToast);
        const event = { reason: 'reject-reason' } as unknown as PromiseRejectionEvent;
        onUnhandledRejection(event);
        expect(showToast).toHaveBeenCalledWith(UNHANDLED_REJECTION_MESSAGE, 'error');
        expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('onError does NOT throw when showToast itself throws (rules/error-handling.md §1)', () => {
        const showToast = vi.fn(() => {
            throw new Error('toast-internal');
        });
        const { onError } = buildHandlers(showToast);
        const event = { error: new Error('x'), message: 'x' } as unknown as ErrorEvent;
        expect(() => onError(event)).not.toThrow();
        // toast 失敗自体も log に残る (forensic)
        expect(consoleErrorSpy).toHaveBeenCalledWith(
            '[useGlobalErrorHandlers] showToast failed',
            expect.anything(),
        );
    });

    it('onUnhandledRejection does NOT throw when showToast throws', () => {
        const showToast = vi.fn(() => {
            throw new Error('toast-internal');
        });
        const { onUnhandledRejection } = buildHandlers(showToast);
        const event = { reason: 'r' } as unknown as PromiseRejectionEvent;
        expect(() => onUnhandledRejection(event)).not.toThrow();
    });

    it('uses event.message when event.error is undefined', () => {
        const showToast = vi.fn();
        const { onError } = buildHandlers(showToast);
        const event = { error: undefined, message: 'fallback' } as unknown as ErrorEvent;
        onError(event);
        expect(showToast).toHaveBeenCalledWith(GLOBAL_ERROR_MESSAGE, 'error');
        expect(consoleErrorSpy).toHaveBeenCalledWith(
            '[useGlobalErrorHandlers] window error',
            'fallback',
        );
    });
});

describe('GLOBAL_ERROR_MESSAGE / UNHANDLED_REJECTION_MESSAGE constants', () => {
    it('are non-empty japanese user-facing strings', () => {
        expect(typeof GLOBAL_ERROR_MESSAGE).toBe('string');
        expect(GLOBAL_ERROR_MESSAGE.length).toBeGreaterThan(5);
        expect(typeof UNHANDLED_REJECTION_MESSAGE).toBe('string');
        expect(UNHANDLED_REJECTION_MESSAGE.length).toBeGreaterThan(5);
    });

    it('are distinct (sync error vs async rejection)', () => {
        expect(GLOBAL_ERROR_MESSAGE).not.toBe(UNHANDLED_REJECTION_MESSAGE);
    });
});
