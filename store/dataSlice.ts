
import { v4 as uuidv4 } from 'uuid';
import { Project, SettingItem, KnowledgeItem, PlotItem, Relation, NodePosition, TimelineEvent, PlotRelation, PlotNodePosition, TimelineLane, DisplaySettings, NovelChunk, HistoryType, AnalysisResult } from '../types';
import {
    UNCATEGORIZED_CHAPTER_ID,
    assignChapterIdForAppend,
    buildExportChapterEntries,
    exportChapterAnchorId,
    isChapterTitleChunk,
    extractChapterTitle,
    getChapterChunksByGroupId,
    getChapterGroups,
    getChapterIdForNewChunk,
    normalizeChapterIds,
    warnOnceInDev,
} from '../utils';
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
    // PR-A1: カード/イベント単体の自動保存 action。history ノードは積まない (markDirty のみ)。
    upsertPlotItem: (item: PlotItem) => void;
    deletePlotItem: (id: string) => void;
    upsertTimelineEvent: (event: TimelineEvent) => void;
    deleteTimelineEvent: (id: string) => void;
    // Phase 2: レーンの単体追加・更新 (PR-A2 の upsertTimelineEvent と対称)。
    // フッター保存を待たず即時 store 反映 + markDirty で IndexedDB debounce 発火させる。
    upsertTimelineLane: (lane: TimelineLane) => void;
    // Phase 2: レーン削除 + 配下 event cascade + plot.linkedEventId orphan 解除を
    // 1 つの setActiveProjectData updater に集約する (Codex 指摘: 別 transaction 連打だと
    // debounced save / 別操作が挟まった時に壊れた中間状態が保存される)。
    deleteTimelineLane: (id: string) => void;
    // Phase 2: drag-drop 用の単一 event 移動 action。
    // store の現在値を起点に再計算するため、local snapshot 上書きリスクを構造的に排除する。
    // 責務縮小契約 (Codex 指摘): title sync しない / plot link cleanup しない / history 積まない。
    moveTimelineEvent: (eventId: string, targetLaneId: string, insertBeforeEventId: string | null) => void;
    // timelineLanes が空の時のみデフォルトレーンを store に実体作成する (idempotent)。
    // useEffect 側で uuid を動的生成すると props 変化で再発火するたびに新 ID になり
    // event.laneId が孤児化するため、ID 発行を store 側に集約している。
    ensureDefaultLane: () => void;
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
    }) => void;
}

// PR-A1: タイトル同期判定を純粋関数化。副作用 (setActiveProjectData / showToast / openModal) は呼び出し側で実行する。
//   - 戻り値の counterpartPatch があれば対向側 entity の title を patch する
//   - syncDialog があれば SyncDialog (summary/description 同期確認) を開く
//   - 両者は排他 (title 一致時に summary 差分があれば dialog、title 差分があれば title patch を優先)
//   - title 差分がなく summary も同じなら null/null を返す (誤発火しない)
export interface TitleSyncResult<TPatchId extends 'eventId' | 'plotId'> {
    counterpartPatch: ({ [K in TPatchId]: string } & { newTitle: string; newLastModified: number }) | null;
    syncDialog: { plotId: string; eventId: string } | null;
}

export const computePlotTitleSync = (
    oldPlot: PlotItem | undefined,
    newPlot: PlotItem,
    timelineById: Map<string, TimelineEvent>,
): TitleSyncResult<'eventId'> => {
    if (!oldPlot || !newPlot.linkedEventId) return { counterpartPatch: null, syncDialog: null };
    const newPlotLastModified = newPlot.lastModified || 0;
    if (newPlotLastModified <= (oldPlot.lastModified || 0)) return { counterpartPatch: null, syncDialog: null };
    const linkedEvent = timelineById.get(newPlot.linkedEventId);
    if (!linkedEvent) return { counterpartPatch: null, syncDialog: null };
    if ((linkedEvent.lastModified || 0) >= newPlotLastModified) return { counterpartPatch: null, syncDialog: null };

    if (linkedEvent.title !== newPlot.title) {
        return {
            counterpartPatch: { eventId: linkedEvent.id, newTitle: newPlot.title, newLastModified: newPlotLastModified },
            syncDialog: null,
        };
    }
    if (linkedEvent.description !== newPlot.summary) {
        return { counterpartPatch: null, syncDialog: { plotId: newPlot.id, eventId: newPlot.linkedEventId } };
    }
    return { counterpartPatch: null, syncDialog: null };
};

