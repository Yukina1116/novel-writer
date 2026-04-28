import { useEffect } from 'react';
import { useStore } from '../store/index';

// ユーザー向け文言。技術的な error.message は console に流し、UI には固定文言を出す
// (生メッセージは XSS / 不安要因になりうる)。
export const GLOBAL_ERROR_MESSAGE = '予期しないエラーが発生しました。問題が続く場合はリロードしてください。';
export const UNHANDLED_REJECTION_MESSAGE = '予期しないエラーが発生しました（非同期処理）。問題が続く場合はリロードしてください。';

// 純粋関数として export して単体テスト容易にする。`window` を持つ環境でのみ動作。
// React Strict Mode の double-effect でも cleanup が確実に走るよう、registration / cleanup を
// 1 関数で完結させる (副作用クロージャ版)。
export function registerGlobalErrorHandlers(opts: {
    onError: (event: ErrorEvent) => void;
    onUnhandledRejection: (event: PromiseRejectionEvent) => void;
    target?: Window;
}): () => void {
    const target = opts.target ?? (typeof window !== 'undefined' ? window : null);
    if (!target) {
        return () => {
            // SSR / non-browser 環境では no-op
        };
    }
    target.addEventListener('error', opts.onError);
    target.addEventListener('unhandledrejection', opts.onUnhandledRejection);
    return () => {
        target.removeEventListener('error', opts.onError);
        target.removeEventListener('unhandledrejection', opts.onUnhandledRejection);
    };
}

export function buildHandlers(): {
    onError: (event: ErrorEvent) => void;
    onUnhandledRejection: (event: PromiseRejectionEvent) => void;
} {
    const showToast = useStore.getState().showToast;
    const onError = (event: ErrorEvent): void => {
        // ResizeObserver loop 等の harmless error はノイズになる。最低限の出力に留めて
        // toast を出す。本格的な filter は将来の Sentry 連携時に整備。
        // eslint-disable-next-line no-console
        console.error('[useGlobalErrorHandlers] window error', event.error ?? event.message);
        showToast(GLOBAL_ERROR_MESSAGE, 'error');
    };
    const onUnhandledRejection = (event: PromiseRejectionEvent): void => {
        // eslint-disable-next-line no-console
        console.error('[useGlobalErrorHandlers] unhandled rejection', event.reason);
        showToast(UNHANDLED_REJECTION_MESSAGE, 'error');
    };
    return { onError, onUnhandledRejection };
}

export function useGlobalErrorHandlers(): void {
    useEffect(() => {
        const handlers = buildHandlers();
        const unregister = registerGlobalErrorHandlers(handlers);
        return unregister;
    }, []);
}
