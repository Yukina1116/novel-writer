import React, { useEffect, useRef, useState } from 'react';
import { useStore } from '../../store/index';
import { DECRYPT_FAILURE_MESSAGE } from '../../utils/backupCrypto';
import { BackupCancelledError } from '../../utils/backupErrors';
import { PASSPHRASE_INPUT_GUARDS } from '../../utils/passphraseUi';
import { MAX_DECRYPT_RETRIES } from '../../store/backupSlice';

// AC-9 規律: UI 層は Error の内部 metadata を読まず、name で機械判定する。
// AbortError = signal.aborted 経路 (timeout/cancel)、BackupCancelledError = slice の
// stale-session race。どちらも「ユーザー意図のキャンセル」として error 文言を出さない。
const isCancellationError = (e: unknown): boolean =>
    e instanceof Error
    && (e.name === 'AbortError' || e instanceof BackupCancelledError);

// AC-11 UI: Import 側の 30 秒 timeout (KDF + AES-GCM 上限)。
const DECRYPT_TIMEOUT_MS = 30_000;

const TIMEOUT_TOAST =
    '復号に時間がかかっています。デバイス性能を確認するか、ファイルサイズを確認してください。';

export const ImportPassphraseModal: React.FC = () => {
    const pendingDecryption = useStore(state => state.pendingDecryption);
    const decryptAndPrepareImport = useStore(state => state.decryptAndPrepareImport);
    const cancelPendingDecryption = useStore(state => state.cancelPendingDecryption);
    const openModal = useStore(state => state.openModal);
    const showToast = useStore(state => state.showToast);

    const [passphrase, setPassphrase] = useState<string>('');
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const passphraseInputRef = useRef<HTMLInputElement>(null);
    // unmount 時に dangling timeout が発火するのを防ぐ (silent-failure-hunter H2)。
    const timeoutIdRef = useRef<number | null>(null);

    useEffect(() => {
        passphraseInputRef.current?.focus();
    }, []);

    useEffect(() => {
        return () => {
            if (timeoutIdRef.current !== null) {
                window.clearTimeout(timeoutIdRef.current);
                timeoutIdRef.current = null;
            }
        };
    }, []);

    if (!pendingDecryption) return null;

    const { retryCount, isDecrypting } = pendingDecryption;
    // AC-6-UI-2: 残回数 = MAX - retryCount。文言は UI 側で生成 (slice は文言生成しない)。
    const remainingAttempts = Math.max(0, MAX_DECRYPT_RETRIES - retryCount);

    const handleSubmit = async (): Promise<void> => {
        if (!passphrase || isDecrypting) return;
        setErrorMessage(null);

        // AC-11: KDF + AES-GCM が 30 秒超えで強制 abort (cancelPendingDecryption 経由で
        // AbortController.abort + state 初期化)。timeoutIdRef に保持して unmount cleanup。
        timeoutIdRef.current = window.setTimeout(() => {
            cancelPendingDecryption();
            showToast(TIMEOUT_TOAST, 'error');
        }, DECRYPT_TIMEOUT_MS);

        const usedPassphrase = passphrase;
        // 復号成功・失敗どちらでも passphrase state を即クリア (AC-9, memory 滞留最小化)。
        setPassphrase('');

        try {
            await decryptAndPrepareImport(usedPassphrase);
            // 成功: pendingDecryption=null, importPlan=set 済 (slice の atomic transition)。
            // ImportConflictModal は activeModal slot 経由で表示する。理由:
            //   1. ModalManager で `importPlan !== null` を自動検知して mount する案も
            //      考えたが、cancelImport / executeImport が `closeModal()` で activeModal
            //      slot を清掃する設計と整合しなくなる (cancelImport は importPlan=null + activeModal=null
            //      の両方を clear する)。
            //   2. activeModal を経由することで M4 から続く既存の ImportConflictModal の
            //      lifecycle (open/close) と完全に同じ経路を維持できる。
            openModal('importConflict');
        } catch (e) {
            // AC-9: cause を読まず、name で機械判定 (isCancellationError)。
            // AbortError / BackupCancelledError = ユーザー意図のキャンセル → 無音終了。
            // 5 回到達時は slice が pendingDecryption=null + toast 表示済 → modal は自動 unmount
            //    (cleanup useEffect で timeout は解除される)。
            if (isCancellationError(e)) {
                return;
            }
            setErrorMessage(DECRYPT_FAILURE_MESSAGE);
        } finally {
            if (timeoutIdRef.current !== null) {
                window.clearTimeout(timeoutIdRef.current);
                timeoutIdRef.current = null;
            }
        }
    };

    const handleCancel = (): void => {
        setPassphrase('');
        cancelPendingDecryption();
    };

    const submitDisabled = isDecrypting || passphrase.length === 0;

    return (
        <div
            tabIndex={-1}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="import-passphrase-title"
            aria-describedby="import-passphrase-description"
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 outline-none"
        >
            <div className="w-full max-w-lg rounded-lg bg-gray-800 shadow-xl">
                <div className="border-b border-gray-700 px-6 py-4">
                    <h2 id="import-passphrase-title" className="text-lg font-semibold text-white">
                        暗号化バックアップの復号
                    </h2>
                    <p id="import-passphrase-description" className="mt-1 text-sm text-gray-400">
                        ファイルを暗号化したときと同じパスフレーズを入力してください。
                    </p>
                </div>

                <div className="space-y-3 px-6 py-4">
                    <div>
                        <label className="block text-xs text-gray-300" htmlFor="import-passphrase">
                            パスフレーズ
                        </label>
                        <input
                            id="import-passphrase"
                            ref={passphraseInputRef}
                            type="password"
                            autoComplete="new-password"
                            value={passphrase}
                            onChange={e => setPassphrase(e.target.value)}
                            {...PASSPHRASE_INPUT_GUARDS}
                            disabled={isDecrypting}
                            onKeyDown={e => {
                                if (e.key === 'Enter' && !submitDisabled) {
                                    void handleSubmit();
                                }
                            }}
                            className="mt-1 w-full rounded border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none disabled:opacity-50"
                        />
                    </div>

                    {errorMessage && (
                        <div
                            role="alert"
                            className="rounded border border-red-700 bg-red-900/40 px-3 py-2 text-sm text-red-200"
                        >
                            {errorMessage}
                            {/* AC-6-UI-2: 残回数を suffix で表示。retry 5 到達時は slice が
                                pendingDecryption=null にしてここまで描画されない。 */}
                            {remainingAttempts > 0 && (
                                <span className="ml-1 text-xs text-red-300">
                                    (あと {remainingAttempts} 回まで再試行できます)
                                </span>
                            )}
                        </div>
                    )}
                </div>

                <div className="flex items-center justify-end gap-2 border-t border-gray-700 px-6 py-3">
                    <button
                        type="button"
                        onClick={handleCancel}
                        // AC-11 / state-diagram.md "Decrypting" 中も cancel ボタン enable
                        // (cancelPendingDecryption が AbortController.abort() を発火、
                        // KDF/AES-GCM は完了後 checkpoint で停止)。codex review High-2。
                        className="rounded px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 disabled:opacity-50"
                    >
                        キャンセル
                    </button>
                    <button
                        type="button"
                        onClick={() => void handleSubmit()}
                        disabled={submitDisabled}
                        className="rounded bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50 btn-pressable"
                    >
                        {isDecrypting ? '復号中…' : '復号する'}
                    </button>
                </div>
            </div>
        </div>
    );
};
