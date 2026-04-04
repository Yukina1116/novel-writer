import { create } from 'zustand';
import { AppState, AppActions } from '../types';
import { createProjectSlice, ProjectSlice } from './projectSlice';
import { createUiSlice, UiSlice } from './uiSlice';
import { createDataSlice, DataSlice } from './dataSlice';
import { createAiSlice, AiSlice } from './aiSlice';
import { createHistorySlice, HistorySlice } from './historySlice';
import { createTutorialSlice, TutorialSlice } from './tutorialSlice';
import { createAnalysisHistorySlice, AnalysisHistorySlice } from './analysisHistorySlice';
import { createFormSlice, FormSlice } from './formSlice';
import { createSyncSlice, SyncSlice } from './syncSlice';

export const useStore = create<AppState & AppActions & ProjectSlice & UiSlice & DataSlice & AiSlice & HistorySlice & TutorialSlice & AnalysisHistorySlice & FormSlice & SyncSlice>()(
    (set, get, api) => ({
        ...createProjectSlice(set, get),
        ...createUiSlice(set, get),
        ...createDataSlice(set, get),
        ...createAiSlice(set, get),
        ...createHistorySlice(set, get),
        ...createTutorialSlice(set, get),
        ...createAnalysisHistorySlice(set, get),
        ...createFormSlice(set, get),
        ...createSyncSlice(set, get),
        loadInitialState: () => {},
    })
);
