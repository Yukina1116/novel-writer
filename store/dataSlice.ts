
import { v4 as uuidv4 } from 'uuid';
import { Project, SettingItem, KnowledgeItem, PlotItem, Relation, NodePosition, TimelineEvent, PlotRelation, PlotNodePosition, TimelineLane, DisplaySettings, NovelChunk, HistoryType, AnalysisResult } from '../types';
import { getChapterChunks } from '../utils';
import { renderMarkdown } from '../utils/sanitizeHtml';
import { FONT_MAP } from '../constants';
import * as analysisApi from '../analysisApi';

const initialState = {
    lastAnalysisResult: null as AnalysisResult | null,
};

export interface DataSlice {
    lastAnalysisResult: AnalysisResult | null;
    setActiveProjectData: (updater: (data: Project) => Project, historyLabel?: { type: HistoryType; label: string }, options?: { mode: 'merge' | 'replace' }) => void;
    handleSaveSetting: (newItem: Partial<SettingItem | KnowledgeItem>, type?: 'character' | 'world' | 'knowledge') => void;
    handleDeleteSetting: (id: string, type: 'character' | 'world' | 'knowledge' | 'plot', skipConfirm?: boolean) => void;
    handleSavePlotBoard: (data: { items: PlotItem[], relations: PlotRelation[], positions: PlotNodePosition[], colors: { [key: string]: string } }) => void;
    handleDisplaySettingChange: (key: keyof DisplaySettings, value: any) => void;
    handleSaveChart: (relations: Relation[], positions: NodePosition[]) => void;
    handleSaveTimeline: (timeline: TimelineEvent[], lanes: TimelineLane[]) => void;
    handleSaveChapterSettings: (details: { id: string; newTitle: string; newMemo: string; isUncategorized: boolean }) => void;
    handleDeleteChapter: (chapterId: string) => void;
    handleNovelTextChange: (chunkId: string, newText: string) => void;
    handleToggleChunkPin: (chunkId: string) => void;
    handleAddNewChunk: () => void;
    addChapter: () => void;
    handleChapterDrop: (dropOnChapterId: string) => void;
    handleToggleKnowledgePin: (knowledgeId: string) => void;
    handleToggleKnowledgeArchive: (knowledgeId: string) => void;
    reorderKnowledge: (newKnowledgeBase: KnowledgeItem[]) => void;
    reorderKnowledgeCategories: (newCategoryOrder: string[]) => void;
    navigateToSetting: (item: SettingItem, type: 'character' | 'world') => void;
    navigateToKnowledge: (item: KnowledgeItem) => void;
    navigateToPlot: (item: PlotItem) => void;
    navigateToChunk: (chunkId: string) => void;
    navigateToEvent: (eventId: string) => void;
    exportHtml: (options: any) => void;
    createEventFromPlot: (plotId: string, currentPlotData?: { items: PlotItem[], relations: PlotRelation[], positions: PlotNodePosition[], colors: { [key: string]: string } }) => void;
    createPlotFromEvent: (eventId: string) => void;
    syncLinkedData: () => void;
    unlinkItems: () => void;

    // Analysis
    analyzeImportedText: (text: string) => Promise<void>;
    clearAnalysisResult: () => void;
    applyAnalysisResults: (selections: {
        characters: { name: string; action: 'create' | 'link' | 'ignore'; targetId?: string }[];
        worldTerms: { name: string; action: 'world' | 'knowledge' | 'ignore' }[];
    }, importedText: string) => void;
}

