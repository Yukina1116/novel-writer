import React, { useEffect, useRef, useState } from 'react';
import { useStore } from '../../store/index';
import { codepointLength, MIN_PASSPHRASE_CODEPOINTS } from '../../utils/backupCrypto';
import { PASSPHRASE_INPUT_GUARDS } from '../../utils/passphraseUi';

// AC-11 UI: KDF + AES-GCM の合計上限。spec で「30 秒経過時に強制 abort + トースト」と pin。
const ENCRYPT_TIMEOUT_MS = 30_000;

const TIMEOUT_TOAST =
    '暗号化に時間がかかっています。デバイス性能を確認するか、データ量を減らしてください。';

// AC-9 規律: UI 層は Error の内部 metadata を読まず、name で判定。AbortError は
// timeout/cancel 経路 (signal.aborted)、それ以外は slice 側で toast 表示済の正規 path。
const isAbortError = (e: unknown): boolean =>
    e instanceof Error && e.name === 'AbortError';

export const ExportEncryptModal: React.FC = () => {
    const closeModal = useStore(state => state.closeModal);
    const exportAllData = useStore(state => state.exportAllData);
    const isExporting = useStore(state => state.isExporting);
    const showToast = useStore(state => state.showToast);

    const [encrypt, setEncrypt] = useState<boolean>(false);
    const [passphrase, setPassphrase] = useState<string>('');
    const [confirmPassphrase, setConfirmPassphrase] = useState<string>('');

    const passphraseInputRef = useRef<HTMLInputElement>(null);
    const closeButtonRef = useRef<HTMLButtonElement>(null);
    // unmount 時に dangling timeout が発火するのを防ぐ (silent-failure-hunter H2)。
    const timeoutIdRef = useRef<number | null>(null);

    // 暗号化 ON にしたタイミングでパスフレーズ入力にフォーカスを移す (a11y)。
    // OFF 時は close ボタンに置く (default の dialog focus)。
    useEffect(() => {
        if (encrypt) {
            passphraseInputRef.current?.focus();
        } else {
            closeButtonRef.current?.focus();
        }
    }, [encrypt]);

    useEffect(() => {
        return () => {
            if (timeoutIdRef.current !== null) {
                window.clearTimeout(timeoutIdRef.current);
                timeoutIdRef.current = null;
            }
        };
    }, []);

    const length = codepointLength(passphrase);
    const meetsMinLength = length >= MIN_PASSPHRASE_CODEPOINTS;
    const matches = passphrase === confirmPassphrase;
    const canSubmitEncrypted = meetsMinLength && matches && passphrase.length > 0;

    const submitDisabled =
        isExporting || (encrypt ? !canSubmitEncrypted : false);

    const handleClose = (): void => {
        // memory 滞留時間最小化 (AC-5/AC-9): close 時もパスフレーズを即クリア。
        setPassphrase('');
        setConfirmPassphrase('');
        closeModal();
    };

    const handleSubmit = async (): Promise<void> => {
        if (submitDisabled) return;

        if (!encrypt) {
            // 平文 export: slice 側で toast + lastExportedAt 更新が走る。throw した場合は
            // slice 側 catch で toast 済 (AbortError は別途 suppress)。modal は throw 有無で
            // 分岐 close する (silent-failure-hunter B3 — closeModal を await 前に呼ぶと
            // unhandled rejection 化するため try/catch で囲む)。
            try {
                await exportAllData();
                closeModal();
            } catch (e) {
                if (!isAbortError(e)) {
                    // slice 側で toast 表示済 → swallow。modal は残し再試行を許可。
                    return;
                }
            }
            return;
        }

        // 暗号化 export: 30 秒 timeout を AbortController で実装。
        const controller = new AbortController();
        timeoutIdRef.current = window.setTimeout(() => {
            controller.abort();
            showToast(TIMEOUT_TOAST, 'error');
        }, ENCRYPT_TIMEOUT_MS);
        const usedPassphrase = passphrase;
        // 成功・失敗どちらでも passphrase state を即クリア (AC-5-UI-4)。
        setPassphrase('');
        setConfirmPassphrase('');

        let succeeded = false;
        try {
            await exportAllData({
                encrypt: { passphrase: usedPassphrase },
                signal: controller.signal,
            });
            // signal.aborted を post-await check (timeout 発火後に slice 内で early return
            // した場合は succeeded=true でも実 download は行われていない)。
            succeeded = !controller.signal.aborted;
        } catch (e) {
            // AbortError は timeout / cancel: 既に showToast 済 → 無音。
            // それ以外 (KDF 失敗等) は slice 側で toast 済 → swallow して modal を残す。
            void e;
        } finally {
            if (timeoutIdRef.current !== null) {
                window.clearTimeout(timeoutIdRef.current);
                timeoutIdRef.current = null;
            }
        }
        // 成功時のみ close。失敗 / abort 時は modal を残し再試行を許可 (AC-11 後半)。
        if (succeeded) {
            closeModal();
        }
    };

    return (
        <div
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby="export-encrypt-title"
            aria-describedby="export-encrypt-description"
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 outline-none"
        >
            <div className="w-full max-w-lg rounded-lg bg-gray-800 shadow-xl">
                <div className="border-b border-gray-700 px-6 py-4">
                    <h2 id="export-encrypt-title" className="text-lg font-semibold text-white">
                        全データバックアップ
                    </h2>
                    <p id="export-encrypt-description" className="mt-1 text-sm text-gray-400">
                        プロジェクト・チュートリアル状態・解析履歴をまとめてエクスポートします。
                    </p>
                </div>

                <div className="space-y-4 px-6 py-4">
                    <label className="flex cursor-pointer items-start gap-3 rounded border border-gray-700 bg-gray-900/40 px-4 py-3 hover:bg-gray-700/30">
                        <input
                            type="checkbox"
                            checked={encrypt}
                            onChange={e => setEncrypt(e.target.checked)}
                            className="mt-0.5"
                        />
                        <span className="text-sm">
                            <span className="block font-semibold text-white">暗号化する</span>
                            <span className="block text-xs text-gray-400">
                                パスフレーズで暗号化し、{' '}
                                <span className="font-mono">.enc.json</span>{' '}
                                形式でダウンロードします。
                            </span>
                        </span>
                    </label>

                    {encrypt && (
                        <div className="space-y-3 rounded border border-yellow-700/50 bg-yellow-900/20 px-4 py-3">
                            <p className="text-xs text-yellow-200">
                                <strong className="font-semibold">⚠️ パスフレーズを忘れるとデータを復元できません。</strong>
                                {' '}本アプリではパスフレーズを保管しません。安全な場所に控えてください。
                            </p>
                            <p className="text-xs text-gray-300">
                                {MIN_PASSPHRASE_CODEPOINTS} 文字以上、英数字記号を組み合わせると強度が上がります。
                                生成したファイルがクラウドに保管された場合のオフライン攻撃に備えてください。
                            </p>

                            <div>
                                <label className="block text-xs text-gray-300" htmlFor="export-passphrase">
                                    パスフレーズ
                                </label>
                                <input
                                    id="export-passphrase"
                                    ref={passphraseInputRef}
                                    type="password"
                                    autoComplete="new-password"
                                    value={passphrase}
                                    onChange={e => setPassphrase(e.target.value)}
                                    {...PASSPHRASE_INPUT_GUARDS}
                                    disabled={isExporting}
                                    className="mt-1 w-full rounded border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none disabled:opacity-50"
                                />
                                <div className="mt-1 text-[11px] text-gray-400">
                                    {length} / {MIN_PASSPHRASE_CODEPOINTS} 文字
                                    {meetsMinLength ? (
                                        <span className="ml-2 text-green-400">✓ 最低長を満たしました</span>
                                    ) : (
                                        <span className="ml-2 text-yellow-400">
                                            あと {Math.max(0, MIN_PASSPHRASE_CODEPOINTS - length)} 文字必要
                                        </span>
                                    )}
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs text-gray-300" htmlFor="export-passphrase-confirm">
                                    パスフレーズ (確認)
                                </label>
                                <input
                                    id="export-passphrase-confirm"
                                    type="password"
                                    autoComplete="new-password"
                                    value={confirmPassphrase}
                                    onChange={e => setConfirmPassphrase(e.target.value)}
                                    {...PASSPHRASE_INPUT_GUARDS}
                                    disabled={isExporting}
                                    className="mt-1 w-full rounded border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none disabled:opacity-50"
                                />
                                {confirmPassphrase.length > 0 && !matches && (
                                    <div className="mt-1 text-[11px] text-red-300">
                                        パスフレーズが一致しません
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                <div className="flex items-center justify-end gap-2 border-t border-gray-700 px-6 py-3">
                    <button
                        ref={closeButtonRef}
                        type="button"
                        onClick={handleClose}
                        disabled={isExporting}
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
                        {isExporting
                            ? 'エクスポート中…'
                            : encrypt
                                ? '暗号化してダウンロード'
                                : 'ダウンロード'}
                    </button>
                </div>
            </div>
        </div>
    );
};
