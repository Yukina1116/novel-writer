// FIX: Added React import to resolve 'Cannot find namespace React' error.
import React from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Project, AppState, AppActions, HistoryTree, HistoryNode } from '../types';
import { defaultAiSettings, defaultDisplaySettings, simpleModeAiSettings, simpleModeDisplaySettings } from '../constants';
import { deleteProject as deleteProjectFromDb, putProject } from '../db/projectRepository';
import { readFileAsText } from '../utils/readFileAsText';

const initialState = {
    allProjectsData: {} as { [key: string]: Project },
    activeProjectId: null as string | null,
};

const createInitialHistoryTree = (initialProject: Project): HistoryTree => {
    const rootId = uuidv4();
    const rootNode: HistoryNode = {
        id: rootId,
        parentId: null,
        childrenIds: [],
        timestamp: Date.now(),
        type: 'settings',
        label: 'プロジェクト作成',
        payload: { ...initialProject, historyTree: undefined }, // Avoid circular ref
    };
    return {
        nodes: { [rootId]: rootNode },
        currentNodeId: rootId,
        rootId: rootId,
    };
};


export interface ProjectSlice {
    allProjectsData: { [key: string]: Project };
    activeProjectId: string | null;
    setActiveProjectId: (id: string | null) => void;
    createProject: (projectName: string, mode: 'simple' | 'standard') => void;
    deleteProject: (projectId: string) => void;
    importProject: (event: React.ChangeEvent<HTMLInputElement>) => void;
    setSimpleMode: (isSimple: boolean) => void;
    exportHtml: (options: any) => void;
}

export const createProjectSlice = (set, get): ProjectSlice => ({
    ...initialState,
    setActiveProjectId: (id) => {
        const project = get().allProjectsData[id];
        if (project) {
            set({ 
                activeProjectId: id, 
                historyTree: project.historyTree || createInitialHistoryTree(project)
            });
        } else {
            set({ activeProjectId: id });
        }
    },
    createProject: (projectName, mode) => {
        const newId = uuidv4();
        const newProject: Project = { 
            id: newId, 
            name: projectName, 
            lastModified: new Date().toISOString(), 
            isSimpleMode: mode === 'simple',
            settings: [], 
            novelContent: [], 
            chatHistory: [{ role: 'assistant', text: '新しい物語を始めましょう！', mode: 'consult' }], 
            knowledgeBase: [], 
            plotBoard: [],
            plotTypeColors: { '章のまとめ': '#22d3ee', '物語の構成': '#2dd4bf' },
            plotRelations: [],
            plotNodePositions: [],
            timeline: [], 
            timelineLanes: [],
            aiSettings: mode === 'simple' ? simpleModeAiSettings : defaultAiSettings, 
            displaySettings: mode === 'simple' ? simpleModeDisplaySettings : defaultDisplaySettings,
            characterRelations: [],
            nodePositions: [],
        };
        const historyTree = createInitialHistoryTree(newProject);
        newProject.historyTree = historyTree;
        
        set(state => ({
            allProjectsData: { ...state.allProjectsData, [newId]: newProject },
            activeProjectId: newId,
            historyTree: historyTree,
        }));
        putProject(newProject).catch(err => {
            console.error('Failed to save new project:', err);
            (get() as any).showToast?.(`プロジェクトの保存に失敗しました: ${err.message}`, 'error');
        });
    },
    deleteProject: (projectId) => {
        set(state => {
            const newAllProjectsData = { ...state.allProjectsData };
            delete newAllProjectsData[projectId];
            return {
                allProjectsData: newAllProjectsData,
                activeProjectId: state.activeProjectId === projectId ? null : state.activeProjectId
            };
        });
        deleteProjectFromDb(projectId).catch(err => {
            console.error('Failed to delete project:', err);
            (get() as any).showToast?.(`プロジェクトの削除に失敗しました: ${err.message}`, 'error');
        });
    },
    // Import goes through backupSlice (prepareImport + ImportConflictModal) to
    // handle multi-project bundles and conflict resolution. ProjectSelectionScreen
    // still uses this single-project entry point for the legacy ".json" file
    // input, deferring to the same pipeline.
    importProject: async (event) => {
        const file = event.target.files?.[0];
        if (event.target) event.target.value = '';
        if (!file) return;
        type ImportSurface = {
            prepareImport: (raw: string) => Promise<unknown>;
            openModal?: (type: string) => void;
            showToast?: (m: string, t?: 'info' | 'success' | 'error') => void;
        };
        const store = get() as ImportSurface;
        try {
            const raw = await readFileAsText(file);
            await store.prepareImport(raw);
            store.openModal?.('importConflict');
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            store.showToast?.(`ファイルの読み込みに失敗しました: ${msg}`, 'error');
            console.error(err);
        }
    },
    setSimpleMode: (isSimple) => {
        const project = get().allProjectsData[get().activeProjectId];
        if (!project) return;

        let newAiSettings = project.aiSettings;
        let newDisplaySettings = project.displaySettings;

        if (isSimple) {
            // 初期設定から変更されていない場合のみシンプルモード用設定を適用
            if (JSON.stringify(project.aiSettings) === JSON.stringify(defaultAiSettings)) {
                newAiSettings = simpleModeAiSettings;
            }
            if (JSON.stringify(project.displaySettings) === JSON.stringify(defaultDisplaySettings)) {
                newDisplaySettings = simpleModeDisplaySettings;
            }
        }

        get().setActiveProjectData(d => ({ 
            ...d, 
            isSimpleMode: isSimple,
            aiSettings: newAiSettings,
            displaySettings: newDisplaySettings
        }), {
            type: 'settings',
            label: isSimple ? 'シンプルモードに切り替え' : '標準モードに切り替え',
        });
        
        if (isSimple) {
            set({ leftPanelTab: 'settings' });
        }
    },
    exportHtml: (options) => {
        get().exportHtml(options);
    },
});