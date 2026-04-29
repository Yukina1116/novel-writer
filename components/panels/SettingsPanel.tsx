
import React, { useMemo, useRef } from 'react';
import * as Icons from '../../icons';
import { useStore } from '../../store/index';
import { Tooltip } from '../Tooltip';
import { STALE_BACKUP_DAYS, formatLastExportedAt } from '../../utils/backupFormat';
import { readFileAsText } from '../../utils/readFileAsText';

interface SettingsPanelProps {
    onExportProject: () => void;
    onExportTxt: () => void;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({ onExportProject, onExportTxt }) => {
    const openModal = useStore(state => state.openModal);
    const userMode = useStore(state => state.userMode);
    const lastExportedAt = useStore(state => state.lastExportedAt);
    const isStale = useStore(state => state.isBackupStale());
    const isExporting = useStore(state => state.isExporting);
    const prepareImport = useStore(state => state.prepareImport);
    const showToast = useStore(state => state.showToast);
    const importInputRef = useRef<HTMLInputElement>(null);

    const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        try {
            const raw = await readFileAsText(file);
            const result = await prepareImport(raw);
            // 暗号化 envelope の場合は pendingDecryption が set され ImportPassphraseModal が
            // ModalManager 経由で自動 mount される (state-diagram.md ModalManager 統合節)。
            // 平文の場合のみ既存の ImportConflictModal を開く。
            if (result.kind === 'plaintext') {
                openModal('importConflict');
            }
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'インポートの準備に失敗しました';
            showToast(msg, 'error');
        }
    };
    
    const tools = useMemo(() => [
        { label: '相関図', icon: <Icons.UserCogIcon />, action: () => openModal('characterChart'), color: 'text-violet-300', helpId: 'chart_open' },
        { label: 'タイムライン', icon: <Icons.ClockIcon />, action: () => openModal('timeline'), color: 'text-orange-300', helpId: 'timeline_open' },
        { label: '固有名詞生成', icon: <Icons.DiceIcon />, action: () => openModal('nameGenerator'), color: 'text-teal-300', helpId: 'name_gen_open' },
        { label: 'テキスト解析', icon: <Icons.TIcon />, action: () => openModal('importText'), color: 'text-indigo-300', helpId: 'import_text_open' },
    ], [openModal]);

    const exports = [
        { label: 'プロジェクト(.json)', icon: <Icons.FileCodeIcon />, action: onExportProject },
        { label: 'テキスト(.txt)', icon: <Icons.FileTextIcon />, action: onExportTxt },
        { label: '装飾付き(.html)', icon: <Icons.ImageIcon />, action: () => openModal('htmlExport') },
    ];

    const visibleTools = useMemo(() => {
        if (userMode === 'simple') return [];
        return tools;
    }, [userMode, tools]);

    return (
        <div className="p-4 space-y-6">
            <div>
                <h3 className="text-sm font-semibold text-gray-400 mb-2">設定</h3>
                <Tooltip helpId="settings">
                    <button onClick={() => openModal('aiSettings')} className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600/80 rounded-md hover:bg-indigo-600 transition font-semibold btn-pressable text-white">
                        <Icons.SettingsIcon /> プロジェクト設定
                    </button>
                </Tooltip>
            </div>
            
            {visibleTools.length > 0 && (
                <div>
                    <h3 className="text-sm font-semibold text-gray-400 mb-2">ツール</h3>
                    <div className="space-y-2">
                        {visibleTools.map(tool => (
                            <Tooltip key={tool.label} helpId={tool.helpId || ''}>
                                <button onClick={tool.action} className={`w-full text-sm px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-md transition flex items-center gap-2 btn-pressable ${tool.color}`}>
                                    {React.cloneElement<any>(tool.icon as React.ReactElement, { className: 'h-5 w-5 flex-shrink-0' })}
                                    <span>{tool.label}</span>
                                </button>
                            </Tooltip>
                        ))}
                    </div>
                </div>
            )}

            <div>
                <h3 className="text-sm font-semibold text-gray-400 mb-2">エクスポート</h3>
                <div className="space-y-2">
                    {exports.map(exp => (
                        <button key={exp.label} onClick={exp.action} className="w-full text-sm px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-md transition flex items-center gap-2 btn-pressable text-gray-300">
                             {React.cloneElement<any>(exp.icon as React.ReactElement, { className: 'h-4 w-4 mr-1 flex-shrink-0' })}
                            <span>{exp.label}</span>
                        </button>
                    ))}
                </div>
            </div>

            <div>
                <h3 className="text-sm font-semibold text-gray-400 mb-2">全データバックアップ</h3>
                <div className={`text-xs mb-2 ${isStale ? 'text-yellow-400' : 'text-gray-400'}`}>
                    最終バックアップ: {formatLastExportedAt(lastExportedAt)}
                    {isStale && ` (推奨は${STALE_BACKUP_DAYS}日以内)`}
                </div>
                <div className="space-y-2">
                    <button
                        type="button"
                        onClick={() => openModal('exportEncrypt')}
                        disabled={isExporting}
                        className="w-full text-sm px-3 py-2 bg-emerald-700 hover:bg-emerald-600 rounded-md transition flex items-center gap-2 btn-pressable text-white disabled:opacity-50"
                    >
                        <Icons.DownloadIcon className="h-4 w-4 mr-1 flex-shrink-0" />
                        <span>{isExporting ? 'エクスポート中…' : '全データをエクスポート'}</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => importInputRef.current?.click()}
                        className="w-full text-sm px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-md transition flex items-center gap-2 btn-pressable text-gray-300"
                    >
                        <Icons.UploadIcon className="h-4 w-4 mr-1 flex-shrink-0" />
                        <span>バックアップから復元</span>
                    </button>
                    <input
                        type="file"
                        ref={importInputRef}
                        onChange={handleImportFile}
                        accept=".json,application/json,.enc.json"
                        className="hidden"
                    />
                </div>
            </div>
        </div>
    );
};
