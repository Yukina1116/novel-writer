
import React, { useMemo } from 'react';
import * as Icons from '../icons';
import { useStore } from '../store/index';
import { LeftPanelTab } from '../types';
import { Tooltip } from './Tooltip';

const tabConfig: { id: LeftPanelTab; icon: React.ReactNode; label: string; helpId: string; proOnly?: boolean }[] = [
    { id: 'settings', icon: <Icons.SettingsIcon />, label: 'プロジェクト設定', helpId: 'settings' },
    { id: 'characters', icon: <Icons.UserPlusIcon />, label: 'キャラクター', helpId: 'characters' },
    { id: 'worlds', icon: <Icons.GlobeIcon />, label: '世界観', helpId: 'worlds' },
    { id: 'knowledge', icon: <Icons.LightbulbIcon />, label: 'ナレッジ', helpId: 'knowledge' },
    { id: 'plots', icon: <Icons.ClipboardListIcon />, label: 'プロット', helpId: 'plots' },
    { id: 'outline', icon: <Icons.ListOrderedIcon />, label: 'アウトライン', helpId: 'outline' },
];

export const ActivityBar = () => {
    const leftPanelTab = useStore(state => state.leftPanelTab);
    const setLeftPanelTab = useStore(state => state.setLeftPanelTab);
    const activeProjectId = useStore(state => state.activeProjectId);
    const isSimpleMode = useStore(state => activeProjectId ? state.allProjectsData[activeProjectId]?.isSimpleMode : false);
    const userMode = useStore(state => state.userMode);
    const isLeftSidebarOpen = useStore(state => state.isLeftSidebarOpen);
    const setIsLeftSidebarOpen = useStore(state => state.setIsLeftSidebarOpen);
    const isSwapped = useStore(state => activeProjectId ? state.allProjectsData[activeProjectId]?.displaySettings?.swapSidebars : false);

    const visibleTabConfig = useMemo(() => {
        if (isSimpleMode) {
             return tabConfig.filter(tab => ['characters', 'worlds'].includes(tab.id));
        }
        if (userMode === 'simple') {
            return tabConfig.filter(tab => ['characters', 'knowledge', 'settings'].includes(tab.id));
        }
        if (userMode === 'standard') {
             return tabConfig.filter(tab => !tab.proOnly);
        }
        return tabConfig;
    }, [userMode, isSimpleMode]);

    // if (isSimpleMode) return null; // 削除


    const handleTabClick = (id: LeftPanelTab) => {
         if (leftPanelTab === id) {
             setIsLeftSidebarOpen(!isLeftSidebarOpen);
         } else {
             setLeftPanelTab(id);
             if (!isLeftSidebarOpen) setIsLeftSidebarOpen(true);
         }
    };

    return (
        <div 
            className={`w-14 bg-gray-900 flex flex-col items-center py-4 space-y-2 border-gray-700/50 flex-shrink-0 z-20 fixed top-0 h-full ${isSwapped ? 'right-0 border-l' : 'left-0 border-r'}`}
        >
            {visibleTabConfig.map(tab => (
                <Tooltip key={tab.id} helpId={tab.helpId} placement={isSwapped ? "left" : "right"}>
                    <button
                        onClick={() => handleTabClick(tab.id)}
                        className={`p-2 rounded-lg transition-colors ${leftPanelTab === tab.id && isLeftSidebarOpen ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:bg-gray-700 hover:text-white'}`}
                    >
                        {React.cloneElement<any>(tab.icon as React.ReactElement, { className: 'h-6 w-6' })}
                    </button>
                </Tooltip>
            ))}
        </div>
    );
};
