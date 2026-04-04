import React, { useState } from 'react';
import * as Icons from '../../icons';
import { useShallow } from 'zustand/react/shallow';
import { useStore } from '../../store/index';
import { Tooltip } from '../Tooltip';

const EMPTY_ARRAY: any[] = [];

export const CharacterListPanel = ({ isFloating = false, isMobile = false }) => {
    const activeProjectId = useStore(state => state.activeProjectId);
    const characters = useStore(useShallow(state => {
        const project = state.allProjectsData?.[activeProjectId || ''];
        return project?.settings?.filter(s => s.type === 'character') || EMPTY_ARRAY;
    }));
    const openModal = useStore(state => state.openModal);
    const handleDeleteSetting = useStore(state => state.handleDeleteSetting);
    const addFloatingWindow = useStore(state => state.addFloatingWindow);

    // ナレッジ削除と同じく、ローカルstateで削除対象を管理
    const [deletingId, setDeletingId] = useState<string | null>(null);

    const initiateDelete = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        setDeletingId(id);
    };

    const confirmDelete = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        // skipConfirm = true で実行
        handleDeleteSetting(id, 'character', true);
        setDeletingId(null);
    };

    const cancelDelete = (e: React.MouseEvent) => {
        e.stopPropagation();
        setDeletingId(null);
    };

    return (
        <div className="flex flex-col h-full">
            {!isFloating && (
                <div className="p-2 border-b border-gray-700/50 flex justify-between items-center">
                    <h3 className="text-sm font-semibold text-blue-300 flex items-center gap-2">
                        <Icons.UserPlusIcon className="h-4 w-4" />
                        キャラクター
                    </h3>
                    <div className="flex items-center">
                        {!isMobile && (
                            <button
                                onClick={() => addFloatingWindow('characters')}
                                className="p-1 rounded-full text-gray-400 hover:text-white hover:bg-gray-700 btn-pressable"
                                title="ウィンドウ化"
                            >
                                <Icons.ExternalLinkIcon className="h-4 w-4" />
                            </button>
                        )}
                        <Tooltip helpId="new_char" placement="right">
                            <button
                                id="tutorial-add-character-btn"
                                onClick={() => openModal('character')}
                                className="p-1 rounded-full text-blue-300 hover:bg-blue-500/20 btn-pressable"
                                title="新規キャラクター作成"
                            >
                                <Icons.PlusCircleIcon />
                            </button>
                        </Tooltip>
                    </div>
                </div>
            )}
            <div className="flex-grow overflow-y-auto p-2 space-y-2">
                {characters.map(char => (
                    <div key={char.id} className={`p-2 rounded-lg flex gap-2 ${deletingId === char.id ? 'bg-red-900/20 border border-red-500' : 'bg-gray-800/50'}`}>
                        <div className="w-12 h-12 flex-shrink-0 rounded-md bg-gray-700 flex items-center justify-center">
                            {char.appearance?.imageUrl ? (
                                <img src={char.appearance.imageUrl} alt={char.name} className="w-full h-full object-cover object-top rounded-md" />
                            ) : (
                                <Icons.UserIcon className="h-6 w-6 text-gray-500" />
                            )}
                        </div>
                        <div className="flex-grow overflow-hidden">
                            <div className="flex justify-between items-start">
                                <p className="font-bold text-sm truncate" style={{ color: char.themeColor || '#60a5fa' }}>{char.name}</p>
                                <div className="flex gap-1 flex-shrink-0">
                                    {deletingId === char.id ? (
                                        <div className="flex items-center gap-1 animate-fade-in">
                                            <span className="text-xs text-red-300 font-bold mr-1">削除?</span>
                                            <button onClick={(e) => confirmDelete(e, char.id)} className="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-500 shadow-md">はい</button>
                                            <button onClick={cancelDelete} className="px-2 py-1 text-xs bg-gray-600 text-white rounded hover:bg-gray-500 shadow-md">いいえ</button>
                                        </div>
                                    ) : (
                                        <>
                                            <button onClick={() => openModal('character', char)} className="p-1 text-gray-400 hover:text-yellow-400 btn-pressable" title="編集"><Icons.EditIcon /></button>
                                            <button onClick={(e) => initiateDelete(e, char.id)} className="p-1 text-gray-400 hover:text-red-400 btn-pressable" title="削除"><Icons.TrashIcon /></button>
                                        </>
                                    )}
                                </div>
                            </div>
                            <p className="text-xs text-gray-400 truncate">{char.personality || ' '}</p>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};