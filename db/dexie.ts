import Dexie, { type EntityTable } from 'dexie';
import { AnalysisResult, Project } from '../types';

export interface ProjectListEntry {
    id: string;
    name: string;
    lastModified: string;
    isSimpleMode?: boolean;
}

export interface TutorialStateRecord {
    version: number;
    hasCompletedGlobalTutorial?: boolean;
    hasCompletedGlobalKnowledgeTutorial?: boolean;
    hasCompletedGlobalChartTutorial?: boolean;
    hasCompletedGlobalPlotBoardTutorial?: boolean;
    hasCompletedGlobalTimelineTutorial?: boolean;
}

export interface AnalysisHistoryRecord {
    key: string;
    history: AnalysisResult[];
}

export type AppDexieDb = Dexie & {
    projects: EntityTable<Project, 'id'>;
    tutorialState: EntityTable<TutorialStateRecord, 'version'>;
    analysisHistory: EntityTable<AnalysisHistoryRecord, 'key'>;
};

export const DB_NAME = 'novelWriterDb';
export const DB_VERSION = 1;
export const TUTORIAL_STATE_VERSION = 1;
export const ANALYSIS_HISTORY_KEY = 'current';

const createDb = (): AppDexieDb => {
    const instance = new Dexie(DB_NAME) as AppDexieDb;
    instance.version(DB_VERSION).stores({
        projects: 'id, lastModified',
        tutorialState: 'version',
        analysisHistory: 'key',
    });
    return instance;
};

export const db: AppDexieDb = createDb();
