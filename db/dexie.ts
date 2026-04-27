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

export interface BackupMetaRecord {
    key: string;
    lastExportedAt: string | null;
}

export type AppDexieDb = Dexie & {
    projects: EntityTable<Project, 'id'>;
    tutorialState: EntityTable<TutorialStateRecord, 'version'>;
    analysisHistory: EntityTable<AnalysisHistoryRecord, 'key'>;
    backupMeta: EntityTable<BackupMetaRecord, 'key'>;
};

export const DB_NAME = 'novelWriterDb';
export const DB_VERSION = 2;
export const TUTORIAL_STATE_VERSION = 1;
export const ANALYSIS_HISTORY_KEY = 'current';
export const BACKUP_META_KEY = 'current';

const createDb = (): AppDexieDb => {
    const instance = new Dexie(DB_NAME) as AppDexieDb;
    instance.version(1).stores({
        projects: 'id, lastModified',
        tutorialState: 'version',
        analysisHistory: 'key',
    });
    instance.version(DB_VERSION).stores({
        projects: 'id, lastModified',
        tutorialState: 'version',
        analysisHistory: 'key',
        backupMeta: 'key',
    });
    return instance;
};

// Lazy init: defer construction so failures throw at the call site (catchable
// by useLocalSync) instead of at module evaluation (white-screening the app).
let _db: AppDexieDb | null = null;
export const getDb = (): AppDexieDb => (_db ??= createDb());
