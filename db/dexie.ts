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

// `blocked` fires when an open connection from another tab pins the DB at an
// older schema version while this tab is trying to upgrade. The default Dexie
// behavior is to wait silently — the user sees nothing and assumes the app
// hung. We surface this through a UI handler instead, but `db/` must not
// depend on `store/` (that would create a `store → db → store` cycle), so the
// handler is injected via a setter from the bootstrap path (useLocalSync).
let blockedHandler: (() => void) | null = null;
export const setBlockedHandler = (handler: (() => void) | null): void => {
    blockedHandler = handler;
};

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
    instance.on('blocked', () => {
        blockedHandler?.();
    });
    return instance;
};

// Lazy init: defer construction so failures throw at the call site (catchable
// by useLocalSync) instead of at module evaluation (white-screening the app).
let _db: AppDexieDb | null = null;
export const getDb = (): AppDexieDb => (_db ??= createDb());
