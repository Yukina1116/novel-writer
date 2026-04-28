
import React from 'react';
import { useStore } from '../store/index';
import { HelpModal, GeneralHelpModal } from './HelpModals';
import { KnowledgeModal } from './KnowledgeModal';
import { AiSettingsModal } from './AiSettingsModal';
import { PreviewModal } from './PreviewModal';
import { CharacterChartModal } from './CharacterChart';
import { DisplaySettingsPopover } from './DisplaySettingsPopover';
import { HtmlExportModal } from './HtmlExportModal';
import { TimelineModal } from './TimelineModal';
import { NameGenerator } from './NameGenerator';
import { ChapterSettingsModal } from './ChapterSettingsModal';
import { KnowledgeBaseModal } from './KnowledgeBaseModal';
import { PlotBoardModal } from './PlotBoardModal';
import { GlobalSearchModal } from './GlobalSearchModal';
import { SettingItemModal } from './SettingModals';
import { SettingItem, KnowledgeItem, PlotItem } from '../types';
import * as utilityApi from '../utilityApi';
import { SyncDialog } from './SyncDialog';
import { ImportTextModal } from './ImportTextModal';
import { ImportConflictModal } from './modals/ImportConflictModal';
import { TermsConsentModal, isTermsDevBypass } from './modals/TermsConsentModal';

interface ModalManagerProps {
    displayMenuButtonRef: React.RefObject<HTMLButtonElement>;
    isMobile?: boolean;
}

