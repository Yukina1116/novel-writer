import React, { useState } from 'react';
import * as Icons from '../../icons';
import { ImportConflictResolution } from '../../types';
import { useStore } from '../../store/index';

const RESOLUTION_LABELS: Record<ImportConflictResolution, string> = {
    overwrite: '上書き',
    duplicate: '新ID で複製',
    skip: 'スキップ',
};

const RESOLUTION_DESC: Record<ImportConflictResolution, string> = {
    overwrite: '既存プロジェクトをインポート内容で上書きします。',
    duplicate: '別 ID として並存させます（既存プロジェクトは保持）。',
    skip: 'このプロジェクトはインポートしません。',
};

interface ImportConflictModalProps {
    onComplete: () => void;
}

export const ImportConflictModal: React.FC<ImportConflictModalProps> = ({ onComplete }) => {
    const plan = useStore(state => state.importPlan);
    const setImportResolution = useStore(state => state.setImportResolution);
    const cancelImport = useStore(state => state.cancelImport);
    const executeImport = useStore(state => state.executeImport);
    const isImporting = useStore(state => state.isImporting);
    const [error, setError] = useState<string | null>(null);

    if (!plan) return null;

    const incomingCount = plan.backup.projects.length;
    const conflictCount = plan.conflicts.length;
    const newCount = incomingCount - conflictCount;

    const handleConfirm = async () => {
        setError(null);
        try {
            await executeImport();
            onComplete();
        } catch (e: any) {
            setError(e?.message ?? String(e));
        }
    };

    return (
        <div
            role="dialog"
            aria-labelledby="import-conflict-title"
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
        >
            <div className="w-full max-w-2xl rounded-lg bg-gray-800 shadow-xl">
                <div className="flex items-start justify-between border-b border-gray-700 px-6 py-4">
                    <div>
                        <h2 id="import-conflict-title" className="text-lg font-semibold text-white">
                            インポート内容の確認
                        </h2>
                        <p className="mt-1 text-sm text-gray-400">
                            合計 {incomingCount} 件 (新規 {newCount} 件 / 既存と衝突 {conflictCount} 件)
                            。バックアップ取得日時:{' '}
                            <span className="font-mono">{plan.backup.exportedAt}</span>
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={cancelImport}
                        className="text-gray-400 hover:text-white"
                        aria-label="閉じる"
                    >
                        <Icons.XIcon className="h-5 w-5" />
                    </button>
                </div>

                <div className="max-h-[60vh] overflow-y-auto px-6 py-4">
                    {conflictCount === 0 ? (
                        <p className="text-sm text-gray-300">
                            既存と衝突するプロジェクトはありません。{newCount} 件すべてを新規にインポートします。
                        </p>
                    ) : (
                        <ul className="space-y-3">
                            {plan.conflicts.map(c => (
                                <li
                                    key={c.incomingId}
                                    className="rounded border border-gray-700 bg-gray-900/40 px-4 py-3"
                                >
                                    <div className="mb-2 text-sm">
                                        <div className="font-semibold text-white">{c.incomingName}</div>
                                        <div className="text-xs text-gray-400">
                                            既存名: {c.existingName} (ID:{' '}
                                            <span className="font-mono">{c.incomingId.slice(0, 8)}…</span>)
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-3 gap-2">
                                        {(['overwrite', 'duplicate', 'skip'] as const).map(opt => (
                                            <label
                                                key={opt}
                                                className={`flex cursor-pointer items-start gap-2 rounded border p-2 text-xs ${
                                                    c.resolution === opt
                                                        ? 'border-indigo-500 bg-indigo-900/30 text-white'
                                                        : 'border-gray-700 bg-gray-800/40 text-gray-300 hover:bg-gray-700/50'
                                                }`}
                                            >
                                                <input
                                                    type="radio"
                                                    name={`resolution-${c.incomingId}`}
                                                    value={opt}
                                                    checked={c.resolution === opt}
                                                    onChange={() => setImportResolution(c.incomingId, opt)}
                                                    className="mt-0.5"
                                                />
                                                <span>
                                                    <span className="block font-semibold">
                                                        {RESOLUTION_LABELS[opt]}
                                                    </span>
                                                    <span className="block text-[11px] text-gray-400">
                                                        {RESOLUTION_DESC[opt]}
                                                    </span>
                                                </span>
                                            </label>
                                        ))}
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}

                    {error && (
                        <div className="mt-4 rounded border border-red-700 bg-red-900/40 px-3 py-2 text-sm text-red-200">
                            {error}
                        </div>
                    )}
                </div>

                <div className="flex items-center justify-end gap-2 border-t border-gray-700 px-6 py-3">
                    <button
                        type="button"
                        onClick={cancelImport}
                        disabled={isImporting}
                        className="rounded px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 disabled:opacity-50"
                    >
                        キャンセル
                    </button>
                    <button
                        type="button"
                        onClick={() => void handleConfirm()}
                        disabled={isImporting}
                        className="rounded bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50 btn-pressable"
                    >
                        {isImporting ? 'インポート中…' : 'この内容でインポート'}
                    </button>
                </div>
            </div>
        </div>
    );
};
