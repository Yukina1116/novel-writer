import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { AppState, AppActions } from '../types';
import { createProjectSlice, ProjectSlice } from './projectSlice';
import { createUiSlice, UiSlice } from './uiSlice';
import { createDataSlice, DataSlice } from './dataSlice';
import { createAiSlice, AiSlice } from './aiSlice';
import { createHistorySlice, HistorySlice } from './historySlice';
import { createTutorialSlice, TutorialSlice } from './tutorialSlice';
import { createAnalysisHistorySlice, AnalysisHistorySlice } from './analysisHistorySlice';
import { createFormSlice, FormSlice } from './formSlice';

// 容量制限エラーに対応するためのカスタムストレージラッパー
const customStorage = {
    getItem: (name: string) => localStorage.getItem(name),
    setItem: (name: string, value: string) => {
        try {
            localStorage.setItem(name, value);
        } catch (e) {
            if (e instanceof DOMException && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED')) {
                console.error('LocalStorage quota exceeded. Reducing history and retrying...');
                // ここで緊急のデータ削減ロジックを走らせることも可能
                // ユーザーに警告を表示
                alert('ブラウザの保存容量がいっぱいです。古いプロジェクトを削除するか、エクスポートして整理してください。');
            } else {
                throw e;
            }
        }
    },
    removeItem: (name: string) => localStorage.removeItem(name),
};

export const useStore = create<AppState & AppActions & ProjectSlice & UiSlice & DataSlice & AiSlice & HistorySlice & TutorialSlice & AnalysisHistorySlice & FormSlice>()(
    persist(
        (set, get, api) => ({
            ...createProjectSlice(set, get),
            ...createUiSlice(set, get),
            ...createDataSlice(set, get),
            ...createAiSlice(set, get),
            ...createHistorySlice(set, get),
            ...createTutorialSlice(set, get),
            ...createAnalysisHistorySlice(set, get),
            ...createFormSlice(set, get),
            loadInitialState: () => {},
        }),
        {
            name: 'NOVEL_WRITER_storage',
            storage: createJSONStorage(() => customStorage),
            partialize: (state) => {
                // 各プロジェクト内の冗長な履歴データを削除してから保存
                const projects = { ...state.allProjectsData };
                Object.keys(projects).forEach(id => {
                    if (projects[id]) {
                        // プロジェクトオブジェクト内の historyTree はグローバル側にあるため間引く
                        const { historyTree, ...rest } = projects[id] as any;
                        // 非アクティブなプロジェクトからは chatHistory と novelContent も間引く
                        if (id !== state.activeProjectId) {
                            const { chatHistory, novelContent, ...restWithoutChat } = rest;
                            projects[id] = restWithoutChat;
                        } else {
                            projects[id] = rest;
                        }
                    }
                });

                const dataToPersist = {
                    allProjectsData: projects,
                    activeProjectId: state.activeProjectId,
                    isLeftSidebarOpen: state.isLeftSidebarOpen,
                    isRightSidebarOpen: state.isRightSidebarOpen,
                    leftSidebarWidth: state.leftSidebarWidth,
                    rightSidebarWidth: state.rightSidebarWidth,
                    isNewChunkInputOpen: state.isNewChunkInputOpen,
                    userMode: state.userMode,
                    undoScope: state.undoScope,
                    historyTree: state.historyTree,
                    pinnedSettingIds: state.pinnedSettingIds,
                };
                return dataToPersist;
            },
            onRehydrateStorage: () => (state, error) => {
                if (error) {
                    console.error('An error occurred during hydration:', error);
                }
            },
        }
    )
);