export const computeEventTitleSync = (
    oldEvent: TimelineEvent | undefined,
    newEvent: TimelineEvent,
    plotById: Map<string, PlotItem>,
): TitleSyncResult<'plotId'> => {
    if (!oldEvent || !newEvent.linkedPlotId) return { counterpartPatch: null, syncDialog: null };
    const newEventLastModified = newEvent.lastModified || 0;
    if (newEventLastModified <= (oldEvent.lastModified || 0)) return { counterpartPatch: null, syncDialog: null };
    const linkedPlot = plotById.get(newEvent.linkedPlotId);
    if (!linkedPlot) return { counterpartPatch: null, syncDialog: null };
    if ((linkedPlot.lastModified || 0) >= newEventLastModified) return { counterpartPatch: null, syncDialog: null };

    if (linkedPlot.title !== newEvent.title) {
        return {
            counterpartPatch: { plotId: linkedPlot.id, newTitle: newEvent.title, newLastModified: newEventLastModified },
            syncDialog: null,
        };
    }
    if (linkedPlot.summary !== newEvent.description) {
        return { counterpartPatch: null, syncDialog: { plotId: newEvent.linkedPlotId, eventId: newEvent.id } };
    }
    return { counterpartPatch: null, syncDialog: null };
};

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
        const { openModal, allProjectsData, activeProjectId, setActiveProjectData, showToast } = get();
        const oldProject = allProjectsData[activeProjectId];
        // タイトルのみ自動同期 (プロット → タイムライン方向)。summary/description は SyncDialog 経路維持。
        // PR-A1: 判定ロジックは computePlotTitleSync 純粋関数に集約済。
        const titleSyncTargets: Array<{ eventId: string; newTitle: string; newLastModified: number }> = [];
        let firstSyncDialog: { plotId: string; eventId: string } | null = null;
        if (oldProject) {
            const oldPlotsMap = new Map<string, PlotItem>(oldProject.plotBoard.map(p => [p.id, p]));
            const timelineMap = new Map<string, TimelineEvent>(oldProject.timeline.map(e => [e.id, e]));

            for (const newPlot of data.items) {
                const result = computePlotTitleSync(oldPlotsMap.get(newPlot.id), newPlot, timelineMap);
                if (result.counterpartPatch) titleSyncTargets.push(result.counterpartPatch);
                else if (result.syncDialog && !firstSyncDialog) firstSyncDialog = result.syncDialog;
            }
        }

        const currentProject = allProjectsData[activeProjectId];
        const newPlotIds = new Set(data.items.map(p => p.id));
        const titleSyncMap = new Map(titleSyncTargets.map(t => [t.eventId, t]));
        const updatedTimeline = currentProject ? currentProject.timeline.map(event => {
            const sync = titleSyncMap.get(event.id);
            const linkCleared = event.linkedPlotId && !newPlotIds.has(event.linkedPlotId)
                ? { ...event, linkedPlotId: undefined }
                : event;
            return sync
                ? { ...linkCleared, title: sync.newTitle, lastModified: sync.newLastModified }
                : linkCleared;
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

        if (firstSyncDialog) openModal('syncDialog', firstSyncDialog);
        if (titleSyncTargets.length > 0) {
            showToast(`タイムラインの${titleSyncTargets.length}件のリンクイベントのタイトルを同期しました`, 'success');
        }
    },
    // PR-A1: カード単体保存。フッター保存を待たずに 2 秒 debounce で IndexedDB に反映される。
    // history ノードは積まない (自動保存は履歴の意味的単位ではない、PR-A2 で UI 切替時にユーザー操作粒度を再設計)。
    upsertPlotItem: (newItem: PlotItem) => {
        const { activeProjectId, allProjectsData, setActiveProjectData, openModal, showToast } = get();
        if (!activeProjectId) return;
        const project = allProjectsData[activeProjectId];
        if (!project) return;

        const oldItem = project.plotBoard.find(p => p.id === newItem.id);
        // title 変更検知時のみ lastModified を更新 (Codex 指摘 M: 無変更保存で同期優先権を奪わない)。
        const titleChanged = !oldItem || oldItem.title !== newItem.title;
        const itemWithTimestamp: PlotItem = titleChanged
            ? { ...newItem, lastModified: Date.now() }
            : { ...newItem, lastModified: oldItem?.lastModified ?? newItem.lastModified };

        const timelineById = new Map<string, TimelineEvent>(project.timeline.map(e => [e.id, e]));
        const syncResult = computePlotTitleSync(oldItem, itemWithTimestamp, timelineById);

        setActiveProjectData(d => {
            const exists = d.plotBoard.some(p => p.id === itemWithTimestamp.id);
            const newPlotBoard = exists
                ? d.plotBoard.map(p => p.id === itemWithTimestamp.id ? itemWithTimestamp : p)
                : [...d.plotBoard, itemWithTimestamp];
            // 新規追加時のデフォルト position (既存 PlotBoardModal.handleSaveCard と同等の動作)
            const newPositions = exists
                ? d.plotNodePositions
                : [...(d.plotNodePositions || []), { plotId: itemWithTimestamp.id, x: 120, y: 120 }];
            const newTimeline = syncResult.counterpartPatch
                ? d.timeline.map(e => e.id === syncResult.counterpartPatch!.eventId
                    ? { ...e, title: syncResult.counterpartPatch!.newTitle, lastModified: syncResult.counterpartPatch!.newLastModified }
                    : e)
                : d.timeline;
            return {
                ...d,
                plotBoard: newPlotBoard,
                plotNodePositions: newPositions,
                timeline: newTimeline,
                lastModified: new Date().toISOString(),
            };
        });

        if (syncResult.counterpartPatch) {
            showToast('リンクされたタイムラインイベントのタイトルを同期しました', 'success');
        } else if (syncResult.syncDialog) {
            openModal('syncDialog', syncResult.syncDialog);
        }
    },
    deletePlotItem: (id: string) => {
        const { setActiveProjectData } = get();
        setActiveProjectData(d => ({
            ...d,
            plotBoard: d.plotBoard.filter(p => p.id !== id),
            plotRelations: (d.plotRelations || []).filter(r => r.source !== id && r.target !== id),
            plotNodePositions: (d.plotNodePositions || []).filter(p => p.plotId !== id),
            timeline: (d.timeline || []).map(event =>
                event.linkedPlotId === id ? { ...event, linkedPlotId: undefined } : event
            ),
            lastModified: new Date().toISOString(),
        }));
    },
    upsertTimelineEvent: (newEvent: TimelineEvent) => {
        const { activeProjectId, allProjectsData, setActiveProjectData, openModal, showToast } = get();
        if (!activeProjectId) return;
        const project = allProjectsData[activeProjectId];
        if (!project) return;

        const oldEvent = project.timeline.find(e => e.id === newEvent.id);
        const titleChanged = !oldEvent || oldEvent.title !== newEvent.title;
        const eventWithTimestamp: TimelineEvent = titleChanged
            ? { ...newEvent, lastModified: Date.now() }
            : { ...newEvent, lastModified: oldEvent?.lastModified ?? newEvent.lastModified };

        const plotById = new Map<string, PlotItem>(project.plotBoard.map(p => [p.id, p]));
        const syncResult = computeEventTitleSync(oldEvent, eventWithTimestamp, plotById);

        setActiveProjectData(d => {
            const exists = d.timeline.some(e => e.id === eventWithTimestamp.id);
            const newTimeline = exists
                ? d.timeline.map(e => e.id === eventWithTimestamp.id ? eventWithTimestamp : e)
                : [...d.timeline, eventWithTimestamp];
            const newPlotBoard = syncResult.counterpartPatch
                ? d.plotBoard.map(p => p.id === syncResult.counterpartPatch!.plotId
                    ? { ...p, title: syncResult.counterpartPatch!.newTitle, lastModified: syncResult.counterpartPatch!.newLastModified }
                    : p)
                : d.plotBoard;
            return {
                ...d,
                timeline: newTimeline,
                plotBoard: newPlotBoard,
                lastModified: new Date().toISOString(),
            };
        });

        if (syncResult.counterpartPatch) {
            showToast('リンクされたプロットカードのタイトルを同期しました', 'success');
        } else if (syncResult.syncDialog) {
            openModal('syncDialog', syncResult.syncDialog);
        }
    },
    deleteTimelineEvent: (id: string) => {
        const { setActiveProjectData } = get();
        setActiveProjectData(d => ({
            ...d,
            timeline: (d.timeline || []).filter(e => e.id !== id),
            plotBoard: (d.plotBoard || []).map(p =>
                p.linkedEventId === id ? { ...p, linkedEventId: undefined } : p
            ),
            lastModified: new Date().toISOString(),
        }));
    },
    upsertTimelineLane: (lane: TimelineLane) => {
        const { activeProjectId, allProjectsData, setActiveProjectData } = get();
        if (!activeProjectId) return;
        const project = allProjectsData[activeProjectId];
        if (!project) return;

        setActiveProjectData(d => {
            const lanes = d.timelineLanes || [];
            const exists = lanes.some(l => l.id === lane.id);
            const newLanes = exists
                ? lanes.map(l => l.id === lane.id ? lane : l)
                : [...lanes, lane];
            return {
                ...d,
                timelineLanes: newLanes,
                lastModified: new Date().toISOString(),
            };
        });
    },
    deleteTimelineLane: (id: string) => {
        const { activeProjectId, allProjectsData, setActiveProjectData } = get();
        if (!activeProjectId) return;
        const project = allProjectsData[activeProjectId];
        if (!project) return;
        // 該当 lane が存在しない場合は markDirty を発火させない (no-op)
        if (!(project.timelineLanes || []).some(l => l.id === id)) return;

        // Codex must-fix: lane 削除 → 配下 event filter → plot.linkedEventId orphan 解除を
        // 同一 updater 内で atomic に行う。removedEventIds は updater 引数 d から再計算して
        // setActiveProjectData の前提と一致させる (TOCTOU 回避)。
        setActiveProjectData(d => {
            const removedEventIds = new Set(
                (d.timeline || []).filter(e => e.laneId === id).map(e => e.id)
            );
            const nowMs = Date.now();
            return {
                ...d,
                timelineLanes: (d.timelineLanes || []).filter(l => l.id !== id),
                timeline: (d.timeline || []).filter(e => e.laneId !== id),
                plotBoard: (d.plotBoard || []).map(p =>
                    p.linkedEventId !== undefined && removedEventIds.has(p.linkedEventId)
                        ? { ...p, linkedEventId: undefined, lastModified: nowMs }
                        : p
                ),
                lastModified: new Date().toISOString(),
            };
        });
    },
    moveTimelineEvent: (eventId: string, targetLaneId: string, insertBeforeEventId: string | null) => {
        const { activeProjectId, allProjectsData, setActiveProjectData } = get();
        if (!activeProjectId) return;
        const project = allProjectsData[activeProjectId];
        if (!project) return;
        // 該当 event が存在しない場合は markDirty を発火させない (no-op)
        if (!(project.timeline || []).some(e => e.id === eventId)) return;

        setActiveProjectData(d => {
            const timeline = d.timeline || [];
            const target = timeline.find(e => e.id === eventId);
            if (!target) return d;
            const movedEvent: TimelineEvent = target.laneId === targetLaneId
                ? target
                : { ...target, laneId: targetLaneId };
            const without = timeline.filter(e => e.id !== eventId);
            // insertBeforeEventId が指定されてかつ存在すれば直前挿入、それ以外は末尾挿入。
            const insertIndex = insertBeforeEventId
                ? without.findIndex(e => e.id === insertBeforeEventId)
                : -1;
            const newTimeline = insertIndex >= 0
                ? [...without.slice(0, insertIndex), movedEvent, ...without.slice(insertIndex)]
                : [...without, movedEvent];
            return {
                ...d,
                timeline: newTimeline,
                lastModified: new Date().toISOString(),
            };
        });
    },
    ensureDefaultLane: () => {
        const { allProjectsData, activeProjectId, setActiveProjectData } = get();
        if (!activeProjectId) {
            warnOnceInDev(
                'ensure-default-lane-no-active-project',
                'ensureDefaultLane: activeProjectId is null while TimelineModal opened (UI/store desync)',
                {},
                'dataSlice',
            );
            return;
        }
        const project = allProjectsData[activeProjectId];
        if (!project) {
            warnOnceInDev(
                'ensure-default-lane-project-missing',
                'ensureDefaultLane: activeProjectId set but project entry missing in allProjectsData (TOCTOU)',
                { activeProjectId },
                'dataSlice',
            );
            return;
        }
        if (project.timelineLanes && project.timelineLanes.length > 0) return;
        // lanes が空でも既存 event があれば、その laneId を新 default lane の id として採用する
        // (event 側は不変)。これにより過去に動的 uuid または 'default' フォールバックで作られて
        // 孤児化した event を救済する。複数 event が distinct laneId を持つ場合は最初の event の
        // laneId のみ採用し、残りは孤児のまま (呼び出し側で別途解決)。
        // 空文字 laneId は型上許容されるため truthy guard で除外し、その場合は uuidv4 を生成。
        const orphanCandidate = project.timeline && project.timeline.length > 0
            ? project.timeline[0]?.laneId
            : undefined;
        const defaultLaneId = (orphanCandidate && orphanCandidate.length > 0) ? orphanCandidate : uuidv4();
        const defaultLane: TimelineLane = { id: defaultLaneId, name: 'メインストーリー', color: '#6b7280' };
        setActiveProjectData(d => ({
            ...d,
            timelineLanes: [defaultLane],
            lastModified: new Date().toISOString(),
        }));
    },
    handleDisplaySettingChange: (key, value) => {
        get().setActiveProjectData(d => ({ ...d, displaySettings: { ...d.displaySettings, [key]: value } }), { type: 'settings', label: '表示設定を更新' });
    },
    handleSaveChart: (relations, positions) => {
        get().setActiveProjectData(d => ({ ...d, characterRelations: relations, nodePositions: positions, lastModified: new Date().toISOString() }), { type: 'chart', label: '相関図を更新' });
    },
    handleSaveTimeline: (timeline: TimelineEvent[], lanes: TimelineLane[]) => {
        const { openModal, allProjectsData, activeProjectId, setActiveProjectData, showToast } = get();
        const oldProject = allProjectsData[activeProjectId];
        // タイトルのみ自動同期 (タイムライン → プロット方向)。summary/description は SyncDialog 経路維持。
        // PR-A1: 判定ロジックは computeEventTitleSync 純粋関数に集約済。
        const titleSyncTargets: Array<{ plotId: string; newTitle: string; newLastModified: number }> = [];
        let firstSyncDialog: { plotId: string; eventId: string } | null = null;
        if (oldProject) {
            const oldEventsMap = new Map<string, TimelineEvent>(oldProject.timeline.map(e => [e.id, e]));
            const plotBoardMap = new Map<string, PlotItem>(oldProject.plotBoard.map(p => [p.id, p]));

            for (const newEvent of timeline) {
                const result = computeEventTitleSync(oldEventsMap.get(newEvent.id), newEvent, plotBoardMap);
                if (result.counterpartPatch) titleSyncTargets.push(result.counterpartPatch);
                else if (result.syncDialog && !firstSyncDialog) firstSyncDialog = result.syncDialog;
            }
        }

        const currentProject = allProjectsData[activeProjectId];
        const newEventIds = new Set(timeline.map(e => e.id));
        const titleSyncMap = new Map(titleSyncTargets.map(t => [t.plotId, t]));
        const updatedPlotBoard = currentProject ? currentProject.plotBoard.map(plot => {
            const sync = titleSyncMap.get(plot.id);
            const linkCleared = plot.linkedEventId && !newEventIds.has(plot.linkedEventId)
                ? { ...plot, linkedEventId: undefined }
                : plot;
            return sync
                ? { ...linkCleared, title: sync.newTitle, lastModified: sync.newLastModified }
                : linkCleared;
        }) : [];

        setActiveProjectData(d => ({
            ...d,
            timeline: timeline,
            timelineLanes: lanes,
            plotBoard: updatedPlotBoard,
            lastModified: new Date().toISOString()
        }), { type: 'timeline', label: 'タイムラインを更新' });

        if (firstSyncDialog) openModal('syncDialog', firstSyncDialog);
        if (titleSyncTargets.length > 0) {
            showToast(`プロットボードの${titleSyncTargets.length}件のリンクカードのタイトルを同期しました`, 'success');
        }
    },
    handleSaveChapterSettings: ({ id, newTitle, newMemo, isUncategorized }) => {
        get().setActiveProjectData(d => {
            if (isUncategorized) {
                // uncategorized → 名前付き章への昇格: 新 title chunk を生成し、
                // それまで chapterId === null だった全 chunks に新 title chunk の id を付与する。
                const firstUncatIndex = d.novelContent.findIndex(c => c.chapterId == null);
                if (firstUncatIndex === -1) {
                    // uncategorized chunks が 1 件もない状態で昇格依頼 = UI と store の不整合。
                    // 入力された title/memo が黙って消えるため paired signal を出す。
                    warnOnceInDev(
                        'save-chapter-no-uncategorized',
                        'handleSaveChapterSettings: 昇格対象の uncategorized chunks が見つからない',
                        { newTitle },
                        'dataSlice',
                    );
                    return d;
                }
                const newTitleChunkId = uuidv4();
                const newTitleChunk: NovelChunk = {
                    id: newTitleChunkId,
                    text: `# ${newTitle}`,
                    memo: newMemo,
                    chapterId: newTitleChunkId,
                };
                const reassigned = d.novelContent.map(c =>
                    c.chapterId == null ? { ...c, chapterId: newTitleChunkId } : c
                );
                const inserted = [
                    ...reassigned.slice(0, firstUncatIndex),
                    newTitleChunk,
                    ...reassigned.slice(firstUncatIndex),
                ];
                // 非連続 uncategorized 入力 (drag 後の散在等) でも group 連続性 invariant を
                // 回復するため最後に normalize を通す。冪等のため副作用なし。
                return { ...d, novelContent: normalizeChapterIds(inserted) };
            }
            // 既存名前付き章のリネーム: title chunk の text と memo のみ更新、chapterId は不変
            return {
                ...d,
                novelContent: d.novelContent.map(c =>
                    c.id === id ? { ...c, text: `# ${newTitle}`, memo: newMemo } : c
                ),
            };
        }, { type: 'outline', label: `章「${newTitle}」の設定を更新` });
    },
    handleDeleteChapter: (groupId) => {
        // groupId: UNCATEGORIZED_CHAPTER_ID または title chunk の id。
        // UI 上は「章を削除」ボタンが名前付き章にのみ表示される (OutlinePanel) ため uncategorized
        // 削除はトリガされないが、handler 単体では同じインタフェースで動作する。
        const { activeProjectId, allProjectsData } = get();
        const activeProject = allProjectsData[activeProjectId];
        if (!activeProject) return;
        const targetChunks = getChapterChunksByGroupId(activeProject.novelContent, groupId);
        if (targetChunks.length === 0) {
            warnOnceInDev(
                'delete-chapter-empty-target',
                'handleDeleteChapter: 削除対象 group が見つからない (UI と store の不整合の可能性)',
                { groupId },
                'dataSlice',
            );
            return;
        }
        const targetIds = new Set(targetChunks.map(c => c.id));

        const titleChunk = targetChunks.find(isChapterTitleChunk);
        const chapterTitle = titleChunk ? extractChapterTitle(titleChunk) : '章に属さない文章';

        get().setActiveProjectData(d => ({
            ...d,
            novelContent: d.novelContent.filter(c => !targetIds.has(c.id)),
            lastModified: new Date().toISOString(),
        }), { type: 'outline', label: `章「${chapterTitle}」を削除` });
    },
    handleNovelTextChange: (chunkId, newText) => {
        // R1 (sync): chunk text の `# ` 有無が変わったら chapterId を再構築する。
        //   - body → title (`# ` 追加): その chunk の chapterId を self.id に矯正。
        //     さらに編集 chunk 以降、次の title chunk 直前までの body chunks を新章配下に再 tag。
        //     (normalize 単独だと旧 chapterId 参照が valid なので新章に取り込まれず group 連続性が崩れる)
        //   - title → body (`# ` 削除): normalize の dangling 修復で前 chunk から継承し直される
        // 変化なし (body → body / title → title) のときは normalize を skip し perf を確保する。
        get().setActiveProjectData(d => {
            const editedIndex = d.novelContent.findIndex(c => c.id === chunkId);
            if (editedIndex === -1) {
                warnOnceInDev(
                    'text-change-missing-chunk',
                    '編集対象 chunk が novelContent に存在しません (text 喪失リスク)',
                    { chunkId, newTextLen: newText.length },
                    'dataSlice',
                );
                return d;
            }
            const oldChunk = d.novelContent[editedIndex];
            const wasTitle = isChapterTitleChunk(oldChunk);
            const willBeTitle = newText.startsWith('# ');
            const titleStatusChanged = wasTitle !== willBeTitle;

            let updated: NovelChunk[] = d.novelContent.map(chunk =>
                chunk.id === chunkId ? { ...chunk, text: newText } : chunk
            );

            if (titleStatusChanged && willBeTitle) {
                // body → title 昇格: 編集 chunk 以降、次の title chunk 直前までの body chunks のうち、
                // 旧 chapterId と一致するものを新章 (chunkId) 配下に再 tag。
                // 次の title chunk 以降は触らない (章境界が確立しているため)。
                const oldChapterId = oldChunk.chapterId ?? null;
                let crossedNextTitle = false;
                updated = updated.map((chunk, idx) => {
                    if (idx <= editedIndex) return chunk;
                    if (crossedNextTitle) return chunk;
                    if (isChapterTitleChunk(chunk)) {
                        crossedNextTitle = true;
                        return chunk;
                    }
                    if ((chunk.chapterId ?? null) !== oldChapterId) return chunk;
                    return { ...chunk, chapterId: chunkId };
                });
            }

            return {
                ...d,
                novelContent: titleStatusChanged ? normalizeChapterIds(updated) : updated,
                lastModified: new Date().toISOString(),
            };
        }, { type: 'editor', label: '本文を編集' });
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
        const rawNewChunks: NovelChunk[] = newChunkText
            .split(/\n\s*\n/)
            .map(text => ({ id: uuidv4(), text: text.trim() }))
            .filter(chunk => chunk.text);
        if (rawNewChunks.length > 0) {
            get().setActiveProjectData(d => {
                // 順次 append: 各 chunk について title か body かを判定し chapterId を決定する。
                // title chunk なら self.id、body なら直前 chunk (累積後) の chapterId を継承。
                // 直接入力で `# 第2章\n\n本文` のように title + body を一度に追加するケースで
                // title chunk の self.id invariant と後続 body の新章配下追加を両立する。
                const accumulated: NovelChunk[] = [...d.novelContent];
                for (const raw of rawNewChunks) {
                    const chapterId = assignChapterIdForAppend(accumulated, raw);
                    accumulated.push({ ...raw, chapterId });
                }
                return { ...d, novelContent: accumulated };
            }, { type: 'editor', label: '新しい段落を追加' });
        }
        set({ newChunkText: '' });
    },
    addChapter: () => {
        const newChapterId = uuidv4();
        const newChapterChunk: NovelChunk = {
            id: newChapterId,
            text: '# 無題の章',
            memo: '',
            chapterId: newChapterId, // title chunk は self.id を chapterId として持つ
        };
        get().setActiveProjectData(d => ({ ...d, novelContent: [...d.novelContent, newChapterChunk] }), { type: 'outline', label: '新しい章を追加' });
        get().openModal('chapterSettings', { id: newChapterChunk.id, title: '無題の章', memo: '', isUncategorized: false });
    },
    handleChapterDrop: (dropOnGroupId) => {
        // OutlinePanel 経由で渡されるのは groupId (= UNCATEGORIZED_CHAPTER_ID か title chunk id)。
        // 章 group の chunks を chapterId で抽出し、配列上の dropOn group 先頭位置にまるごと差し込む。
        // chunks の chapterId は維持されるため、uncategorized chunks が名前付き章配下に絡め取られる
        // 旧バグ (位置依存ルール起因) は構造的に起こらない。
        const { draggedChapterId } = get();
        if (!draggedChapterId || draggedChapterId === dropOnGroupId) return; // 正常系: self drop / cancel

        get().setActiveProjectData(d => {
            const novelContent = [...d.novelContent];
            const draggedChunks = getChapterChunksByGroupId(novelContent, draggedChapterId);
            const dropOnChunks = getChapterChunksByGroupId(novelContent, dropOnGroupId);
            if (draggedChunks.length === 0 || dropOnChunks.length === 0) {
                // UI 上にある章が store 側で 0 件解決される = invariant 違反 (paired signal)
                warnOnceInDev(
                    'drop-empty-group',
                    'handleChapterDrop: dragged/drop group が 0 件 (UI と store の不整合)',
                    { draggedChapterId, dropOnGroupId, draggedLen: draggedChunks.length, dropLen: dropOnChunks.length },
                    'dataSlice',
                );
                return d;
            }
            const draggedChunkIds = new Set(draggedChunks.map(c => c.id));
            const contentWithoutDragged = novelContent.filter(c => !draggedChunkIds.has(c.id));
            const dropIndex = contentWithoutDragged.findIndex(c => c.id === dropOnChunks[0].id);
            if (dropIndex === -1) {
                warnOnceInDev(
                    'drop-index-missing',
                    'handleChapterDrop: dropOnChunks の先頭 chunk が contentWithoutDragged に見つからない',
                    { draggedChapterId, dropOnGroupId },
                    'dataSlice',
                );
                return d;
            }
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
        // 章一覧は utils.buildExportChapterEntries で生成し、本文 anchor は同じ
        // utils.exportChapterAnchorId で生成する。TOC と本文 anchor の id 形式不一致を
        // 構造的に防ぐため必ず両者を utils 経由にする (AC-11)。
        const chapters = buildExportChapterEntries(novelContent);
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
                        const anchorId = isChapterTitleChunk(chunk) ? exportChapterAnchorId(chunk) : '';
                        return `<div id="${anchorId}">${renderMarkdown(chunk.text, settings.filter(s => s.type === 'character'), knowledgeBase, aiSettings)}</div>`;
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

    applyAnalysisResults: (selections) => {
        const { activeProjectId, setActiveProjectData, showToast, lastAnalysisResult } = get();
        if (!activeProjectId || !lastAnalysisResult) return;

        setActiveProjectData(d => {
            let updatedSettings = [...d.settings];
            let updatedKnowledge = [...d.knowledgeBase];

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

            // NOTE: 投入元テキスト (importedText) は本文 (novelContent) に push しない。
            // テキスト解析で投入したテキストはあくまで解析の素材であり、本文に意図せず残ることを
            // 防ぐためサイレント追加を廃止した (Issue #105)。解析結果 (AnalysisResult) は
            // analysisHistory (IndexedDB) に保存される。投入元テキスト本体は現状どこにも残らない
            // (Issue #106 で UI からの参照経路を別途追加予定)。

            return {
                ...d,
                settings: updatedSettings,
                knowledgeBase: updatedKnowledge,
                lastModified: new Date().toISOString()
            };
        }, { type: 'settings', label: 'インポート解析結果を反映' });

        set({ lastAnalysisResult: null });
        showToast('解析結果を反映しました', 'success');
    }
});
