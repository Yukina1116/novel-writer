import {
    BackupV1,
    ImportConflict,
    ImportConflictResolution,
    ImportPlan,
    Project,
} from '../types';
import {
    BackupValidationError,
    buildBackupFilename,
    buildBackupV1,
    parseBackup,
    resolveImportProjects,
    serializeBackup,
} from '../utils/backupSchema';
import {
    loadLastExportedAt,
    readSnapshot,
    saveLastExportedAt,
    writeImport,
} from '../db/backupRepository';
import { STALE_BACKUP_DAYS, daysSince } from '../utils/backupFormat';

// `__APP_VERSION__` is replaced at build time by vite (see vite.config.ts).
// In tests / non-Vite contexts, fall back to a literal so this slice still
// loads. Guarded with typeof to avoid ReferenceError under vitest.
const APP_VERSION: string = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'test';

// Slice-local view of get(): showToast lives on UiSlice but the type union
// is built only in store/index.ts; mirror authSlice's typed-cast pattern.
type WithToast = { showToast?: (m: string, t?: 'info' | 'success' | 'error') => void };

const errorMessage = (e: unknown): string =>
    e instanceof Error ? e.message : String(e);

export interface BackupSlice {
    lastExportedAt: string | null;
    importPlan: ImportPlan | null;
    isExporting: boolean;
    isImporting: boolean;

    initBackupState: () => Promise<void>;
    exportAllData: () => Promise<void>;
    prepareImport: (raw: string) => Promise<ImportPlan>;
    setImportResolution: (incomingId: string, resolution: ImportConflictResolution) => void;
    cancelImport: () => void;
    executeImport: () => Promise<{ upserted: number; created: number; skipped: number }>;
    isBackupStale: () => boolean;
}

const triggerDownload = (filename: string, content: string) => {
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    // Defer revoke so Safari/Firefox can resolve the blob before it is freed.
    // Synchronous revoke after click() races with the browser's download
    // pipeline and produces empty files in those engines.
    setTimeout(() => URL.revokeObjectURL(url), 0);
};

const detectConflicts = (incoming: Project[], existing: Project[]): ImportConflict[] => {
    const existingMap = new Map(existing.map(p => [p.id, p]));
    const conflicts: ImportConflict[] = [];
    for (const p of incoming) {
        const existed = existingMap.get(p.id);
        if (existed) {
            conflicts.push({
                incomingId: p.id,
                incomingName: p.name,
                existingName: existed.name,
                resolution: 'overwrite',
            });
        }
    }
    return conflicts;
};

export const createBackupSlice = (set, get): BackupSlice => ({
    lastExportedAt: null,
    importPlan: null,
    isExporting: false,
    isImporting: false,

    initBackupState: async () => {
        try {
            const iso = await loadLastExportedAt();
            set({ lastExportedAt: iso });
        } catch (e) {
            console.error('Failed to load lastExportedAt:', e);
        }
    },

    exportAllData: async () => {
        if (get().isExporting) return;
        set({ isExporting: true });
        try {
            const snapshot = await readSnapshot();
            const backup: BackupV1 = buildBackupV1({
                projects: snapshot.projects,
                tutorialState: snapshot.tutorialState,
                analysisHistory: snapshot.analysisHistory,
                appVersion: APP_VERSION,
            });
            const json = serializeBackup(backup);
            const filename = buildBackupFilename();
            triggerDownload(filename, json);
            await saveLastExportedAt(backup.exportedAt);
            set({ lastExportedAt: backup.exportedAt });
            const count = backup.projects.length;
            (get() as WithToast).showToast?.(`${count} 件のプロジェクトをエクスポートしました`, 'success');
        } catch (e: unknown) {
            console.error('exportAllData failed:', e);
            (get() as WithToast).showToast?.(`エクスポートに失敗しました: ${errorMessage(e)}`, 'error');
        } finally {
            set({ isExporting: false });
        }
    },

    prepareImport: async (raw: string) => {
        const backup = parseBackup(raw);
        const snapshot = await readSnapshot();
        const conflicts = detectConflicts(backup.projects, snapshot.projects);
        const plan: ImportPlan = { backup, conflicts };
        set({ importPlan: plan });
        return plan;
    },

    setImportResolution: (incomingId, resolution) => {
        const plan = get().importPlan;
        if (!plan) return;
        const next: ImportPlan = {
            ...plan,
            conflicts: plan.conflicts.map(c =>
                c.incomingId === incomingId ? { ...c, resolution } : c,
            ),
        };
        set({ importPlan: next });
    },

    cancelImport: () => set({ importPlan: null }),

    executeImport: async () => {
        const plan = get().importPlan;
        if (!plan) throw new BackupValidationError('インポート対象がありません。');
        if (get().isImporting) throw new Error('既にインポート処理中です。');
        set({ isImporting: true });
        try {
            // Re-read existing IDs to avoid TOCTOU between prepareImport and
            // execute: a delete done elsewhere shouldn't force resolution that
            // no longer applies, and an insert done elsewhere shouldn't be
            // silently overwritten without confirmation.
            const snapshot = await readSnapshot();
            const existingIds = new Set(snapshot.projects.map(p => p.id));
            const resolutions = new Map<string, ImportConflictResolution>(
                plan.conflicts.map(c => [c.incomingId, c.resolution]),
            );
            const { toUpsert, toCreate } = resolveImportProjects(
                plan.backup.projects,
                existingIds,
                resolutions,
            );
            await writeImport({
                toUpsert,
                toCreate,
                tutorialState: plan.backup.tutorialState,
                analysisHistory: plan.backup.analysisHistory,
            });
            const skipped = plan.conflicts.filter(c => c.resolution === 'skip').length;
            set({ importPlan: null });
            (get() as WithToast).showToast?.(
                `${toUpsert.length + toCreate.length} 件のプロジェクトを復元しました（スキップ ${skipped} 件）`,
                'success',
            );
            return { upserted: toUpsert.length, created: toCreate.length, skipped };
        } catch (e: unknown) {
            // Don't toast here: ImportConflictModal renders the same message
            // inline (red banner). Surfacing a toast in addition would double
            // up the same error in two places.
            console.error('executeImport failed:', e);
            throw e;
        } finally {
            set({ isImporting: false });
        }
    },

    isBackupStale: () => {
        const days = daysSince(get().lastExportedAt);
        return days === null || days > STALE_BACKUP_DAYS;
    },
});
