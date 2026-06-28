import React, { useState, useRef } from 'react';
import * as Icons from '../icons';
import { Project } from '../types';
import { AuthButton } from './AuthButton';
import { useStore } from '../store/index';
import { STALE_BACKUP_DAYS, formatLastExportedAt } from '../utils/backupFormat';
import { readFileAsText } from '../utils/readFileAsText';

interface ProjectSelectionScreenProps {
    projects: Project[];
    onCreateProject: (projectName: string, mode: 'simple' | 'standard') => void;
    onDeleteProject: (projectId: string) => void;
    onImportProject: (event: React.ChangeEvent<HTMLInputElement>) => void;
    onSelectProject: (projectId: string) => void;
}
export function ProjectSelectionScreen({ projects, onCreateProject, onDeleteProject, onImportProject, onSelectProject }: ProjectSelectionScreenProps) {
    const [newProjectName, setNewProjectName] = useState('');
    const [newProjectMode, setNewProjectMode] = useState<'simple' | 'standard'>('simple');
    const [showWarning, setShowWarning] = useState(true);
    const [deletingProjectId, setDeletingProjectId] = useState<string | null>(null);
    const importInputRef = useRef(null);
    const handleCreate = (e) => { e.preventDefault(); if (!newProjectName.trim()) return; onCreateProject(newProjectName, newProjectMode); setNewProjectName(''); };

    // Issue #104: データ管理セクション (全データバックアップを SettingsPanel から移設)。
    const openModal = useStore(state => state.openModal);
    const lastExportedAt = useStore(state => state.lastExportedAt);
    const isStale = useStore(state => state.isBackupStale());
    const isExporting = useStore(state => state.isExporting);
    const prepareImport = useStore(state => state.prepareImport);
    const showToast = useStore(state => state.showToast);
    const backupImportInputRef = useRef<HTMLInputElement>(null);

    const handleBackupImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        try {
            const raw = await readFileAsText(file);
            const result = await prepareImport(raw);
            // 暗号化 envelope の場合は pendingDecryption が ModalManager 経由で自動 mount。
            // 平文はここで ImportConflictModal を開く。
            if (result.kind === 'plaintext') {
                openModal('importConflict');
            }
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'インポートの準備に失敗しました';
            showToast(msg, 'error');
        }
    };
    return (
        <div className="min-h-screen bg-gray-900 text-gray-200 flex flex-col items-center justify-start p-4 sm:p-8">
            <div className="w-full max-w-3xl">
                <div className="flex items-center justify-end mb-4">
                    <AuthButton />
                </div>
                <h1 className="mb-4 flex justify-center">
                    <picture>
                        <source srcSet="/branding/logo-dark.svg" media="(prefers-color-scheme: dark)" />
                        <img src="/branding/logo-light.svg" alt="小説らいたー" className="h-16 w-auto" />
                    </picture>
                </h1>
                
                {showWarning && (
                    <div className="bg-yellow-900/30 border border-yellow-600/50 rounded-lg p-4 mb-8 flex items-start gap-3 animate-in fade-in slide-in-from-top-4">
                        <Icons.AlertTriangleIcon className="h-6 w-6 text-yellow-500 flex-shrink-0 mt-0.5" />
                        <div className="text-sm text-yellow-100 flex-grow">
                            <h3 className="font-bold text-yellow-400 mb-1">データ消失にご注意ください</h3>
                            <p className="opacity-90 leading-relaxed">
                                このアプリのデータは<strong>ブラウザ内（ローカルストレージ）</strong>にのみ保存されます。<br />
                                ブラウザの履歴削除やキャッシュクリアを行うと、<strong>全ての物語が消えてしまう可能性があります。</strong><br />
                                大切なデータは、定期的に「プロジェクトをエクスポート」してバックアップ（ファイルとして保存）することを強くおすすめします。
                            </p>
                        </div>
                        <button onClick={() => setShowWarning(false)} className="text-yellow-500 hover:text-yellow-300 p-1 hover:bg-yellow-500/20 rounded transition">
                            <Icons.XIcon className="h-5 w-5" />
                        </button>
                    </div>
                )}

                <p className="text-center text-gray-400 mb-8">始めるプロジェクトを選択するか、新しいプロジェクトを作成してください。</p>
                <div className="bg-gray-800/50 p-6 rounded-lg shadow-lg mb-8">
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-xl font-semibold">新しい物語を始める</h2>
                        <button onClick={() => importInputRef.current.click()} className="flex flex-shrink-0 items-center whitespace-nowrap px-4 py-2 text-sm rounded-md btn-pressable btn-invert-green"><Icons.DownloadIcon />プロジェクトをインポート</button>
                        <input type="file" ref={importInputRef} onChange={onImportProject} accept=".json" className="hidden"/>
                    </div>
                    <form onSubmit={handleCreate}>
                        <div className="mb-4">
                            <label className="block text-xs font-medium text-gray-400 mb-2">プロジェクトモード</label>
                            <div className="flex gap-4 rounded-lg bg-gray-900 p-1">
                                <button type="button" onClick={() => setNewProjectMode('simple')} className={`flex-1 text-center text-sm py-2 rounded-md btn-pressable ${newProjectMode === 'simple' ? 'bg-indigo-600 text-white font-semibold' : 'text-gray-300 hover:bg-gray-700'}`}>
                                    <h4 className="font-bold">シンプルモード</h4>
                                    <p className="text-xs mt-1 px-2">初めての方におすすめの、執筆に集中できる画面です。</p>
                                </button>
                                <button type="button" onClick={() => setNewProjectMode('standard')} className={`flex-1 text-center text-sm py-2 rounded-md btn-pressable ${newProjectMode === 'standard' ? 'bg-indigo-600 text-white font-semibold' : 'text-gray-300 hover:bg-gray-700'}`}>
                                    <h4 className="font-bold">標準モード</h4>
                                    <p className="text-xs mt-1 px-2">全ての機能を利用できる、多機能な編集画面です。</p>
                                </button>
                            </div>
                        </div>
                        <div className="flex gap-4 items-end">
                            <div className="flex-grow">
                                <label htmlFor="new-project-name" className="block text-xs font-medium text-gray-400 mb-1">
                                    物語のタイトル * <span className="text-xs text-gray-500">(タイトルは後からでも変更できます)</span>
                                </label>
                                <input id="new-project-name" type="text" value={newProjectName} onChange={(e) => setNewProjectName(e.target.value)} placeholder="タイトル..." className="w-full bg-gray-900 border border-gray-600 rounded-md px-4 py-2 text-sm"/>
                            </div>
                            <button type="submit" className="flex-shrink-0 whitespace-nowrap px-6 py-2 h-[42px] rounded-md font-semibold disabled:bg-gray-500 btn-pressable btn-invert-indigo" disabled={!newProjectName.trim()}>作成</button>
                        </div>
                    </form>
                </div>
                <div className="bg-gray-800/50 p-6 rounded-lg shadow-lg mb-8">
                    <h2 className="text-xl font-semibold mb-2">データ管理</h2>
                    <p className="text-sm text-gray-400 mb-4">
                        すべてのプロジェクトを 1 つのファイルにまとめて保存・復元できます。
                        暗号化エクスポートと復元のどちらもここから操作します。
                    </p>
                    <div className={`text-xs mb-3 ${isStale ? 'text-yellow-400' : 'text-gray-400'}`}>
                        最終バックアップ: {formatLastExportedAt(lastExportedAt)}
                        {isStale && ` (推奨は ${STALE_BACKUP_DAYS} 日以内)`}
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <button
                            type="button"
                            onClick={() => openModal('exportEncrypt')}
                            disabled={isExporting}
                            className="flex items-center justify-center gap-2 px-4 py-2 text-sm rounded-md btn-pressable bg-emerald-700 text-white hover:bg-emerald-600 disabled:opacity-50"
                        >
                            <Icons.DownloadIcon className="h-4 w-4 flex-shrink-0" />
                            <span>{isExporting ? 'エクスポート中…' : '全データをエクスポート'}</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => backupImportInputRef.current?.click()}
                            className="flex items-center justify-center gap-2 px-4 py-2 text-sm rounded-md btn-pressable bg-gray-700 text-gray-200 hover:bg-gray-600"
                        >
                            <Icons.UploadIcon className="h-4 w-4 flex-shrink-0" />
                            <span>バックアップから復元</span>
                        </button>
                        <input
                            type="file"
                            ref={backupImportInputRef}
                            onChange={handleBackupImportFile}
                            accept=".json,application/json"
                            className="hidden"
                        />
                    </div>
                </div>

                <div className="bg-gray-800/50 p-6 rounded-lg shadow-lg">
                    <h2 className="text-xl font-semibold mb-4">既存の物語</h2>
                    <div className="space-y-3 max-h-60 overflow-y-auto pr-2">
                        {projects.length > 0 ? (
                            [...projects].sort((a, b) => {
                                const timeA = new Date(a.lastModified).getTime();
                                const timeB = new Date(b.lastModified).getTime();
                                return (isNaN(timeB) ? 0 : timeB) - (isNaN(timeA) ? 0 : timeA);
                            }).map(project => (
                                <div key={project.id} className="flex items-center justify-between bg-gray-900/70 p-4 rounded-md hover:bg-gray-900 transition group min-h-[72px]">
                                    <div className="flex flex-col">
                                        <span className="font-medium">{project.name}</span>
                                        {project.lastModified && <span className="text-xs text-gray-500">最終更新: {new Date(project.lastModified).toLocaleString()}</span>}
                                    </div>
                                    <div className="flex gap-3 items-center">
                                        {deletingProjectId === project.id ? (
                                            <div className="flex items-center gap-2 animate-in fade-in slide-in-from-right-2 duration-200">
                                                <span className="text-sm text-red-400 font-bold mr-1">削除しますか？</span>
                                                <button 
                                                    onClick={() => {
                                                        console.log('DELETE CONFIRMED', project.id);
                                                        onDeleteProject(project.id);
                                                        setDeletingProjectId(null);
                                                    }} 
                                                    className="px-3 py-1 bg-red-600 hover:bg-red-500 text-white text-xs rounded shadow-md btn-pressable"
                                                >
                                                    はい
                                                </button>
                                                <button 
                                                    onClick={() => setDeletingProjectId(null)} 
                                                    className="px-3 py-1 bg-gray-600 hover:bg-gray-500 text-white text-xs rounded shadow-md btn-pressable"
                                                >
                                                    いいえ
                                                </button>
                                            </div>
                                        ) : (
                                            <>
                                                <button onClick={() => onSelectProject(project.id)} className="px-4 py-1 text-sm rounded-md btn-pressable btn-invert-blue">開く</button>
                                                <button 
                                                    onClick={() => setDeletingProjectId(project.id)} 
                                                    className="p-2 rounded-full text-gray-400 hover:bg-red-500 hover:text-white transition btn-pressable"
                                                    title="削除"
                                                >
                                                    <Icons.TrashIcon />
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </div>
                            ))
                        ) : (
                            <p className="text-center text-gray-500 py-4">まだプロジェクトがありません。</p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}