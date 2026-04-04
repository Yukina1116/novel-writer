import React, { useRef } from 'react';
import Draggable from 'react-draggable';
import * as Icons from '../icons';
import { useStore } from '../store/index';
import { LeftPanelTab } from '../types';

import { CharacterListPanel } from './panels/CharacterListPanel';
import { WorldListPanel } from './panels/WorldListPanel';
import { KnowledgeListPanel } from './panels/KnowledgeListPanel';
import { PlotListPanel } from './panels/PlotListPanel';
import { OutlinePanel } from './panels/OutlinePanel';
import { HistoryPanel } from './panels/HistoryPanel';

interface FloatingWindowProps {
    id: string;
    type: LeftPanelTab;
    position: { x: number; y: number };
    size: { width: number; height: number };
    zIndex: number;
}

const panelMap: Record<LeftPanelTab, { component: React.FC<any>; label: string; icon: React.ReactNode }> = {
    settings: { component: null, label: '設定', icon: <Icons.SettingsIcon /> },
    characters: { component: CharacterListPanel, label: 'キャラクター', icon: <Icons.UserPlusIcon /> },
    worlds: { component: WorldListPanel, label: '世界観', icon: <Icons.GlobeIcon /> },
    knowledge: { component: KnowledgeListPanel, label: 'ナレッジ', icon: <Icons.LightbulbIcon /> },
    plots: { component: PlotListPanel, label: 'プロット', icon: <Icons.ClipboardListIcon /> },
    outline: { component: OutlinePanel, label: 'アウトライン', icon: <Icons.ListOrderedIcon /> },
    history: { component: HistoryPanel, label: '操作履歴', icon: <Icons.HistoryIcon /> },
};

export const FloatingWindow: React.FC<FloatingWindowProps> = ({ id, type, position, size, zIndex }) => {
    const removeFloatingWindow = useStore(state => state.removeFloatingWindow);
    const focusWindow = useStore(state => state.focusWindow);
    const updateWindowPosition = useStore(state => state.updateWindowPosition);
    const updateWindowSize = useStore(state => state.updateWindowSize);
    const activeProjectId = useStore(state => state.activeProjectId);
    const isSimpleMode = useStore(state => activeProjectId ? state.allProjectsData[activeProjectId]?.isSimpleMode : false);
    const nodeRef = useRef(null);

    if (type === 'history' && isSimpleMode) return null;

    const PanelComponent = panelMap[type]?.component;
    const panelInfo = panelMap[type];

    const handleResizeMouseDown = (e: React.MouseEvent<HTMLDivElement>, direction: 'right' | 'bottom' | 'corner') => {
        e.preventDefault();
        e.stopPropagation();
        focusWindow(id);

        const startX = e.clientX;
        const startY = e.clientY;
        const startWidth = size.width;
        const startHeight = size.height;

        const handleMouseMove = (moveEvent: MouseEvent) => {
            let newWidth = startWidth;
            let newHeight = startHeight;

            if (direction === 'right' || direction === 'corner') {
                newWidth = startWidth + (moveEvent.clientX - startX);
            }
            if (direction === 'bottom' || direction === 'corner') {
                newHeight = startHeight + (moveEvent.clientY - startY);
            }
            
            const minWidth = 250;
            const minHeight = 300;

            updateWindowSize(id, {
                width: Math.max(minWidth, newWidth),
                height: Math.max(minHeight, newHeight),
            });
        };

        const handleMouseUp = () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    };

    if (!PanelComponent || !panelInfo) return null;

    return (
        <Draggable
            nodeRef={nodeRef}
            handle=".drag-handle"
            defaultPosition={position}
            onStart={() => focusWindow(id)}
            onStop={(e, data) => updateWindowPosition(id, { x: data.x, y: data.y })}
            cancel=".resize-handle-right, .resize-handle-bottom, .resize-handle-corner"
        >
            <div
                ref={nodeRef}
                style={{
                    width: `${size.width}px`,
                    height: `${size.height}px`,
                    zIndex,
                }}
                className="absolute bg-gray-800 border border-gray-700 rounded-lg shadow-2xl flex flex-col overflow-hidden"
                onMouseDown={() => focusWindow(id)}
            >
                <div className="drag-handle p-2 border-b border-gray-700/50 flex justify-between items-center bg-gray-900/50 cursor-move">
                    <h3 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
                        {React.cloneElement<any>(panelInfo.icon as React.ReactElement, { className: "h-4 w-4" })}
                        {panelInfo.label}
                    </h3>
                    <button
                        onClick={() => removeFloatingWindow(id)}
                        className="p-1 rounded-full text-gray-400 hover:bg-gray-700 hover:text-white btn-pressable"
                        title="ウィンドウを閉じる"
                    >
                        <Icons.XIcon className="h-4 w-4" />
                    </button>
                </div>
                <div className="flex-grow overflow-hidden">
                    <PanelComponent isFloating={true} />
                </div>
                
                {/* Resize Handles */}
                <div
                    className="resize-handle-right absolute top-0 right-0 h-full w-2 cursor-ew-resize z-10"
                    onMouseDown={(e) => handleResizeMouseDown(e, 'right')}
                />
                <div
                    className="resize-handle-bottom absolute bottom-0 left-0 w-full h-2 cursor-ns-resize z-10"
                    onMouseDown={(e) => handleResizeMouseDown(e, 'bottom')}
                />
                <div
                    className="resize-handle-corner absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize z-20"
                    onMouseDown={(e) => handleResizeMouseDown(e, 'corner')}
                    title="サイズ変更"
                >
                   <svg width="100%" height="100%" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M16 0V16H0L16 0Z" fill="#4A5568" fillOpacity="0.7"/>
                    </svg>
                </div>
            </div>
        </Draggable>
    );
};