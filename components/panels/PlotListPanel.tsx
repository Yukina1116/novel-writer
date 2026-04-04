import React, { useState } from 'react';
import * as Icons from '../../icons';
import { useShallow } from 'zustand/react/shallow';
import { useStore } from '../../store/index';
import { Tooltip } from '../Tooltip';

const EMPTY_ARRAY: any[] = [];
const EMPTY_OBJECT: any = {};

export const PlotListPanel = ({ isFloating = false, isMobile = false }) => {
    const activeProjectId = useStore(state => state.activeProjectId);
    const plotBoard = useStore(useShallow(state => state.allProjectsData?.[activeProjectId || '']?.plotBoard || EMPTY_ARRAY));
    const plotTypeColors = useStore(useShallow(state => state.allProjectsData?.[activeProjectId || '']?.plotTypeColors || EMPTY_OBJECT));
    const openModal = useStore(state => state.openModal);
    const handleDeleteSetting = useStore(state => state.handleDeleteSetting);
    const addFloatingWindow = useStore(state => state.addFloatingWindow);

    const [deletingId, setDeletingId] = useState<string | null>(null);

    const plotsToShow = React.useMemo(() => {
        return [...plotBoard].reverse().slice(0, 15);
    }, [plotBoard]);

    const initiateDelete = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        setDeletingId(id);
    };

    const confirmDelete = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        handleDeleteSetting(id, 'plot', true);
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
                    <h3 className="text-sm font-semibold text-cyan-300 flex items-center gap-2">
                        <Icons.ClipboardListIcon className="h-4 w-4" />
                        プロットボード
                    </h3>
                    <div className="flex items-center">
                        {!isMobile && (
                            <button
                                onClick={() => addFloatingWindow('plots')}
                                className="p-1 rounded-full text-gray-400 hover:text-white hover:bg-gray-700 btn-pressable"
                                title="ウィンドウ化"
                            >
                                <Icons.ExternalLinkIcon className="h-4 w-4" />
                            </button>
                        )}
                        <Tooltip helpId="plot_plus">
                            <button onClick={() => openModal('plot')} className="p-1 rounded-full text-cyan-300 hover:bg-cyan-500/20 btn-pressable" title="新規カード作成"><Icons.PlusCircleIcon /></button>
                        </Tooltip>
                    </div>
                </div>
            )}
            <div className="flex-grow overflow-y-auto p-2 space-y-2">
                {plotsToShow.map(p => {
                    const color = plotTypeColors[p.type] || '#6b7280';
                    return (
                        <div key={p.id} className={`p-2 rounded-lg ${deletingId === p.id ? 'bg-red-900/20 border border-red-500' : 'bg-gray-800/50'}`} style={deletingId !== p.id ? { borderLeft: `3px solid ${color}` } : {}}>
                            <div className="flex justify-between items-start">
                                <p className="font-bold text-sm text-cyan-400 truncate">{p.title}</p>
                                <div className="flex gap-1 flex-shrink-0">
                                    {deletingId === p.id ? (
                                        <div className="flex items-center gap-1 animate-fade-in">
                                            <span className="text-xs text-red-300 font-bold mr-1">削除?</span>
                                            <button onClick={(e) => confirmDelete(e, p.id)} className="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-500 shadow-md">はい</button>
                                            <button onClick={cancelDelete} className="px-2 py-1 text-xs bg-gray-600 text-white rounded hover:bg-gray-500 shadow-md">いいえ</button>
                                        </div>
                                    ) : (
                                        <>
                                            <button onClick={() => openModal('plot', p)} className="p-1 text-gray-400 hover:text-yellow-400 btn-pressable flex-shrink-0" title="編集"><Icons.EditIcon /></button>
                                            <button onClick={(e) => initiateDelete(e, p.id)} className="p-1 text-gray-400 hover:text-red-400 btn-pressable flex-shrink-0" title="削除"><Icons.TrashIcon /></button>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
