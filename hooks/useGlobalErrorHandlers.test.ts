import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    GLOBAL_ERROR_MESSAGE,
    UNHANDLED_REJECTION_MESSAGE,
    registerGlobalErrorHandlers,
} from './useGlobalErrorHandlers';

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
