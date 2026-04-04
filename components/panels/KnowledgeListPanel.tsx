import React, { useState } from 'react';
import * as Icons from '../../icons';
import { useShallow } from 'zustand/react/shallow';
import { useStore } from '../../store/index';
import { Tooltip } from '../Tooltip';

const EMPTY_ARRAY: any[] = [];

export const KnowledgeListPanel = ({ isFloating = false, isMobile = false }) => {
    const activeProjectId = useStore(state => state.activeProjectId);
    const knowledgeBase = useStore(useShallow(state => state.allProjectsData?.[activeProjectId || '']?.knowledgeBase || EMPTY_ARRAY));
    const openModal = useStore(state => state.openModal);
    const handleToggleKnowledgePin = useStore(state => state.handleToggleKnowledgePin);
    const handleToggleKnowledgeArchive = useStore(state => state.handleToggleKnowledgeArchive);
    const handleDeleteSetting = useStore(state => state.handleDeleteSetting);
    const addFloatingWindow = useStore(state => state.addFloatingWindow);

    const [deletingId, setDeletingId] = useState<string | null>(null);

    const knowledgeToShow = React.useMemo(() => {
        const pinned = knowledgeBase.filter(k => k.isPinned);
        const unpinnedRecent = [...knowledgeBase.filter(k => !k.isPinned)].reverse();
        return [...pinned, ...unpinnedRecent].slice(0, 15);
    }, [knowledgeBase]);

    return (
        <div className="flex flex-col h-full">
            {!isFloating && (
                <div className="p-2 border-b border-gray-700/50 flex justify-between items-center">
                    <h3 className="text-sm font-semibold text-yellow-300 flex items-center gap-2">
                        <Icons.LightbulbIcon className="h-4 w-4" />
                        ナレッジベース
                    </h3>
                    <div className="flex items-center">
                        {!isMobile && (
                            <button
                                onClick={() => addFloatingWindow('knowledge')}
                                className="p-1 rounded-full text-gray-400 hover:text-white hover:bg-gray-700 btn-pressable"
                                title="ウィンドウ化"
                            >
                                <Icons.ExternalLinkIcon className="h-4 w-4" />
                            </button>
                        )}
                        <Tooltip helpId="new_knowledge" placement="right">
                            <button onClick={() => openModal('knowledge')} className="p-1 rounded-full text-yellow-300 hover:bg-yellow-500/20 btn-pressable" title="新規項目作成"><Icons.PlusCircleIcon /></button>
                        </Tooltip>
                        <Tooltip helpId="knowledge_base_all" placement="right">
                            <button onClick={() => openModal('knowledgeBase')} className="p-1 rounded-full text-yellow-300 hover:bg-yellow-500/20 btn-pressable" title="すべて表示"><Icons.LibraryIcon className="h-5 w-5" /></button>
                        </Tooltip>
                    </div>
                </div>
            )}
            <div className="flex-grow overflow-y-auto p-2 space-y-2">
                {knowledgeToShow.map(k => (
                    <div key={k.id} className={`p-2 rounded-lg flex gap-2 ${k.isPinned ? 'bg-yellow-800/30' : 'bg-gray-800/50'} ${k.isArchived ? 'opacity-50' : ''} ${deletingId === k.id ? 'border border-red-500 bg-red-900/20' : ''}`}>
                        {k.isPinned && <Icons.PinIcon className="h-4 w-4 text-yellow-400 fill-current flex-shrink-0 mt-0.5" />}
                        <div className="flex-grow overflow-hidden">
                            <div className="flex justify-between items-start">
                                <p className={`font-bold text-sm ${k.isArchived ? 'text-white' : 'text-yellow-400'} truncate`}>{k.name}</p>
                                <div className="flex gap-1 flex-shrink-0">
                                    {deletingId === k.id ? (
                                        <div className="flex items-center gap-1 animate-fade-in">
                                            <span className="text-xs text-red-300 font-bold mr-1">削除?</span>
                                            <button onClick={() => { handleDeleteSetting(k.id, 'knowledge', true); setDeletingId(null); }} className="px-2 py-0.5 text-xs bg-red-600 text-white rounded hover:bg-red-500 shadow-md">はい</button>
                                            <button onClick={() => setDeletingId(null)} className="px-2 py-0.5 text-xs bg-gray-600 text-white rounded hover:bg-gray-500 shadow-md">いいえ</button>
                                        </div>
                                    ) : (
                                        <>
                                            <button onClick={() => handleToggleKnowledgeArchive(k.id)} className={`p-1 text-gray-400 hover:text-white btn-pressable ${k.isArchived ? 'text-white' : ''}`} title={k.isArchived ? "参照に戻す" : "非参照にする"}><Icons.ArchiveIcon className="h-4 w-4" /></button>
                                            <button onClick={() => handleToggleKnowledgePin(k.id)} className={`p-1 text-gray-400 hover:text-yellow-400 btn-pressable ${k.isPinned ? 'text-yellow-400' : ''}`} title={k.isPinned ? "ピンを外す" : "ピン留め"}><Icons.PinIcon className="h-4 w-4" /></button>
                                            <button onClick={() => openModal('knowledge', k)} className="p-1 text-gray-400 hover:text-yellow-400 btn-pressable" title="編集"><Icons.EditIcon /></button>
                                            <button onClick={() => setDeletingId(k.id)} className="p-1 text-gray-400 hover:text-red-400 btn-pressable" title="削除"><Icons.TrashIcon /></button>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};