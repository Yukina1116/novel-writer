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
import { refreshFromIndexedDb } from '../hooks/refreshFromIndexedDb';
import { loadTutorialState } from '../db/tutorialRepository';
import { loadAnalysisHistory } from '../db/analysisHistoryRepository';

// `__APP_VERSION__` is replaced at build time by vite (see vite.config.ts).
// In tests / non-Vite contexts, fall back to a literal so this slice still
// loads. Guarded with typeof to avoid ReferenceError under vitest.
const APP_VERSION: string = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'test';

// Slice-local view of get(): showToast lives on UiSlice but the type union
// is built only in store/index.ts; mirror authSlice's typed-cast pattern.
type WithToast = { showToast?: (m: string, t?: 'info' | 'success' | 'error') => void };
type WithFlushSave = { flushSave?: () => Promise<void> };
type WithCloseModal = { closeModal?: () => void };

const errorMessage = (e: unknown): string =>
    e instanceof Error ? e.message : String(e);

export type BackupMetaStatus = 'unknown' | 'loaded';

export interface BackupSlice {
    lastExportedAt: string | null;
    backupMetaStatus: BackupMetaStatus;
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
    backupMetaStatus: 'unknown',
    importPlan: null,
    isExporting: false,
    isImporting: false,

    initBackupState: async () => {
        try {
            const iso = await loadLastExportedAt();
            set({ lastExportedAt: iso, backupMetaStatus: 'loaded' });
        } catch (e) {
            // Don't promote unknown to "loaded": isBackupStale needs to know
            // we couldn't read so it can suppress the warning banner instead
            // of showing "未実施" indefinitely.
            console.error('Failed to load lastExportedAt:', e);
            set({ lastExportedAt: null, backupMetaStatus: 'unknown' });
            (get() as WithToast).showToast?.(
                `バックアップ状態の読込に失敗しました: ${errorMessage(e)}`,
                'error',
            );
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

            // 1. Trigger the download. If this fails (e.g. blob/anchor APIs
            //    unavailable), nothing has been saved yet — propagate as a
            //    plain export failure.
            triggerDownload(filename, json);

            // 2. Persist lastExportedAt separately. The user already has the
            //    file at this point, so a save failure here is recoverable
            //    (banner stays "stale" but the data is on disk). Differentiate
            //    the messaging so the user isn't told the export "failed"
            //    when the JSON is actually in their downloads folder.
            const count = backup.projects.length;
            try {
                await saveLastExportedAt(backup.exportedAt);
                set({ lastExportedAt: backup.exportedAt, backupMetaStatus: 'loaded' });
                (get() as WithToast).showToast?.(`${count} 件のプロジェクトをエクスポートしました`, 'success');
            } catch (e: unknown) {
                console.error('saveLastExportedAt failed (download succeeded):', e);
                (get() as WithToast).showToast?.(
                    `${count} 件のプロジェクトをエクスポートしました（最終バックアップ日時の記録に失敗: ${errorMessage(e)}）`,
                    'error',
                );
            }
        } catch (e: unknown) {
            console.error('exportAllData failed:', e);
            (get() as WithToast).showToast?.(`エクスポートに失敗しました: ${errorMessage(e)}`, 'error');
        } finally {
            set({ isExporting: false });
        }
    },

    prepareImport: async (raw: string) => {
        // Flush in-memory edits to IndexedDB first so that conflict detection
        // sees the user's latest unsaved work and overwrite/skip choices
        // apply to the actual on-disk state. Without this, a project that
        // the user is currently editing would not appear in conflicts —
        // and a subsequent overwrite resolution would silently drop the
        // unsaved edit.
        //
        // H2 (Issue #49): a single transient failure (IDB quota/lock,
        // tab race, Dexie open conflict) used to be swallowed via
        // `console.error` and the import continued against a stale disk
        // snapshot. Retry once before giving up, and on a second failure
        // abort the import with an explicit toast — never proceed past
        // a failed flush, because doing so is the silent edit-loss path.
        const flushSave = (get() as WithFlushSave).flushSave;
        if (flushSave) {
            try {
                await flushSave();
            } catch (firstError) {
                console.error('flushSave before prepareImport failed (1st):', firstError);
                try {
                    await flushSave();
                } catch (secondError) {
                    console.error('flushSave before prepareImport failed (2nd, aborting):', secondError);
                    const detail = errorMessage(secondError);
                    (get() as WithToast).showToast?.(
                        `未保存の編集が IndexedDB に書き込めませんでした（${detail}）。インポートを中止しました。自動再試行後にもう一度お試しください。`,
                        'error',
                    );
                    throw new BackupValidationError(
                        `未保存の編集の保存に失敗したためインポートを中止しました: ${detail}`,
                    );
                }
            }
        }
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

    cancelImport: () => {
        // Also close the modal so we don't leak an `activeModal === 'importConflict'`
        // state with no plan to back it (ModalManager would render an empty
        // component and other modal/help routes would be silently blocked).
        set({ importPlan: null });
        (get() as WithCloseModal).closeModal?.();
    },

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

            // Re-hydrate in-memory state from IndexedDB. Without this,
            // allProjectsData/tutorialState/analysisHistory keep their pre-import
            // shape and the next markDirty/flushSave would silently overwrite
            // the freshly imported rows.
            await refreshFromIndexedDb({ keepActive: true });
            try {
                const flags = await loadTutorialState();
                const history = await loadAnalysisHistory();
                set({ ...flags, analysisHistory: history });
            } catch (e) {
                console.error('post-import side-store refresh failed:', e);
            }

            const skipped = plan.conflicts.filter(c => c.resolution === 'skip').length;
            set({ importPlan: null });
            (get() as WithCloseModal).closeModal?.();
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
        // If we couldn't read backupMeta we can't tell whether the user has a
        // recent export — suppress the banner rather than mislead them with
        // "未実施" while the underlying read keeps failing.
        if (get().backupMetaStatus === 'unknown') return false;
        const days = daysSince(get().lastExportedAt);
        return days === null || days > STALE_BACKUP_DAYS;
    },
});
