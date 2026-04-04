import React, { useState } from 'react';
import * as Icons from '../../icons';
import { useShallow } from 'zustand/react/shallow';
import { useStore } from '../../store/index';
import { Tooltip } from '../Tooltip';

const EMPTY_ARRAY: any[] = [];

export const WorldListPanel = ({ isFloating = false, isMobile = false }) => {
    const activeProjectId = useStore(state => state.activeProjectId);
    const worlds = useStore(useShallow(state => {
        const project = state.allProjectsData?.[activeProjectId || ''];
        return project?.settings?.filter(s => s.type === 'world') || EMPTY_ARRAY;
    }));
    const openModal = useStore(state => state.openModal);
    const handleDeleteSetting = useStore(state => state.handleDeleteSetting);
    const addFloatingWindow = useStore(state => state.addFloatingWindow);

    const [deletingId, setDeletingId] = useState<string | null>(null);

    const initiateDelete = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        setDeletingId(id);
    };

    const confirmDelete = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        handleDeleteSetting(id, 'world', true);
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
                    <h3 className="text-sm font-semibold text-green-300 flex items-center gap-2">
                        <Icons.GlobeIcon className="h-4 w-4" />
                        世界観
                    </h3>
                    <div className="flex items-center">
                        {!isMobile && (
                            <button
                                onClick={() => addFloatingWindow('worlds')}
                                className="p-1 rounded-full text-gray-400 hover:text-white hover:bg-gray-700 btn-pressable"
                                title="ウィンドウ化"
                            >
                                <Icons.ExternalLinkIcon className="h-4 w-4" />
                            </button>
                        )}
                        <Tooltip helpId="new_world" placement="right">
                            <button
                                onClick={() => openModal('world')}
                                className="p-1 rounded-full text-green-300 hover:bg-green-500/20 btn-pressable"
                                title="新規世界観作成"
                            >
                                <Icons.PlusCircleIcon />
                            </button>
                        </Tooltip>
                    </div>
                </div>
            )}
            <div className="flex-grow overflow-y-auto p-2 space-y-2">
                {worlds.map(world => (
                    <div key={world.id} className={`p-2 rounded-lg flex items-center gap-2 ${deletingId === world.id ? 'bg-red-900/20 border border-red-500' : 'bg-gray-800/50'}`}>
                        <div className="flex-grow overflow-hidden">
                            <div className="flex justify-between items-start">
                                <p className="font-bold text-sm text-green-400 truncate">{world.name}</p>
                                <div className="flex gap-1 flex-shrink-0">
                                    {deletingId === world.id ? (
                                        <div className="flex items-center gap-1 animate-fade-in">
                                            <span className="text-xs text-red-300 font-bold mr-1">削除?</span>
                                            <button onClick={(e) => confirmDelete(e, world.id)} className="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-500 shadow-md">はい</button>
                                            <button onClick={cancelDelete} className="px-2 py-1 text-xs bg-gray-600 text-white rounded hover:bg-gray-500 shadow-md">いいえ</button>
                                        </div>
                                    ) : (
                                        <>
                                            <button onClick={() => openModal('world', world)} className="p-1 text-gray-400 hover:text-yellow-400 btn-pressable" title="編集"><Icons.EditIcon /></button>
                                            <button onClick={(e) => initiateDelete(e, world.id)} className="p-1 text-gray-400 hover:text-red-400 btn-pressable" title="削除"><Icons.TrashIcon /></button>
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