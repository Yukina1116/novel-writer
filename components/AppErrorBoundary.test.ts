import { describe, it, expect, vi } from 'vitest';
import { AppErrorBoundary } from './AppErrorBoundary';

// 純粋ロジック (Class の static method / instance method) を node 環境で検証する。
// 実 render は React Testing Library 環境がないため E2E manual で確認する (DoD §5)。
//
// 本ファイルは vitest config の include パターン (`**/*.test.ts`) の都合で `.test.ts`
// (jsx 不要) として書く。AppErrorBoundary 本体は `.tsx` で React JSX を含むが、
// import 自体は型情報経由で問題なく動く。

describe('AppErrorBoundary.getDerivedStateFromError', () => {
    it('returns state with the thrown error', () => {
        const err = new Error('boom');
        const state = AppErrorBoundary.getDerivedStateFromError(err);
        expect(state).toEqual({ error: err });
    });

    it('preserves error.message and error.stack', () => {
        const err = new Error('with stack');
        const state = AppErrorBoundary.getDerivedStateFromError(err);
        expect(state.error?.message).toBe('with stack');
        expect(state.error?.stack).toBeDefined();
    });
});

describe('AppErrorBoundary.componentDidCatch (instance method)', () => {
    // class インスタンスを直接生成し、componentDidCatch を呼んで side-effect を検証する。
    // React 内部の lifecycle 経由ではないが、メソッド単体のロジックは同等。
    it('invokes onError prop with error and componentStack', () => {
        const onError = vi.fn();
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const instance = new AppErrorBoundary({
            children: null,
            onError,
        });
        const err = new Error('caught');
        instance.componentDidCatch(err, { componentStack: '\n  in MyComponent' });
        expect(onError).toHaveBeenCalledTimes(1);
        expect(onError).toHaveBeenCalledWith(err, {
            componentStack: '\n  in MyComponent',
        });
        consoleErrorSpy.mockRestore();
    });

    it('logs to console.error with error context', () => {
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const instance = new AppErrorBoundary({ children: null });
        const err = new Error('logged');
        instance.componentDidCatch(err, { componentStack: 'stack-info' });
        expect(consoleErrorSpy).toHaveBeenCalledWith(
            '[AppErrorBoundary] caught render error',
            expect.objectContaining({
                message: 'logged',
                componentStack: 'stack-info',
            }),
        );
        consoleErrorSpy.mockRestore();
    });

    it('does not throw when onError prop is omitted', () => {
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const instance = new AppErrorBoundary({ children: null });
        expect(() =>
            instance.componentDidCatch(new Error('no-onError'), { componentStack: null }),
        ).not.toThrow();
        consoleErrorSpy.mockRestore();
    });
});

describe('AppErrorBoundary.handleReload', () => {
    it('invokes onReloadRequest prop when provided', () => {
        const onReloadRequest = vi.fn();
        const instance = new AppErrorBoundary({
            children: null,
            onReloadRequest,
        });
        instance.handleReload();
        expect(onReloadRequest).toHaveBeenCalledTimes(1);
    });

    it('falls back to window.location.reload when prop omitted (non-browser env: no-op)', () => {
        const instance = new AppErrorBoundary({ children: null });
        // node 環境では window が存在しないため no-op で throw しないこと
        expect(() => instance.handleReload()).not.toThrow();
    });
});
