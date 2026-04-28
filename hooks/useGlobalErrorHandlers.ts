import { useEffect } from 'react';
import { useStore } from '../store/index';

// ユーザー向け文言。技術的な error.message は console に流し、UI には固定文言を出す
// (生メッセージは XSS / 不安要因になりうる)。
export const GLOBAL_ERROR_MESSAGE = '予期しないエラーが発生しました。問題が続く場合はリロードしてください。';
export const UNHANDLED_REJECTION_MESSAGE = '予期しないエラーが発生しました（非同期処理）。問題が続く場合はリロードしてください。';

export type ShowToastFn = (message: string, type?: 'info' | 'success' | 'error' | 'warning') => void;

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

// rules/error-handling.md §1: ハンドラ自体のエラー耐性。`showToast` 呼出を独立 try/catch で
// 囲み、toast 失敗が再び `error` / `unhandledrejection` を発火して無限ループになる経路を遮断する。
// `showToast` を引数注入にすることで、テスト容易性 + 暗黙のグローバル依存解消。
export function buildHandlers(showToast: ShowToastFn): {
    onError: (event: ErrorEvent) => void;
    onUnhandledRejection: (event: PromiseRejectionEvent) => void;
} {
    const safeToast = (message: string): void => {
        try {
            showToast(message, 'error');
        } catch (toastErr) {
            // toast 自体の失敗はログのみ (再帰的 unhandledrejection 防止)。
            // eslint-disable-next-line no-console
            console.error('[useGlobalErrorHandlers] showToast failed', toastErr);
        }
    };
    const onError = (event: ErrorEvent): void => {
        // ResizeObserver loop 等の harmless error はノイズになる。最低限の出力に留めて
        // toast を出す。本格的な filter は将来の Sentry 連携時に整備。
        // eslint-disable-next-line no-console
        console.error('[useGlobalErrorHandlers] window error', event.error ?? event.message);
        safeToast(GLOBAL_ERROR_MESSAGE);
    };
    const onUnhandledRejection = (event: PromiseRejectionEvent): void => {
        // eslint-disable-next-line no-console
        console.error('[useGlobalErrorHandlers] unhandled rejection', event.reason);
        safeToast(UNHANDLED_REJECTION_MESSAGE);
    };
    return { onError, onUnhandledRejection };
}

export function useGlobalErrorHandlers(): void {
    useEffect(() => {
        // store snapshot ではなく effect run 時点の参照を取得 (HMR / store reset への追従余地)。
        const showToast = useStore.getState().showToast;
        const handlers = buildHandlers(showToast);
        const unregister = registerGlobalErrorHandlers(handlers);
        return unregister;
    }, []);
}
