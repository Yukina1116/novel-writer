import Dexie, { type EntityTable } from 'dexie';
import { Project } from '../types';

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
    history: unknown[];
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

let dbInstance: AppDexieDb | null = null;

export const getDb = (): AppDexieDb => {
    if (dbInstance) return dbInstance;
    const db = new Dexie(DB_NAME) as AppDexieDb;
    db.version(DB_VERSION).stores({
        projects: 'id, lastModified',
        tutorialState: 'version',
        analysisHistory: 'key',
    });
    dbInstance = db;
    return db;
};

export const isIndexedDbAvailable = async (): Promise<boolean> => {
    if (typeof indexedDB === 'undefined') return false;
    try {
        await getDb().open();
        return true;
    } catch {
        return false;
    }
};
