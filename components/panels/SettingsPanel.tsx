
import React, { useMemo, useRef } from 'react';
import * as Icons from '../../icons';
import { useStore } from '../../store/index';
import { Tooltip } from '../Tooltip';
import { readFileAsText } from '../../utils/readFileAsText';

interface SettingsPanelProps {
    onExportProject: () => void;
    onExportTxt: () => void;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({ onExportProject, onExportTxt }) => {
    const openModal = useStore(state => state.openModal);
    const userMode = useStore(state => state.userMode);
    const isExporting = useStore(state => state.isExporting);
    const prepareImport = useStore(state => state.prepareImport);
    const showToast = useStore(state => state.showToast);
    const importInputRef = useRef<HTMLInputElement>(null);

    // Issue #104 evaluator MEDIUM: SettingsPanel から「バックアップから復元」が
    // 消えた regression を解消する。主導線は ProjectSelectionScreen の「データ管理」
    // に移ったが、編集中にも復元できる安全弁を残す。
    const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        try {
            const raw = await readFileAsText(file);
            const result = await prepareImport(raw);
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

            {/* 全データバックアップ section: 主導線は ProjectSelectionScreen「データ管理」へ
                移設 (issue #104)。ここではプロジェクト編集中の動線として最小ボタンを残す。 */}
            <div>
                <h3 className="text-sm font-semibold text-gray-400 mb-2">バックアップ</h3>
                <p className="text-xs text-gray-400 mb-2">
                    現在のプロジェクトまたは全データを暗号化して保存できます。
                </p>
                <div className="space-y-2">
                    <button
                        type="button"
                        onClick={() => openModal('exportEncrypt')}
                        disabled={isExporting}
                        className="w-full text-sm px-3 py-2 bg-emerald-700 hover:bg-emerald-600 rounded-md transition flex items-center gap-2 btn-pressable text-white disabled:opacity-50"
                    >
                        <Icons.DownloadIcon className="h-4 w-4 mr-1 flex-shrink-0" />
                        <span>{isExporting ? 'エクスポート中…' : 'バックアップを作成'}</span>
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
                        accept=".json,application/json"
                        className="hidden"
                    />
                </div>
            </div>
        </div>
    );
};
