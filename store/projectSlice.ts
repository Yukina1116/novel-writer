// FIX: Added React import to resolve 'Cannot find namespace React' error.
import React from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Project, AppState, AppActions, HistoryTree, HistoryNode } from '../types';
import { defaultAiSettings, defaultDisplaySettings, simpleModeAiSettings, simpleModeDisplaySettings } from '../constants';
import { validateAndSanitizeProjectData } from '../utils';
import { createProjectApi, deleteProjectApi } from '../projectApi';

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
        createProjectApi(newProject).catch(err => console.error('Failed to save new project:', err));
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
        deleteProjectApi(projectId).catch(err => console.error('Failed to delete project:', err));
    },
    importProject: (event) => {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const parsedJson = JSON.parse(e.target.result as string);
                const rawProjectData = (parsedJson.project && parsedJson.project.id) ? parsedJson.project : parsedJson;
                let projectToLoad = validateAndSanitizeProjectData(rawProjectData);

                const historyTree = projectToLoad.historyTree || createInitialHistoryTree(projectToLoad);
                projectToLoad = { ...projectToLoad, historyTree };

                set(state => {
                    return {
                        ...state,
                        allProjectsData: { ...state.allProjectsData, [projectToLoad.id]: projectToLoad },
                        activeProjectId: projectToLoad.id,
                        historyTree: historyTree,
                    };
                });
                createProjectApi(projectToLoad).catch(err => console.error('Failed to save imported project:', err));
            } catch (err) {
                alert(`ファイルの読み込みに失敗しました: ${err.message}`);
                console.error(err);
            }
        };
        reader.readAsText(file);
        event.target.value = null;
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