export const ModalManager: React.FC<ModalManagerProps> = ({ displayMenuButtonRef, isMobile = false }) => {
    const needsTermsAccept = useStore(state => state.needsTermsAccept);
    const authStatus = useStore(state => state.authStatus);
    const activeModal = useStore(state => state.activeModal);
    const helpTopic = useStore(state => state.helpTopic);
    const setHelpTopic = useStore(state => state.setHelpTopic);
    const modalPayload = useStore(state => state.modalPayload);
    const activeProjectId = useStore(state => state.activeProjectId);
    const allProjectsData = useStore(state => state.allProjectsData);
    
    const closeModal = useStore(state => state.closeModal);
    const openModal = useStore(state => state.openModal);
    const handleSaveSetting = useStore(state => state.handleSaveSetting);
    const handleDeleteSetting = useStore(state => state.handleDeleteSetting);
    const handleSavePlotBoard = useStore(state => state.handleSavePlotBoard);
    const handleDisplaySettingChange = useStore(state => state.handleDisplaySettingChange);
    const handleSaveChart = useStore(state => state.handleSaveChart);
    const handleSaveTimeline = useStore(state => state.handleSaveTimeline);
    const handleSaveChapterSettings = useStore(state => state.handleSaveChapterSettings);
    const navigateToSetting = useStore(state => state.navigateToSetting);
    const navigateToKnowledge = useStore(state => state.navigateToKnowledge);
    const navigateToPlot = useStore(state => state.navigateToPlot);
    const navigateToChunk = useStore(state => state.navigateToChunk);
    const handleToggleKnowledgePin = useStore(state => state.handleToggleKnowledgePin);
    const setActiveProjectData = useStore(state => state.setActiveProjectData);
    const exportHtml = useStore(state => state.exportHtml);

    const activeProjectData = activeProjectId ? allProjectsData[activeProjectId] : null;

    // dev bypass で TermsConsentModal の mount 自体を抑止 (二重ガード)。
    // authStatus 'authenticated' を要求して、未認証や initializing 中の race で modal が
    // 出て即 throw する経路を閉じる。
    if (authStatus === 'authenticated' && needsTermsAccept && !isTermsDevBypass()) {
        return <TermsConsentModal />;
    }

    // importConflict can fire from ProjectSelectionScreen (no active project),
    // so handle it before the activeProjectData early-return that other modals
    // depend on.
    if (activeModal === 'importConflict') {
        return <ImportConflictModal onComplete={closeModal} />;
    }

    if (!activeProjectData) return null;

    const { settings, novelContent, knowledgeBase, plotBoard, plotTypeColors, plotRelations, plotNodePositions, timeline, timelineLanes, aiSettings, displaySettings } = activeProjectData;

    const handleGenerateNames = async (category: string, keywords: string): Promise<string[]> => {
        const result = await utilityApi.generateNames({ category, keywords });
        if (result.success === false) { alert(`名前の生成に失敗しました: ${result.error.message}`); return []; }
        return result.data;
    };
    
    if (!activeModal && !helpTopic) return null;

    let modalContent = null;
    if (activeModal) {
        switch (activeModal) {
            case 'character':
            case 'world':
                modalContent = <SettingItemModal isOpen={true} onClose={closeModal} onSave={(item) => handleSaveSetting(item, activeModal)} itemToEdit={modalPayload as SettingItem | null} itemType={activeModal} allSettings={settings} isMobile={isMobile} />;
                break;
            case 'knowledge':
                modalContent = <KnowledgeModal isOpen={true} onClose={closeModal} onSave={(item) => handleSaveSetting(item, 'knowledge')} itemToEdit={modalPayload as KnowledgeItem | null} allKnowledge={knowledgeBase} isMobile={isMobile} />;
                break;
            case 'plot':
                modalContent = <PlotBoardModal isOpen={true} onClose={closeModal} onSave={handleSavePlotBoard} plotItems={plotBoard} relations={plotRelations} nodePositions={plotNodePositions} plotTypeColors={plotTypeColors} itemToEdit={modalPayload as PlotItem | null} isMobile={isMobile} />;
                break;
            case 'aiSettings':
                modalContent = <AiSettingsModal isOpen={true} onClose={closeModal} settings={aiSettings} onHelpClick={(topic) => openModal('help', { topic })} userProfile={activeProjectData?.userProfile} setActiveProjectData={setActiveProjectData} displaySettings={displaySettings} handleDisplaySettingChange={handleDisplaySettingChange} isMobile={isMobile} />;
                break;
            case 'preview':
                modalContent = <PreviewModal isOpen={true} onClose={closeModal} title={activeProjectData?.name} content={novelContent} characters={settings.filter(s => s.type === 'character')} knowledgeBase={knowledgeBase} aiSettings={aiSettings} />;
                break;
            case 'generalHelp':
                modalContent = <GeneralHelpModal isOpen={true} onClose={closeModal} />;
                break;
            case 'characterChart':
                modalContent = <CharacterChartModal isOpen={true} onClose={closeModal} characters={settings.filter(s => s.type === 'character')} relations={activeProjectData?.characterRelations || []} nodePositions={activeProjectData?.nodePositions || []} onSave={handleSaveChart} onHelpClick={(topic) => openModal('help', { topic })} isMobile={isMobile} />;
                break;
            case 'htmlExport':
                modalContent = <HtmlExportModal isOpen={true} onClose={closeModal} onExport={exportHtml} displaySettings={displaySettings} settings={settings} />;
                break;
            case 'timeline':
                modalContent = <TimelineModal isOpen={true} onClose={closeModal} timeline={timeline} lanes={timelineLanes} onSave={handleSaveTimeline} allSettings={settings} plotBoard={plotBoard} isMobile={isMobile} />;
                break;
            case 'nameGenerator':
                modalContent = <NameGenerator isOpen={true} onClose={closeModal} onGenerate={handleGenerateNames} onApply={(name) => { navigator.clipboard.writeText(name); useStore.getState().showToast(`「${name}」をコピーしました`); closeModal(); }} applyButtonText="コピー" initialCategory="ファンタジー風" />;
                break;
            case 'knowledgeBase':
                modalContent = <KnowledgeBaseModal isOpen={true} onClose={closeModal} knowledgeBase={knowledgeBase} onAddItem={() => openModal('knowledge')} onEditItem={(item) => openModal('knowledge', item)} onDeleteItem={(id) => handleDeleteSetting(id, 'knowledge', true)} onTogglePin={handleToggleKnowledgePin} />;
                break;
            case 'chapterSettings':
                modalContent = <ChapterSettingsModal isOpen={true} onClose={closeModal} chapter={modalPayload} onSave={handleSaveChapterSettings} />;
                break;
            case 'globalSearch':
                modalContent = <GlobalSearchModal isOpen={true} onClose={closeModal} characters={settings.filter(s => s.type === 'character')} worldSettings={settings.filter(s => s.type === 'world')} knowledgeBase={knowledgeBase} plotBoard={plotBoard} novelContent={novelContent} onNavigateToSetting={(item, type) => { closeModal(); navigateToSetting(item, type); }} onNavigateToKnowledge={(item) => { closeModal(); navigateToKnowledge(item); }} onNavigateToPlot={(item) => { closeModal(); navigateToPlot(item); }} onNavigateToChunk={(id) => { closeModal(); navigateToChunk(id); }} />;
                break;
            case 'syncDialog':
                modalContent = <SyncDialog />;
                break;
            case 'displaySettings':
                modalContent = <DisplaySettingsPopover isOpen={true} onClose={closeModal} anchorRef={displayMenuButtonRef} settings={displaySettings} onSettingChange={handleDisplaySettingChange} />;
                break;
            case 'importText':
                modalContent = <ImportTextModal />;
                break;
        }
    }

    const helpModal = helpTopic ? <HelpModal isOpen={true} onClose={() => setHelpTopic(null)} topic={helpTopic} /> : null;

    return <>{modalContent}{helpModal}</>;
};
