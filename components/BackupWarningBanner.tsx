import React from 'react';
import * as Icons from '../icons';
import { useStore } from '../store/index';
import { STALE_BACKUP_DAYS, formatLastExportedAt } from '../utils/backupFormat';

export const BackupWarningBanner: React.FC = () => {
    const lastExportedAt = useStore(state => state.lastExportedAt);
    const isStale = useStore(state => state.isBackupStale());
    const isExporting = useStore(state => state.isExporting);
    const exportAllData = useStore(state => state.exportAllData);

    if (!isStale) return null;

    const base = formatLastExportedAt(lastExportedAt);
    const label = lastExportedAt ? `${base} (推奨は${STALE_BACKUP_DAYS}日以内)` : base;
    return (
        <div
            role="alert"
            className="flex items-start gap-3 border-b border-yellow-700/60 bg-yellow-900/30 px-4 py-2 text-sm text-yellow-100"
        >
            <Icons.AlertTriangleIcon className="h-5 w-5 flex-shrink-0 text-yellow-400" />
            <div className="flex-grow">
                <span className="font-semibold text-yellow-300">バックアップ未取得: </span>
                最終バックアップ {label}。データはこの端末のブラウザにのみ保存されています。
            </div>
            <button
                type="button"
                onClick={() => void exportAllData()}
                disabled={isExporting}
                className="flex items-center gap-1 rounded bg-yellow-600 px-3 py-1 text-xs font-semibold text-white transition hover:bg-yellow-500 disabled:opacity-50 btn-pressable"
            >
                <Icons.DownloadIcon className="h-3 w-3" />
                {isExporting ? 'エクスポート中…' : '今すぐエクスポート'}
            </button>
        </div>
    );
};
