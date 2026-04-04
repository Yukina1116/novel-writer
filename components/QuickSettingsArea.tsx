import React from 'react';
import * as Icons from '../icons';
import { useStore } from '../store/index';
import { AiSettings, UndoScope } from '../types';

export const QuickSettingsArea: React.FC = () => {
    const userMode = useStore(state => state.userMode);
    const pinnedSettingIds = useStore(state => state.pinnedSettingIds);
    const activeProjectId = useStore(state => state.activeProjectId);
    const aiSettings = useStore(state => activeProjectId ? state.allProjectsData[activeProjectId]?.aiSettings : undefined);
    const setActiveProjectData = useStore(state => state.setActiveProjectData);
    const togglePinnedSetting = useStore(state => state.togglePinnedSetting);
    const undoScope = useStore(state => state.undoScope);
    const setUndoScope = useStore(state => state.setUndoScope);

    if (userMode === 'simple' || pinnedSettingIds.length === 0 || !aiSettings) return null;

    const handleUpdate = <K extends keyof AiSettings>(key: K, value: AiSettings[K]) => {
        setActiveProjectData(d => ({
            ...d,
            aiSettings: { ...d.aiSettings, [key]: value },
            lastModified: new Date().toISOString(),
        }), { type: 'settings', label: `クイック設定: ${key}を更新` });
    };

    const renderControl = (id: string) => {
        const commonLabelClass = "text-[10px] text-gray-500 font-bold mb-1 flex justify-between items-center";
        const removeBtn = (
            <button onClick={() => togglePinnedSetting(id)} className="opacity-0 group-hover:opacity-100 hover:text-red-400 transition-opacity">
                <Icons.XIcon className="h-3 w-3" />
            </button>
        );

        switch (id) {
            case 'undoScope':
                return (
                    <div key={id} className="group p-2 bg-gray-800/40 rounded-lg border border-gray-700/50">
                        <div className={commonLabelClass}>Undo範囲 {removeBtn}</div>
                        <select 
                            value={undoScope} 
                            onChange={(e) => setUndoScope(e.target.value as UndoScope)}
                            className="w-full bg-gray-900 border border-gray-700 rounded px-1 py-1 text-[10px] text-white"
                        >
                            <option value="all">すべて</option>
                            <option value="text-only">本文のみ</option>
                            <option value="ai-only">AIのみ</option>
                            <option value="data-only">データのみ</option>
                        </select>
                    </div>
                );
            case 'length':
                return (
                    <div key={id} className="group p-2 bg-gray-800/40 rounded-lg border border-gray-700/50">
                        <div className={commonLabelClass}>生成文章量 {removeBtn}</div>
                        <div className="flex items-center gap-2">
                            <input 
                                type="range" min="50" max="2000" step="50" 
                                value={aiSettings.length} 
                                onChange={(e) => handleUpdate('length', Number(e.target.value))} 
                                className="flex-grow h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-indigo-500" 
                            />
                            <span className="text-[10px] font-mono text-indigo-300 w-8 text-right">{aiSettings.length}</span>
                        </div>
                    </div>
                );
            case 'creativity':
                return (
                    <div key={id} className="group p-2 bg-gray-800/40 rounded-lg border border-gray-700/50">
                        <div className={commonLabelClass}>創造性 {removeBtn}</div>
                        <div className="flex gap-1">
                            {['控えめ', '普通', '大胆'].map(v => (
                                <button 
                                    key={v}
                                    onClick={() => handleUpdate('creativity', v)}
                                    className={`flex-1 text-[10px] py-1 rounded transition ${aiSettings.creativity === v ? 'bg-indigo-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'}`}
                                >
                                    {v}
                                </button>
                            ))}
                        </div>
                    </div>
                );
            case 'tone':
                return (
                    <div key={id} className="group p-2 bg-gray-800/40 rounded-lg border border-gray-700/50">
                        <div className={commonLabelClass}>トーン＆マナー {removeBtn}</div>
                        <input 
                            type="text" 
                            value={aiSettings.tone} 
                            onChange={(e) => handleUpdate('tone', e.target.value)}
                            placeholder="トーンを入力..."
                            className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-[11px] text-white focus:outline-none focus:border-indigo-500"
                        />
                    </div>
                );
            case 'perspective':
                const perspectives = [
                    {key: 'third_person_limited', label: '三人称'},
                    {key: 'first_person', label: '一人称'},
                    {key: 'third_person_omniscient', label: '全知'}
                ];
                return (
                    <div key={id} className="group p-2 bg-gray-800/40 rounded-lg border border-gray-700/50">
                        <div className={commonLabelClass}>文体・視点 {removeBtn}</div>
                        <div className="flex gap-1">
                            {perspectives.map(p => (
                                <button 
                                    key={p.key}
                                    onClick={() => handleUpdate('perspective', p.key)}
                                    className={`flex-1 text-[10px] py-1 rounded transition ${aiSettings.perspective === p.key ? 'bg-indigo-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'}`}
                                >
                                    {p.label}
                                </button>
                            ))}
                        </div>
                    </div>
                );
            case 'memoryScope':
                return (
                    <div key={id} className="group p-2 bg-gray-800/40 rounded-lg border border-gray-700/50">
                        <div className={commonLabelClass}>記憶の範囲 {removeBtn}</div>
                        <select 
                            value={aiSettings.memoryScope} 
                            onChange={(e) => handleUpdate('memoryScope', e.target.value)}
                            className="w-full bg-gray-900 border border-gray-700 rounded px-1 py-1 text-[10px] text-white"
                        >
                            <option value="current_scene">シーン</option>
                            <option value="current_chapter">現在の章</option>
                            <option value="summary">要約参照</option>
                            <option value="full_context">物語全体</option>
                        </select>
                    </div>
                );
            case 'assistantPersona':
                return (
                    <div key={id} className="group p-2 bg-gray-800/40 rounded-lg border border-gray-700/50">
                        <div className={commonLabelClass}>AIの口調 {removeBtn}</div>
                        <select 
                            value={aiSettings.assistantPersona} 
                            onChange={(e) => handleUpdate('assistantPersona', e.target.value)}
                            className="w-full bg-gray-900 border border-gray-700 rounded px-1 py-1 text-[10px] text-white"
                        >
                            <option value="polite">丁寧</option>
                            <option value="friendly">友人</option>
                            <option value="analytical">批評家</option>
                            <option value="muse">詩人</option>
                            <option value="fan">ファン</option>
                        </select>
                    </div>
                );
            case 'writingStyleMimicry':
            case 'showSpeakerInDialogue':
            case 'applySpeakerColorToDialogue':
                const labels: Record<string, string> = {
                    'writingStyleMimicry': '文体模倣',
                    'showSpeakerInDialogue': '話者名表示',
                    'applySpeakerColorToDialogue': '話者カラー'
                };
                const label = labels[id];
                const val = aiSettings[id] as boolean;
                return (
                    <div key={id} className="group p-2 bg-gray-800/40 rounded-lg border border-gray-700/50 flex flex-col justify-between">
                        <div className={commonLabelClass}>{label} {removeBtn}</div>
                        <button 
                            onClick={() => handleUpdate(id as any, !val)}
                            className={`w-full py-1 text-[10px] rounded transition font-bold ${val ? 'bg-indigo-600 text-white' : 'bg-gray-700 text-gray-500'}`}
                        >
                            {val ? 'ON' : 'OFF'}
                        </button>
                    </div>
                );
            default:
                return (
                    <div key={id} className="group p-2 bg-gray-800/40 rounded-lg border border-gray-700/50">
                        <div className={commonLabelClass}>{id} {removeBtn}</div>
                        <div className="text-[10px] text-gray-500 italic">設定項目</div>
                    </div>
                );
        }
    };

    return (
        <div className="px-4 py-2 border-b border-gray-700/30 bg-indigo-900/5">
            <div className="grid grid-cols-2 gap-2">
                {pinnedSettingIds.map(id => renderControl(id))}
            </div>
        </div>
    );
};
