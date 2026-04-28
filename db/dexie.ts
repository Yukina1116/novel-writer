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
// older schema version while this tab is trying to upgrade. Dexie logs a
// warning to the console but produces no UI feedback, so the user just sees
// the upgrade stall indefinitely. We surface a toast instead, but the lower
// `db/` layer must not import from the upper `store/` layer (that would
// create a cycle), so the handler is injected from the consumer side via a
// setter and called back when the event fires.
//
// Bootstrap-gap policy: if `blocked` fires before the consumer has had a
// chance to register a handler, queue the latest payload so the next
// setBlockedHandler call can flush it. Dexie may also fire `blocked`
// multiple times — we collapse repeated fires into one user-facing
// notification per setBlockedHandler installation to avoid spam.

// Payload mirrors `IDBVersionChangeEvent` fields the consumer is most likely
// to surface (e.g. for richer toasts). We don't pass the raw event so that
// the handler signature is stable across Dexie/IDB API drift.
export interface BlockedEventPayload {
    oldVersion: number;
    newVersion: number | null;
}

export type BlockedHandler = (payload: BlockedEventPayload) => void;

let blockedHandler: BlockedHandler | null = null;
let pendingBlocked: BlockedEventPayload | null = null;
let alreadyNotifiedThisHandler = false;

const fireBlocked = (payload: BlockedEventPayload) => {
    if (!blockedHandler) {
        // No consumer ready yet — remember the latest event so the next
        // install can flush. Without this, a `blocked` racing the hook
        // mount would silently regress to the pre-PR hang. We keep only
        // the most recent payload because Dexie may re-fire as the older
        // tab keeps pinning, and the latest version numbers are the
        // useful ones.
        pendingBlocked = payload;
        return;
    }
    if (alreadyNotifiedThisHandler) return;
    alreadyNotifiedThisHandler = true;
    try {
        blockedHandler(payload);
    } catch (e) {
        // Dexie's event dispatcher would otherwise let an exception thrown
        // by showToast (e.g. store not yet initialised) bubble into the IDB
        // upgrade pipeline. Log and swallow so DB usage stays usable.
        console.error('Dexie blocked-handler threw:', e);
    }
};

export const setBlockedHandler = (handler: BlockedHandler | null): void => {
    blockedHandler = handler;
    alreadyNotifiedThisHandler = false;
    if (handler && pendingBlocked) {
        const flushed = pendingBlocked;
        pendingBlocked = null;
        fireBlocked(flushed);
    }
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
    instance.on('blocked', (event: IDBVersionChangeEvent) => {
        fireBlocked({
            oldVersion: event.oldVersion,
            newVersion: event.newVersion,
        });
    });
    return instance;
};

// Lazy init: defer construction so failures throw at the call site (catchable
// by useLocalSync) instead of at module evaluation (white-screening the app).
let _db: AppDexieDb | null = null;
export const getDb = (): AppDexieDb => (_db ??= createDb());