export const createDataSlice = (set, get): DataSlice => ({
    ...initialState,
    setActiveProjectData: (updater, historyLabel, options = { mode: "merge" }) => {
        const { activeProjectId, allProjectsData, addHistory } = get();
        if (!activeProjectId) return;

        const currentProject = allProjectsData[activeProjectId];

        const newProjectData = updater(currentProject);

        set(state => ({
            allProjectsData: {
                ...state.allProjectsData,
                [activeProjectId]: newProjectData
            }
        }));

        if (historyLabel) {
            addHistory(newProjectData, historyLabel);
        }

        get().markDirty();
    },
    handleSaveSetting: (newItem, type) => {
        const { activeModal } = get();
        const itemType = type || activeModal;
        const isNew = !newItem.id;
        const labelAction = isNew ? '作成' : '更新';
        const labelName = newItem.name || '無題';
        let labelType: HistoryType;
        let labelText: string;

        switch(itemType) {
            case 'character':
                labelType = 'character';
                labelText = `キャラクター「${labelName}」を${labelAction}`;
                break;
            case 'world':
                labelType = 'world';
                labelText = `世界観「${labelName}」を${labelAction}`;
                break;
            case 'knowledge':
                labelType = 'knowledge';
                labelText = `ナレッジ「${labelName}」を${labelAction}`;
                break;
            default:
                labelType = 'settings';
                labelText = '設定を更新';
        }

        get().setActiveProjectData(d => {
            let updatedProject = { ...d, lastModified: new Date().toISOString() };
            const baseItem = { ...newItem, isAutoFilled: false };
            
            switch (itemType) {
                case 'character':
                case 'world':
                    const newSettings = newItem.id
                        ? d.settings.map(s => s.id === newItem.id ? { ...s, ...(baseItem as Partial<SettingItem>) } : s)
                        : [...d.settings, { ...baseItem, id: uuidv4(), type: itemType } as SettingItem];
                    updatedProject.settings = newSettings;
                    break;
                case 'knowledge':
                    const newKnowledgeBase = newItem.id
                        ? d.knowledgeBase.map(k => k.id === newItem.id ? { ...k, ...(baseItem as Partial<KnowledgeItem>) } : k)
                        : [...d.knowledgeBase, { ...baseItem, id: uuidv4() } as KnowledgeItem];
                    updatedProject.knowledgeBase = newKnowledgeBase;
                    break;
            }
            return updatedProject;
        }, { type: labelType, label: labelText });
        get().closeModal();
    },
    handleDeleteSetting: (id: string, type: 'character' | 'world' | 'knowledge' | 'plot', skipConfirm = false) => {
        if (!skipConfirm && !window.confirm('本当に削除しますか？この操作は取り消せません。')) {
            return;
        }

        const { activeProjectId, allProjectsData, setActiveProjectData } = get();
        if (!activeProjectId) return;
        const project = allProjectsData[activeProjectId];
        if (!project) return;
        
        let labelText = '';
        switch (type) {
            case 'character':
            case 'world':
                const setting = project.settings.find(s => s.id === id);
                labelText = `${type === 'character' ? 'キャラクター' : '世界観'}「${setting?.name || '無題'}」を削除`;
                break;
            case 'knowledge':
                const knowledge = project.knowledgeBase.find(k => k.id === id);
                labelText = `ナレッジ「${knowledge?.name || '無題'}」を削除`;
                break;
            case 'plot':
                const plot = project.plotBoard.find(p => p.id === id);
                labelText = `プロット「${plot?.title || '無題'}」を削除`;
                break;
        }

        setActiveProjectData(d => {
            let updatedProject = { ...d, lastModified: new Date().toISOString() };
            switch (type) {
                case 'character':
                case 'world':
                    updatedProject.settings = d.settings.filter(s => s.id !== id);
                    if (type === 'character') {
                        updatedProject.characterRelations = (d.characterRelations || []).filter(r => r.source !== id && r.target !== id);
                        updatedProject.nodePositions = (d.nodePositions || []).filter(p => p.characterId !== id);
                    }
                    if (type === 'world') {
                        updatedProject.timeline = (d.timeline || []).map(event => 
                            event.locationId === id ? { ...event, locationId: '' } : event
                        );
                    }
                    break;
                case 'knowledge':
                    updatedProject.knowledgeBase = d.knowledgeBase.filter(k => k.id !== id);
                    break;
                case 'plot':
                    updatedProject.plotBoard = d.plotBoard.filter(p => p.id !== id);
                    updatedProject.plotRelations = (d.plotRelations || []).filter(r => r.source !== id && r.target !== id);
                    updatedProject.plotNodePositions = (d.plotNodePositions || []).filter(p => p.plotId !== id);
                    updatedProject.timeline = (d.timeline || []).map(event => 
                        event.linkedPlotId === id ? { ...event, linkedPlotId: undefined } : event
                    );
                    break;
            }
            return updatedProject;
        }, { type, label: labelText });
        get().closeModal();
    },
    handleSavePlotBoard: (data: { items: PlotItem[], relations: PlotRelation[], positions: PlotNodePosition[], colors: { [key: string]: string } }) => {
        const { openModal, allProjectsData, activeProjectId, setActiveProjectData } = get();
        const oldProject = allProjectsData[activeProjectId];
        if (oldProject) {
            const oldPlotsMap = new Map(oldProject.plotBoard.map(p => [p.id, p]));
            const timelineMap = new Map(oldProject.timeline.map(e => [e.id, e]));
    
            for (const newPlot of data.items) {
                const oldPlot = oldPlotsMap.get(newPlot.id) as PlotItem | undefined;
                if (oldPlot && newPlot.linkedEventId && (newPlot.lastModified || 0) > (oldPlot.lastModified || 0)) {
                    const linkedEvent = timelineMap.get(newPlot.linkedEventId) as TimelineEvent | undefined;
                    if (linkedEvent && (linkedEvent.lastModified || 0) < (newPlot.lastModified || 0)) {
                        if(linkedEvent.title !== newPlot.title || linkedEvent.description !== newPlot.summary) {
                            openModal('syncDialog', { plotId: newPlot.id, eventId: newPlot.linkedEventId });
                        }
                    }
                }
            }
        }

        const currentProject = allProjectsData[activeProjectId];
        const newPlotIds = new Set(data.items.map(p => p.id));
        const updatedTimeline = currentProject ? currentProject.timeline.map(event => {
            if (event.linkedPlotId && !newPlotIds.has(event.linkedPlotId)) {
                return { ...event, linkedPlotId: undefined };
            }
            return event;
        }) : [];

        setActiveProjectData(d => ({
            ...d,
            plotBoard: data.items,
            plotRelations: data.relations,
            plotNodePositions: data.positions,
            plotTypeColors: data.colors,
            timeline: updatedTimeline,
            lastModified: new Date().toISOString(),
        }), { type: 'plot', label: 'プロットボードを更新' });
    },
    handleDisplaySettingChange: (key, value) => {
        get().setActiveProjectData(d => ({ ...d, displaySettings: { ...d.displaySettings, [key]: value } }), { type: 'settings', label: '表示設定を更新' });
    },
    handleSaveChart: (relations, positions) => {
        get().setActiveProjectData(d => ({ ...d, characterRelations: relations, nodePositions: positions, lastModified: new Date().toISOString() }), { type: 'chart', label: '相関図を更新' });
    },
    handleSaveTimeline: (timeline: TimelineEvent[], lanes: TimelineLane[]) => {
        const { openModal, allProjectsData, activeProjectId, setActiveProjectData } = get();
        const oldProject = allProjectsData[activeProjectId];
        if (oldProject) {
            const oldEventsMap = new Map(oldProject.timeline.map(e => [e.id, e]));
            const plotBoardMap = new Map(oldProject.plotBoard.map(p => [p.id, p]));
    
            for (const newEvent of timeline) {
                const oldEvent = oldEventsMap.get(newEvent.id) as TimelineEvent | undefined;
                if (oldEvent && newEvent.linkedPlotId && (newEvent.lastModified || 0) > (oldEvent.lastModified || 0)) {
                    const linkedPlot = plotBoardMap.get(newEvent.linkedPlotId) as PlotItem | undefined;
                    if (linkedPlot && (linkedPlot.lastModified || 0) < (newEvent.lastModified || 0)) {
                        if (linkedPlot.title !== newEvent.title || linkedPlot.summary !== newEvent.description) {
                            openModal('syncDialog', { plotId: newEvent.linkedPlotId, eventId: newEvent.id });
                        }
                    }
                }
            }
        }

        const currentProject = allProjectsData[activeProjectId];
        const newEventIds = new Set(timeline.map(e => e.id));
        const updatedPlotBoard = currentProject ? currentProject.plotBoard.map(plot => {
            if (plot.linkedEventId && !newEventIds.has(plot.linkedEventId)) {
                return { ...plot, linkedEventId: undefined };
            }
            return plot;
        }) : [];

        setActiveProjectData(d => ({ 
            ...d, 
            timeline: timeline, 
            timelineLanes: lanes, 
            plotBoard: updatedPlotBoard,
            lastModified: new Date().toISOString() 
        }), { type: 'timeline', label: 'タイムラインを更新' });
    },
    handleSaveChapterSettings: ({ id, newTitle, newMemo, isUncategorized }) => {
        get().setActiveProjectData(d => {
            if (isUncategorized) {
                const chapter = d.novelContent.find(c => c.id === id);
                if (!chapter) return d;
                const newTitleChunk: NovelChunk = { id: uuidv4(), text: `# ${newTitle}`, memo: newMemo };
                const firstContentChunkIndex = d.novelContent.findIndex(c => c.id === id);
                return { ...d, novelContent: [...d.novelContent.slice(0, firstContentChunkIndex), newTitleChunk, ...d.novelContent.slice(firstContentChunkIndex)] };
            } else {
                return { ...d, novelContent: d.novelContent.map(c => c.id === id ? { ...c, text: `# ${newTitle}`, memo: newMemo } : c) };
            }
        }, { type: 'outline', label: `章「${newTitle}」の設定を更新` });
    },
    handleDeleteChapter: (chapterId) => {
        const { activeProjectId, allProjectsData } = get();
        const activeProject = allProjectsData[activeProjectId];
        if (!activeProject) return;
        const chunks = activeProject.novelContent;
        const chapterIndex = chunks.findIndex(c => c.id === chapterId);
        if (chapterIndex === -1) return;
        let endIndex = chunks.length;
        for (let i = chapterIndex + 1; i < chunks.length; i++) {
            if (chunks[i].text.startsWith('# ')) {
                endIndex = i;
                break;
            }
        }
        const chapterTitle = chunks[chapterIndex].text.startsWith('# ') 
            ? chunks[chapterIndex].text.substring(2).trim() 
            : '章に属さない文章';

        get().setActiveProjectData(d => {
            const newNovelContent = [...d.novelContent];
            newNovelContent.splice(chapterIndex, endIndex - chapterIndex);
            return { ...d, novelContent: newNovelContent, lastModified: new Date().toISOString() };
        }, { type: 'outline', label: `章「${chapterTitle}」を削除` });
    },
    handleNovelTextChange: (chunkId, newText) => {
        get().setActiveProjectData(d => ({
            ...d,
            novelContent: d.novelContent.map(chunk => chunk.id === chunkId ? { ...chunk, text: newText } : chunk),
            lastModified: new Date().toISOString()
        }), { type: 'editor', label: '本文を編集' });
    },
    handleToggleChunkPin: (chunkId) => {
        get().setActiveProjectData(d => ({
            ...d,
            novelContent: d.novelContent.map(chunk => chunk.id === chunkId ? { ...chunk, isPinned: !chunk.isPinned } : chunk)
        }), { type: 'editor', label: '段落のピン留めを切り替え' });
    },
    handleAddNewChunk: () => {
        const { newChunkText } = get();
        if (!newChunkText.trim()) return;
        const newChunks = newChunkText.split(/\n\s*\n/).map(text => ({ id: uuidv4(), text: text.trim() })).filter(chunk => chunk.text);
        if (newChunks.length > 0) {
            get().setActiveProjectData(d => ({ ...d, novelContent: [...d.novelContent, ...newChunks] }), { type: 'editor', label: '新しい段落を追加' });
        }
        set({ newChunkText: '' });
    },
    addChapter: () => {
        const newChapterChunk: NovelChunk = { id: uuidv4(), text: '# 無題の章', memo: '' };
        get().setActiveProjectData(d => ({ ...d, novelContent: [...d.novelContent, newChapterChunk] }), { type: 'outline', label: '新しい章を追加' });
        get().openModal('chapterSettings', { id: newChapterChunk.id, title: '無題の章', memo: '', isUncategorized: false });
    },
    handleChapterDrop: (dropOnChapterId) => {
        const { draggedChapterId } = get();
        if (!draggedChapterId || draggedChapterId === dropOnChapterId) return;

        get().setActiveProjectData(d => {
            const novelContent = [...d.novelContent];
            const draggedChunks = getChapterChunks(novelContent, draggedChapterId);
            const dropOnChunks = getChapterChunks(novelContent, dropOnChapterId);
            if (draggedChunks.length === 0 || dropOnChunks.length === 0) return d;
            const draggedChunkIds = new Set(draggedChunks.map(c => c.id));
            const contentWithoutDragged = novelContent.filter(c => !draggedChunkIds.has(c.id));
            const dropIndex = contentWithoutDragged.findIndex(c => c.id === dropOnChunks[0].id);
            if (dropIndex === -1) return d;
            const newNovelContent = [
                ...contentWithoutDragged.slice(0, dropIndex),
                ...draggedChunks,
                ...contentWithoutDragged.slice(dropIndex)
            ];
            return { ...d, novelContent: newNovelContent, lastModified: new Date().toISOString() };
        }, { type: 'outline', label: '章の順序を変更' });
    },
    handleToggleKnowledgePin: (knowledgeId) => {
        get().setActiveProjectData(d => ({
            ...d,
            knowledgeBase: d.knowledgeBase.map(k => k.id === knowledgeId ? { ...k, isPinned: !k.isPinned } : k)
        }), { type: 'knowledge', label: 'ナレッジのピン留めを切り替え' });
    },
    handleToggleKnowledgeArchive: (knowledgeId) => {
        get().setActiveProjectData(d => ({
            ...d,
            knowledgeBase: d.knowledgeBase.map(k => k.id === knowledgeId ? { ...k, isArchived: !k.isArchived } : k)
        }), { type: 'knowledge', label: 'ナレッジのアーカイブ状態を切り替え' });
    },
    reorderKnowledge: (newKnowledgeBase) => {
        get().setActiveProjectData(d => ({
            ...d,
            knowledgeBase: newKnowledgeBase,
            lastModified: new Date().toISOString()
        }));
    },
    reorderKnowledgeCategories: (newCategoryOrder) => {
        get().setActiveProjectData(d => ({
            ...d,
            knowledgeCategoryOrder: newCategoryOrder,
            lastModified: new Date().toISOString()
        }));
    },
    navigateToSetting: (item, type) => { get().closeModal(); get().openModal(type, item); },
    navigateToKnowledge: (item) => { get().closeModal(); get().openModal('knowledge', item); },
    navigateToPlot: (item) => { get().closeModal(); get().openModal('plot', item); },
    navigateToChunk: (chunkId) => {
        get().closeModal();
        set({ highlightedChunkId: chunkId });
        setTimeout(() => document.getElementById(`chunk-${chunkId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
    },
    navigateToEvent: (eventId: string) => {
        get().closeModal();
        get().openModal('timeline');
        set({ highlightedEventId: eventId });
    },
    createEventFromPlot: (plotId: string, currentPlotData?: { items: PlotItem[], relations: PlotRelation[], positions: PlotNodePosition[], colors: { [key: string]: string } }) => {
        const { setActiveProjectData, allProjectsData, activeProjectId, showToast } = get();
        const project = allProjectsData[activeProjectId];
        if (!project) return;
        
        const plotBoard = currentPlotData ? currentPlotData.items : project.plotBoard;
        const plot = plotBoard.find(p => p.id === plotId);
        if (!plot) return;
        
        if (plot.linkedEventId) {
            showToast('このプロットはすでにリンクされています', 'info');
            return;
        }
        const newEvent: TimelineEvent = {
            id: uuidv4(),
            title: plot.title,
            description: plot.summary,
            timestamp: '未設定',
            laneId: project.timelineLanes[0]?.id || 'default',
            linkedPlotId: plot.id,
            lastModified: Date.now(),
        };
        const updatedPlot = { ...plot, linkedEventId: newEvent.id, lastModified: Date.now() };
        
        setActiveProjectData(d => ({
            ...d,
            timeline: [...d.timeline, newEvent],
            plotBoard: currentPlotData ? currentPlotData.items.map(p => p.id === plotId ? updatedPlot : p) : d.plotBoard.map(p => p.id === plotId ? updatedPlot : p),
            plotRelations: currentPlotData ? currentPlotData.relations : d.plotRelations,
            plotNodePositions: currentPlotData ? currentPlotData.positions : d.plotNodePositions,
            plotTypeColors: currentPlotData ? currentPlotData.colors : d.plotTypeColors,
        }), { type: 'timeline', label: `プロットからイベント「${newEvent.title}」を作成` });
        showToast('タイムラインにイベントを追加しました', 'success');
    },
    createPlotFromEvent: (eventId) => {
        const { setActiveProjectData, allProjectsData, activeProjectId, showToast } = get();
        const project = allProjectsData[activeProjectId];
        if (!project) return;
        const event = project.timeline.find(e => e.id === eventId);
        if (!event) return;
        if (event.linkedPlotId) {
            showToast('このイベントはすでにリンクされています', 'info');
            return;
        }
        const newPlot: PlotItem = {
            id: uuidv4(),
            title: event.title,
            summary: event.description,
            type: '章のまとめ',
            linkedEventId: event.id,
            lastModified: Date.now(),
        };
        const updatedEvent = { ...event, linkedPlotId: newPlot.id, lastModified: Date.now() };
        setActiveProjectData(d => ({
            ...d,
            plotBoard: [...d.plotBoard, newPlot],
            timeline: d.timeline.map(e => e.id === eventId ? updatedEvent : e),
        }), { type: 'plot', label: `イベントからプロット「${newPlot.title}」を作成` });
        showToast('プロットカードを作成しました', 'success');
    },
    syncLinkedData: () => {
        const { modalPayload, setActiveProjectData, allProjectsData, activeProjectId, showToast } = get();
        if (!modalPayload) return;
        const project = allProjectsData[activeProjectId];
        const plot = project.plotBoard.find(p => p.id === modalPayload.plotId);
        const event = project.timeline.find(e => e.id === modalPayload.eventId);
        if (!plot || !event) return;
        const updatedEvent = {
            ...event,
            title: plot.title,
            description: plot.summary,
            lastModified: Date.now(),
        };
        const updatedPlot = { ...plot, lastModified: Date.now() };
        setActiveProjectData(d => ({
            ...d,
            timeline: d.timeline.map(e => e.id === updatedEvent.id ? updatedEvent : e),
            plotBoard: d.plotBoard.map(p => p.id === updatedPlot.id ? updatedPlot : p),
        }), { type: 'timeline', label: `リンクされたイベント「${plot.title}」を同期` });
        showToast('関連データを更新しました', 'success');
    },
    unlinkItems: () => {
        const { modalPayload, setActiveProjectData, allProjectsData, activeProjectId, showToast } = get();
        if (!modalPayload) return;
        const project = allProjectsData[activeProjectId];
        const plot = project.plotBoard.find(p => p.id === modalPayload.plotId);
        const event = project.timeline.find(e => e.id === modalPayload.eventId);
        if (!plot || !event) return;
        const updatedPlot = { ...plot, linkedEventId: undefined, lastModified: Date.now() };
        const updatedEvent = { ...event, linkedPlotId: undefined, lastModified: Date.now() };
        setActiveProjectData(d => ({
            ...d,
            plotBoard: d.plotBoard.map(p => p.id === updatedPlot.id ? { ...updatedPlot } : p),
            timeline: d.timeline.map(e => e.id === updatedEvent.id ? { ...updatedEvent } : e),
        }), { type: 'settings', label: `プロットとイベントのリンクを解除` });
        showToast('リンクを解除しました', 'info');
    },
    exportHtml: (options) => {
        const { activeProjectId, allProjectsData } = get();
        const project = allProjectsData[activeProjectId];
        if (!project) return;
        const { novelContent, settings, knowledgeBase, aiSettings } = project;
        const useCurrent = options.useCurrentStyle;
        const theme = useCurrent ? project.displaySettings.theme : options.theme;
        const fontFamily = useCurrent ? project.displaySettings.fontFamily : options.fontFamily;
        const fontSize = useCurrent ? project.displaySettings.fontSize : options.fontSize;
        const fontCss = FONT_MAP[fontFamily] || FONT_MAP['sans'];
        let themeStyles = '';
        switch(theme) {
            case 'sepia': themeStyles = `body { background-color: #fbf0d9; color: #5b4636; } h1, h2, h3 { color: #5b4636; border-color: #dcd3c1; } a { color: #5b4636; }`; break;
            case 'dark': themeStyles = `body { background-color: #1f2937; color: #d1d5db; } h1, h2, h3 { color: #e5e7eb; border-color: #4b5568; } a { color: #93c5fd; }`; break;
            default: themeStyles = `body { background-color: #ffffff; color: #111827; } h1, h2, h3 { color: #111827; border-color: #e5e7eb; } a { color: #2563eb; }`; break;
        }
        const escapeHtml = (unsafe) => unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
        const charactersToExport = settings.filter(s => s.type === 'character' && options.selectedCharacterIds.includes(s.id));
        const worldSettingsToExport = settings.filter(s => s.type === 'world' && options.selectedWorldIds.includes(s.id));
        const chapters = novelContent.map((chunk, index) => {
            if (chunk.text.startsWith('# ')) {
                return {
                    id: `ch-${chunk.id}`,
                    title: chunk.text.split('\n')[0].substring(2).trim(),
                    index: index
                };
            }
            return null;
        }).filter(Boolean);
        const body = `
            <div class="container">
                ${options.coverType !== 'none' ? `
                    <div class="cover">
                        ${(options.coverType === 'image_only' || options.coverType === 'image_with_text') && options.coverImageSrc ? `<img src="${escapeHtml(options.coverImageSrc)}" class="cover-image" alt="Cover Image">` : ''}
                        ${(options.coverType === 'text_only' || options.coverType === 'image_with_text') ? `
                            <h1 class="title">${escapeHtml(project.name)}</h1>
                            ${options.authorName ? `<p class="author">${escapeHtml(options.authorName)}</p>` : ''}
                        ` : ''}
                    </div>
                ` : ''}
                ${options.addToc && chapters.length > 0 ? `
                    <div class="toc">
                        <h2>目次</h2>
                        <ul>
                            ${chapters.map(ch => `<li><a href="#${ch.id}">${escapeHtml(ch.title)}</a></li>`).join('')}
                        </ul>
                    </div>
                ` : ''}
                <div class="content">
                    ${novelContent.map(chunk => {
                        const isTitle = chunk.text.startsWith('# ');
                        const chapterId = isTitle ? `ch-${chunk.id}` : '';
                        return `<div id="${chapterId}">${renderMarkdown(chunk.text, settings.filter(s => s.type === 'character'), knowledgeBase, aiSettings)}</div>`;
                    }).join('')}
                </div>
                ${charactersToExport.length > 0 ? `
                    <div class="appendix">
                        <h2>登場人物</h2>
                        ${charactersToExport.map(char => `
                            <div class="char-card">
                                ${options.addCharacterImages && char.appearance?.imageUrl ? `<img src="${escapeHtml(char.appearance.imageUrl)}" alt="${escapeHtml(char.name)}">` : ''}
                                <h3>${escapeHtml(char.name)} ${char.furigana ? `(${escapeHtml(char.furigana)})` : ''}</h3>
                                <p>${escapeHtml(char.exportDescription || char.personality || '')}</p>
                            </div>
                        `).join('')}
                    </div>
                ` : ''}
                ${worldSettingsToExport.length > 0 ? `
                    <div class="appendix">
                        <h2>世界観・用語集</h2>
                        ${worldSettingsToExport.map(world => `
                            <div>
                                <h3>${escapeHtml(world.name)}</h3>
                                <p>${escapeHtml(world.exportDescription || world.longDescription || '')}</p>
                            </div>
                        `).join('')}
                    </div>
                ` : ''}
                ${options.afterword ? `<div class="appendix"><h2>あとがき</h2><div>${renderMarkdown(options.afterword, [], [], aiSettings)}</div></div>` : ''}
            </div>
        `;
        const fullHtml = `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escapeHtml(project.name)}</title><style>body { font-family: ${fontCss}; font-size: ${fontSize}px; line-height: 1.8; margin: 0; padding: 0; } .container { max-width: 800px; margin: 4rem auto; padding: 2rem; } ${themeStyles} h1, h2, h3 { line-height: 1.3; font-weight: bold; } h1.title { font-size: 2.5em; text-align: center; margin-bottom: 0.5em; } h1.chapter-title { font-size: 1.5em; margin-top: 3em; border-bottom: 1px solid; padding-bottom: 0.5em; } h2 { font-size: 1.2em; margin-top: 2em; border-bottom: 1px solid; padding-bottom: 0.3em;} p.author { text-align: center; font-size: 1.2em; color: #888; margin-bottom: 4em; } .cover { text-align: center; margin-bottom: 4rem; } .cover-image { max-width: 100%; height: auto; max-height: 70vh; margin: 0 auto 2rem; } .content > div { margin: 1.5em 0; } .toc { margin-bottom: 4rem; padding: 1.5rem; border: 1px solid #ccc; border-radius: 8px; } .toc ul { list-style: none; padding-left: 0; } .toc a { text-decoration: none; } .appendix { margin-top: 4rem; border-top: 1px solid #ccc; padding-top: 2rem; } .appendix h2 { border-bottom: none; } .char-card { margin-bottom: 2rem; overflow: hidden; } .char-card img { max-width: 150px; float: left; margin-right: 1rem; border-radius: 4px; } ruby { ruby-position: over; } rt { font-size: 0.7em; } .knowledge-link { text-decoration: none; color: inherit; font-weight: bold; }</style></head><body>${body}</body></html>`;
        const blob = new Blob([fullHtml], { type: 'text/html;charset=utf-8' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `${project.name}.html`;
        link.click();
        URL.revokeObjectURL(link.href);
    },

    analyzeImportedText: async (text: string) => {
      const { activeProjectId, allProjectsData, showToast } = get();
      if (!activeProjectId) return;
      const project = allProjectsData[activeProjectId];

      set({ isLoading: true });
      const result = await analysisApi.analyzeTextForImport(
        text,
        project.settings.filter(s => s.type === 'character'),
        project.settings.filter(s => s.type === 'world'),
        project.knowledgeBase
      );
      set({ isLoading: false });

      if (result.success === true) {
        set({ lastAnalysisResult: result.data });
        showToast('テキスト解析が完了しました', 'success');
      } else {
        showToast(`解析に失敗しました: ${result.error.message}`, 'error');
      }
    },
    clearAnalysisResult: () => set({ lastAnalysisResult: null }),

    applyAnalysisResults: (selections, importedText) => {
        const { activeProjectId, setActiveProjectData, showToast, lastAnalysisResult } = get();
        if (!activeProjectId || !lastAnalysisResult) return;

        setActiveProjectData(d => {
            let updatedSettings = [...d.settings];
            let updatedKnowledge = [...d.knowledgeBase];
            let updatedNovelContent = [...d.novelContent];

            const annotation = "【インポート解析による補完】\n";

            // 1. キャラクターの反映
            selections.characters.forEach(sel => {
                const detail = lastAnalysisResult.characters.extractedDetails.find(ed => ed.name === sel.name);
                
                if (sel.action === 'create') {
                    const newChar: SettingItem = {
                        id: uuidv4(),
                        type: 'character',
                        name: sel.name,
                        age: detail?.age ? String(detail.age) : undefined,
                        gender: detail?.gender || undefined,
                        personality: detail?.personality || "解析により抽出",
                        // 口調とセリフサンプルを統合
                        speechPattern: detail 
                            ? `${detail.speechStyle}\n\n【セリフサンプル】\n${detail.dialogueSamples.map(s => `「${s}」`).join('\n')}`
                            : undefined,
                        themeColor: detail?.suggestedColor || undefined,
                        longDescription: detail 
                            ? `${detail.summary}\n\n${detail.detailDescription}`
                            : `${annotation}役割: ${detail?.role || '不明'}`,
                        memo: detail ? detail.memo : "インポートテキスト由来",
                        isAutoFilled: true,
                        fields: []
                    };
                    updatedSettings.push(newChar);
                } else if (sel.action === 'link' && sel.targetId) {
                    updatedSettings = updatedSettings.map(s => {
                        if (s.id === sel.targetId) {
                            const currentLongDesc = s.longDescription || "";
                            const currentMemo = s.memo || "";
                            const currentSpeech = s.speechPattern || "";
                            
                            const newLongDesc = detail 
                                ? `${currentLongDesc}\n\n--- 解析による追記 ---\n${detail.summary}\n\n${detail.detailDescription}`
                                : currentLongDesc;
                            
                            const newMemo = detail
                                ? `${currentMemo}\n\n--- 解析による考察 ---\n${detail.memo}`
                                : `${currentMemo}\n\n${annotation}名称「${sel.name}」として登場。`;

                            const newSpeech = detail
                                ? `${currentSpeech}\n\n--- 解析による追加サンプル ---\n${detail.dialogueSamples.map(s => `「${s}」`).join('\n')}`
                                : currentSpeech;

                            return {
                                ...s,
                                longDescription: newLongDesc,
                                memo: newMemo,
                                speechPattern: newSpeech
                            };
                        }
                        return s;
                    });
                }
            });

            // 2. 世界観・用語の反映
            selections.worldTerms.forEach(sel => {
                const termDetail = lastAnalysisResult.worldTerms.new.find(t => t.name === sel.name);
                const description = termDetail?.description || (annotation + "インポートテキスト由来。ジャンル推定: " + lastAnalysisResult.worldContext.genre);

                if (sel.action === 'world') {
                    const newWorld: SettingItem = {
                        id: uuidv4(),
                        type: 'world',
                        name: sel.name,
                        longDescription: annotation + "インポートテキスト由来。",
                        memo: description,
                        isAutoFilled: true,
                        fields: []
                    };
                    updatedSettings.push(newWorld);
                } else if (sel.action === 'knowledge') {
                    const newKnowledge: KnowledgeItem = {
                        id: uuidv4(),
                        name: sel.name,
                        content: description,
                        isAutoFilled: true
                    };
                    updatedKnowledge.push(newKnowledge);
                }
            });

            // 3. 本文の追加
            const newChunk: NovelChunk = {
                id: uuidv4(),
                text: importedText.trim()
            };
            updatedNovelContent.push(newChunk);

            return {
                ...d,
                settings: updatedSettings,
                knowledgeBase: updatedKnowledge,
                novelContent: updatedNovelContent,
                lastModified: new Date().toISOString()
            };
        }, { type: 'settings', label: 'インポート解析結果を反映' });

        set({ lastAnalysisResult: null });
        showToast('解析結果を反映しました', 'success');
    }
});
