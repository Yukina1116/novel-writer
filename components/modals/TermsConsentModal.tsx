import React, { useEffect, useRef, useState } from 'react';
import { useStore } from '../../store/index';
import { isTermsVersionMismatch } from '../../store/authSlice';
import { LegalLinkList } from '../LegalLinkList';

// dev bypass: prod では query を無視 (二重ガード)。SSR-safety: window 不在時は false。
// 関数として export し ModalManager から render 時に評価することで test 環境の vi.stubEnv に追従する。
export const isTermsDevBypass = (): boolean => {
    if (import.meta.env.PROD) return false;
    if (typeof window === 'undefined') return false;
    const params = new URLSearchParams(window.location.search);
    return params.get('skip-terms') === '1';
};

type TermsError =
    | { kind: 'mismatch' }
    | { kind: 'message'; text: string }
    | { kind: 'fatal'; text: string }
    | null;

// 実装漏洩防止: BE error の生 message を user に出さず、status から actionable 文言に倒す。
// 0 = network 断 (CORS / fetch throw)、502 = malformed response、5xx = サーバ側障害、4xx = 認証/契約問題。
// AcceptTermsError (主経路) と UserInitError (refreshCurrentTermsVersion 失敗経路) の両方を
// 扱うため、specific class instanceof ではなく status duck-typing で抽出する。
const userFacingMessage = (error: unknown): string => {
    const status = error instanceof Error && typeof (error as unknown as { status?: unknown }).status === 'number'
        ? (error as unknown as { status: number }).status
        : null;
    if (status !== null) {
        if (status === 0) return 'ネットワーク接続を確認してください。';
        if (status === 401) return '認証セッションが切れました。再ログインしてください。';
        if (status === 502) return 'サーバ応答が不正です。時間をおいて再試行してください。';
        if (status >= 500) return 'サーバ側で一時的な問題が発生しています。時間をおいて再試行してください。';
        if (status >= 400) return '同意処理に失敗しました。ページを再読み込みしてください。';
    }
    return '同意処理に失敗しました。';
};

export const TermsConsentModal: React.FC = () => {
    const acceptTerms = useStore(state => state.acceptTerms);
    const termsAccepting = useStore(state => state.termsAccepting);
    const refreshCurrentTermsVersion = useStore(state => state.refreshCurrentTermsVersion);
    const currentTermsVersion = useStore(state => state.currentTermsVersion);

    const [error, setError] = useState<TermsError>(null);
    const acceptButtonRef = useRef<HTMLButtonElement>(null);
    const dialogRef = useRef<HTMLDivElement>(null);

    // 初回 focus: ボタンが disabled (currentTermsVersion=null) のうちは ref が無効なので
    // dialog 全体に focus を当て、currentTermsVersion 確定後にボタンへ移す。
    useEffect(() => {
        if (currentTermsVersion) {
            acceptButtonRef.current?.focus();
        } else {
            dialogRef.current?.focus();
        }
    }, [currentTermsVersion]);

    const handleAccept = async (): Promise<void> => {
        setError(null);
        try {
            await acceptTerms();
        } catch (acceptError) {
            // raw error は authSlice.acceptTerms の catch (`console.error('acceptTerms failed:', error)`)
            // で既に出力済み。Sentry 重複イベント化を避けるため modal 側では再ログしない。
            // userFacingMessage は status から固定文言に倒す (実装漏洩防止)。
            if (!isTermsVersionMismatch(acceptError)) {
                setError({ kind: 'message', text: userFacingMessage(acceptError) });
                return;
            }
            // mismatch 経路: refreshCurrentTermsVersion を inline で try/catch
            // (refreshAfterMismatch を別関数に切り出すと outer try/catch の責務境界が曖昧になる)
            try {
                await refreshCurrentTermsVersion();
                setError({ kind: 'mismatch' });
            } catch (refetchError) {
                console.error('[TermsConsentModal] refreshCurrentTermsVersion failed', refetchError);
                // 再 fetch 失敗 → ボタン disable 維持で無限再送ループを防ぎ、ページ再読込誘導。
                setError({ kind: 'fatal', text: userFacingMessage(refetchError) });
            }
        }
    };

    const isFatal = error?.kind === 'fatal';

    return (
        <div
            ref={dialogRef}
            tabIndex={-1}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm flex justify-center items-center z-[10000] p-4 outline-none"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="terms-consent-title"
            aria-describedby="terms-consent-description"
        >
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-lg w-full p-6 flex flex-col gap-4">
                <h2
                    id="terms-consent-title"
                    className="text-xl font-bold text-gray-900 dark:text-gray-100"
                >
                    利用規約への同意
                </h2>
                <p
                    id="terms-consent-description"
                    className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed"
                >
                    本サービスをご利用いただく前に、以下の文書をご確認のうえ同意してください。
                    各リンクは新しいタブで開きます。
                </p>
                <LegalLinkList
                    containerClassName="flex flex-col gap-2 text-sm"
                    linkClassName="text-indigo-600 dark:text-indigo-400 hover:underline"
                />
                {error?.kind === 'mismatch' && (
                    <p className="text-sm text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 px-3 py-2 rounded">
                        規約が更新されました。最新版を確認のうえ、再度同意してください。
                    </p>
                )}
                {error?.kind === 'message' && (
                    <p className="text-sm text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/30 px-3 py-2 rounded">
                        {error.text}
                    </p>
                )}
                {error?.kind === 'fatal' && (
                    <p className="text-sm text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/30 px-3 py-2 rounded">
                        {error.text}
                        <br />
                        ページを再読み込みしてください。
                    </p>
                )}
                <p className="text-xs text-gray-500 dark:text-gray-400">
                    現行バージョン: {currentTermsVersion ?? '取得中…'}
                </p>
                <button
                    ref={acceptButtonRef}
                    type="button"
                    onClick={handleAccept}
                    disabled={termsAccepting || !currentTermsVersion || isFatal}
                    className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-bold py-2 px-4 rounded-lg transition-colors"
                >
                    {termsAccepting ? '送信中…' : '同意して開始'}
                </button>
            </div>
        </div>
    );
};
