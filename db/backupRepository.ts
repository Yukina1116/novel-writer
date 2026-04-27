import { BackupV1, Project } from '../types';
import { validateAndSanitizeProjectData } from '../utils';
import {
    ANALYSIS_HISTORY_KEY,
    BACKUP_META_KEY,
    TUTORIAL_STATE_VERSION,
    getDb,
} from './dexie';
import { pickPersistableFields, stripInternalKeys } from './projectRepository';

// Mirrors putProject's sanitize chain (validate → whitelist → strip "_" keys)
// so the import path cannot bypass PERSISTABLE_KEYS. Kept inline so the whole
// chain runs inside the import transaction without breaking atomicity.
const sanitizeForImport = (project: Project): Project => {
    const validated = validateAndSanitizeProjectData(project);
    const persistable = pickPersistableFields(validated);
    return stripInternalKeys(persistable) as Project;
};

export interface ExportSnapshot {
    projects: Project[];
    tutorialState: BackupV1['tutorialState'];
    analysisHistory: BackupV1['analysisHistory'];
}

export const readSnapshot = async (): Promise<ExportSnapshot> => {
    const db = getDb();
    const [projects, tutorialRecord, analysisRecord] = await Promise.all([
        db.projects.orderBy('lastModified').reverse().toArray(),
        db.tutorialState.get(TUTORIAL_STATE_VERSION),
        db.analysisHistory.get(ANALYSIS_HISTORY_KEY),
    ]);
    const tutorialState = (() => {
        if (!tutorialRecord) return {};
        const { version: _v, ...flags } = tutorialRecord;
        return flags;
    })();
    return {
        projects: projects.map(p => validateAndSanitizeProjectData(p)),
        tutorialState,
        analysisHistory: analysisRecord?.history ?? [],
    };
};

export interface WriteImportPayload {
    toUpsert: Project[];
    toCreate: Project[];
    tutorialState: BackupV1['tutorialState'];
    analysisHistory: BackupV1['analysisHistory'];
}

// Single Dexie transaction so a partial failure never leaves IndexedDB in a
// half-imported state. AC-5 atomicity.
export const writeImport = async (payload: WriteImportPayload): Promise<void> => {
    const db = getDb();
    await db.transaction(
        'rw',
        [db.projects, db.tutorialState, db.analysisHistory],
        async () => {
            for (const p of payload.toUpsert) await db.projects.put(sanitizeForImport(p));
            for (const p of payload.toCreate) await db.projects.put(sanitizeForImport(p));
            await db.tutorialState.put({
                version: TUTORIAL_STATE_VERSION,
                ...payload.tutorialState,
            });
            await db.analysisHistory.put({
                key: ANALYSIS_HISTORY_KEY,
                history: payload.analysisHistory,
            });
        },
    );
};

export const loadLastExportedAt = async (): Promise<string | null> => {
    const record = await getDb().backupMeta.get(BACKUP_META_KEY);
    return record?.lastExportedAt ?? null;
};

export const saveLastExportedAt = async (iso: string): Promise<void> => {
    await getDb().backupMeta.put({ key: BACKUP_META_KEY, lastExportedAt: iso });
};
