import React from 'react';
import * as Icons from '../icons';
import { useStore } from '../store/index';
import { SaveStatusIndicator } from './SaveStatusIndicator';
import { SettingsPanel } from './panels/SettingsPanel';
import { ExportPanel } from './panels/ExportPanel';
import { CharacterListPanel } from './panels/CharacterListPanel';
import { WorldListPanel } from './panels/WorldListPanel';
import { KnowledgeListPanel } from './panels/KnowledgeListPanel';
import { PlotListPanel } from './panels/PlotListPanel';
import { OutlinePanel } from './panels/OutlinePanel';
import { LeftPanelTab } from '../types';
import { Tooltip } from './Tooltip';

interface LeftPanelProps {
    onExportProject: () => void;
    onExportTxt: () => void;
    isMobile?: boolean;
}

export const LeftPanel: React.FC<LeftPanelProps> = ({ onExportProject, onExportTxt, isMobile = false }) => {
    const leftSidebarWidth = useStore(state => state.leftSidebarWidth);
    const saveStatus = useStore(state => state.saveStatus);
    const leftPanelTab = useStore(state => state.leftPanelTab);
    const setLeftPanelTab = useStore(state => state.setLeftPanelTab);
    const setActiveProjectId = useStore(state => state.setActiveProjectId);
    const activeProjectId = useStore(state => state.activeProjectId);
    const isSimpleMode = useStore(state => activeProjectId ? state.allProjectsData[activeProjectId]?.isSimpleMode : undefined);
    const userMode = useStore(state => state.userMode);
    const setIsLeftSidebarOpen = useStore(state => state.setIsLeftSidebarOpen);

    const resizeTransitionClass = isMobile ? '' : 'transition-[width] duration-300 ease-in-out';
    const widthStyle = isMobile ? { width: '100%', height: '100%' } : { width: `${leftSidebarWidth}px` };
    
    const renderContent = () => {
        if (isSimpleMode) {
             return (
                <div className="p-4 space-y-4">
                    <CharacterListPanel isMobile={isMobile} />
                    <WorldListPanel isMobile={isMobile} />
                    <ExportPanel onExportProject={onExportProject} onExportTxt={onExportTxt} />
                </div>
            );
        }

        const currentTabId = userMode === 'simple' ? 'settings' : leftPanelTab;
        
        switch (currentTabId) {
            case 'settings': return <SettingsPanel onExportProject={onExportProject} onExportTxt={onExportTxt} />;
            case 'characters': return <CharacterListPanel isMobile={isMobile} />;
            case 'worlds': return <WorldListPanel isMobile={isMobile} />;
            case 'knowledge': return <KnowledgeListPanel isMobile={isMobile} />;
            case 'plots': return <PlotListPanel isMobile={isMobile} />;
            case 'outline': return <OutlinePanel isMobile={isMobile} />;
            default: return null;
        }
    };
    
    const tabs: { id: LeftPanelTab; icon: React.ReactNode; label: string; }[] = [
        { id: 'settings', icon: <Icons.SettingsIcon />, label: '設定' },
        { id: 'characters', icon: <Icons.UserPlusIcon />, label: 'キャラ' },
        { id: 'worlds', icon: <Icons.GlobeIcon />, label: '世界観' },
        { id: 'knowledge', icon: <Icons.LightbulbIcon />, label: 'ナレッジ' },
        { id: 'plots', icon: <Icons.ClipboardListIcon />, label: 'プロット' },
        { id: 'outline', icon: <Icons.ListOrderedIcon />, label: '構成' },
    ];

    return (
        <div
            className={`flex-shrink-0 bg-panel-bg flex flex-col ${resizeTransitionClass} border-r border-border`}
            style={widthStyle}
            id="tutorial-left-panel"
        >
            {isMobile && (
                <div className="flex items-center justify-between p-2 bg-app-bg border-b border-border">
                     <h3 className="text-sm font-bold text-text-main ml-2">設定・ツール</h3>
                     <button 
                        onClick={() => setIsLeftSidebarOpen(false)}
                        className="p-2 text-text-muted hover:text-text-main"
                    >
                        <Icons.XIcon className="h-5 w-5" />
                    </button>
                </div>
            )}
            
            {isMobile && !isSimpleMode && userMode !== 'simple' && (
                <div className="flex overflow-x-auto bg-app-bg border-b border-border no-scrollbar flex-shrink-0">
                    {tabs.map(tab => (
                         <button
                            key={tab.id}
                            onClick={() => setLeftPanelTab(tab.id)}
                            className={`flex-shrink-0 flex flex-col items-center justify-center px-4 py-2 text-xs min-w-[60px] ${leftPanelTab === tab.id ? 'text-accent border-b-2 border-accent bg-panel-bg' : 'text-text-muted hover:text-text-main hover:bg-panel-bg'}`}
                        >
                            {React.cloneElement<any>(tab.icon as React.ReactElement, { className: 'h-5 w-5 mb-1' })}
                            <span>{tab.label}</span>
                        </button>
                    ))}
                </div>
            )}

            <div className="flex-grow flex flex-col overflow-hidden">
                {!isMobile && (
                    <div className="p-4 border-b border-border flex flex-col gap-4">
                        <div className="flex justify-between items-center">
                            <Tooltip helpId="settings">
                                <button onClick={() => setActiveProjectId(null)} className="flex items-center text-sm text-text-main hover:text-text-main transition btn-pressable">
                                    <Icons.ArrowLeftIcon />
                                    プロジェクト一覧へ
                                </button>
                            </Tooltip>
                            <SaveStatusIndicator status={saveStatus} />
                        </div>
                    </div>
                )}
                <div className="flex-grow overflow-y-auto pb-20 sm:pb-0">
                    {renderContent()}
                    {isMobile && (
                         <div 
                            className="p-4 mt-4 border-t border-border"
                            style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
                         >
                            <button onClick={() => setActiveProjectId(null)} className="w-full flex items-center gap-2 px-3 py-2 text-sm bg-panel-bg hover:bg-app-bg text-text-main rounded-md transition btn-pressable">
                                <Icons.ArrowLeftIcon className="h-4 w-4"/>
                                <span>プロジェクト一覧へ</span>
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
