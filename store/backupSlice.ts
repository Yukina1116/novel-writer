import {
    BackupV1,
    EncryptedBackupV1,
    ImportConflict,
    ImportConflictResolution,
    ImportPlan,
    Project,
} from '../types';
import {
    BackupPreflightError,
    BackupValidationError,
    buildBackupFilename,
    buildBackupV1,
    buildEncryptedBackupFilename,
    parseAnyBackup,
    parseBackup,
    resolveImportProjects,
    serializeBackup,
} from '../utils/backupSchema';
import { decryptBackup, encryptBackup } from '../utils/backupCrypto';
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
type WithFlushSaveBlocking = { flushSaveBlocking?: (timeoutMs?: number) => Promise<void> };
type WithCloseModal = { closeModal?: () => void };

const errorMessage = (e: unknown): string =>
    e instanceof Error ? e.message : String(e);

export type BackupMetaStatus = 'unknown' | 'loaded';

// M6 PR-C: pendingDecryption represents the in-flight encrypted import flow.
// Spec: docs/spec/m6/state-diagram.md
export interface PendingDecryption {
    rawEnvelope: EncryptedBackupV1;
    retryCount: number;          // 0..MAX_DECRYPT_RETRIES
    abortController: AbortController;
    isDecrypting: boolean;       // true while KDF/AES-GCM in flight
}

export const MAX_DECRYPT_RETRIES = 5;

// User-facing toast contracts pinned by docs/spec/m6/state-diagram.md §エラー文言.
// Mirrors the DECRYPT_FAILURE_MESSAGE constant pattern (utils/backupCrypto.ts):
// the constant is the contract, tests assert exact equality so silent text
// drift between spec / slice / UI fails CI rather than the user.
export const DECRYPT_OVERWRITE_TOAST = '進行中の復号処理を中断しました。';
export const DECRYPT_RETRY_EXCEEDED_TOAST =
    '再試行回数の上限に達しました。ファイルとパスフレーズを確認してください。';

// Discriminated result of prepareImport so callers (UI) know which modal to mount.
export type PrepareImportResult =
    | { kind: 'plaintext'; plan: ImportPlan }
    | { kind: 'encrypted' };  // pendingDecryption is set; UI mounts ImportPassphraseModal

export interface BackupSlice {
    lastExportedAt: string | null;
    backupMetaStatus: BackupMetaStatus;
    importPlan: ImportPlan | null;
    pendingDecryption: PendingDecryption | null;
    isExporting: boolean;
    isImporting: boolean;

    initBackupState: () => Promise<void>;
    exportAllData: (opts?: { encrypt?: { passphrase: string }; signal?: AbortSignal }) => Promise<void>;
    prepareImport: (raw: string) => Promise<PrepareImportResult>;
    setImportResolution: (incomingId: string, resolution: ImportConflictResolution) => void;
    cancelImport: () => void;
    executeImport: () => Promise<{ upserted: number; created: number; skipped: number }>;
    decryptAndPrepareImport: (passphrase: string) => Promise<PrepareImportResult>;
    cancelPendingDecryption: () => void;
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

// Returns true when this decrypt session no longer owns pendingDecryption —
// either the abort signal fired, or a later prepareImport / cancel installed a
// different (or null) state. Centralizing both checks ensures the failure
// path and success path race guards stay in lockstep when the predicate
// evolves (e.g. adding a generation counter in M6.5 cloud storage).
const isStaleDecryptSession = (
    sessionController: AbortController,
    current: PendingDecryption | null,
): boolean =>
    sessionController.signal.aborted
    || !current
    || current.abortController !== sessionController;

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
    pendingDecryption: null,
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

    exportAllData: async (opts) => {
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

            const encryptOpt = opts?.encrypt;
            const json = encryptOpt
                ? JSON.stringify(
                      await encryptBackup(backup, encryptOpt.passphrase, APP_VERSION, {
                          signal: opts?.signal,
                      }),
                      null,
                      2,
                  )
                : serializeBackup(backup);
            const filename = encryptOpt
                ? buildEncryptedBackupFilename()
                : buildBackupFilename();

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
        // H2 (Issue #49): we must use flushSaveBlocking, not flushSave.
        // flushSave silently early-returns when saveStatus === 'saving',
        // which would let a still-in-flight save go un-awaited and let
        // prepareImport see a stale snapshot. flushSaveBlocking awaits the
        // in-flight promise (propagating its rejection), then retriggers
        // the flush if dirty/error, and throws on actual save failure so
        // we abort instead of silently proceeding past a missed write.
        //
        // Retry once before giving up. flushSaveBlocking deliberately does
        // NOT retry inside a single call — it surfaces in-flight failures
        // so each layer can decide retry policy. We retry once here to
        // catch fast-recovery cases (transient quota, brief Dexie open
        // race); the sync slice's own SAVE_RETRY_DELAY_MS background timer
        // handles slower recoveries on its own.
        const flushSaveBlocking = (get() as WithFlushSaveBlocking).flushSaveBlocking;
        if (flushSaveBlocking) {
            try {
                await flushSaveBlocking();
            } catch (firstError) {
                console.error('flushSaveBlocking before prepareImport failed (1st):', firstError);
                try {
                    await flushSaveBlocking();
                } catch (secondError) {
                    console.error('flushSaveBlocking before prepareImport failed (2nd, aborting):', secondError);
                    const detail = errorMessage(secondError);
                    (get() as WithToast).showToast?.(
                        `未保存の編集が IndexedDB に書き込めませんでした（${detail}）。インポートを中止しました。数秒待ってからもう一度お試しください。`,
                        'error',
                    );
                    throw new BackupPreflightError(
                        `未保存の編集の保存に失敗したためインポートを中止しました: ${detail}`,
                    );
                }
            }
        } else {
            // Legacy / test environments without the blocking API: keep
            // the original best-effort flushSave so callers that haven't
            // wired the new method (or unit tests stubbing only flushSave)
            // continue to work.
            try {
                await (get() as WithFlushSave).flushSave?.();
            } catch (e) {
                console.error('flushSave before prepareImport failed (legacy path):', e);
            }
        }
        // Race-free overwrite: if a previous encrypted import is still in
        // flight, abort it deterministically before installing new state so
        // the old session's resolve handler (post-KDF) is gated by aborted.
        // Also surface a toast so the user isn't surprised by the discard.
        const prior = get().pendingDecryption;
        if (prior) {
            prior.abortController.abort();
            set({ pendingDecryption: null });
            (get() as WithToast).showToast?.(DECRYPT_OVERWRITE_TOAST, 'info');
        }

        const parsed = parseAnyBackup(raw);
        // 'encrypted' is absent on BackupV1 — `in` triggers TS narrowing
        // without needing the runtime === true check.
        if ('encrypted' in parsed) {
            const pending: PendingDecryption = {
                rawEnvelope: parsed,
                retryCount: 0,
                abortController: new AbortController(),
                isDecrypting: false,
            };
            set({ pendingDecryption: pending, importPlan: null });
            return { kind: 'encrypted' };
        }
        const snapshot = await readSnapshot();
        const conflicts = detectConflicts(parsed.projects, snapshot.projects);
        const plan: ImportPlan = { backup: parsed, conflicts };
        set({ importPlan: plan });
        return { kind: 'plaintext', plan };
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

    decryptAndPrepareImport: async (passphrase: string) => {
        const pending = get().pendingDecryption;
        if (!pending) {
            throw new BackupValidationError(
                '復号対象のバックアップがありません。',
                { cause: { kind: 'no-pending-decryption' } },
            );
        }
        if (pending.isDecrypting) {
            throw new BackupValidationError(
                '既に復号処理中です。',
                { cause: { kind: 'concurrent-decrypt' } },
            );
        }
        // Snapshot the controller before transitioning so the post-await
        // closure tests against THIS session's abort signal — a later
        // cancelPendingDecryption / prepareImport(2nd) installs a new
        // controller and we must not mistake that for "this session ok".
        const sessionController = pending.abortController;
        set({ pendingDecryption: { ...pending, isDecrypting: true } });

        let backup: BackupV1;
        try {
            backup = await decryptBackup(pending.rawEnvelope, passphrase, {
                signal: sessionController.signal,
            });
        } catch (e) {
            // Race guard: if a cancel/overwrite happened mid-decrypt, drop the
            // result — the new session (or null) already owns the state slot.
            if (isStaleDecryptSession(sessionController, get().pendingDecryption)) {
                throw e;
            }
            const next = get().pendingDecryption!;
            const newRetry = next.retryCount + 1;
            if (newRetry >= MAX_DECRYPT_RETRIES) {
                set({ pendingDecryption: null });
                (get() as WithCloseModal).closeModal?.();
                (get() as WithToast).showToast?.(DECRYPT_RETRY_EXCEEDED_TOAST, 'error');
            } else {
                // Slice owns retryCount; UI (PR-D) reads pendingDecryption.retryCount
                // and renders the "(あと N 回まで再試行できます)" suffix from
                // MAX_DECRYPT_RETRIES - retryCount. The composed string stays out
                // of state so the modal re-renders reactively without slice churn,
                // matching docs/spec/m6/state-diagram.md §エラー文言.
                set({
                    pendingDecryption: { ...next, retryCount: newRetry, isDecrypting: false },
                });
            }
            throw e;
        }

        // Race guard on success path too: drop the result rather than silently
        // replacing the new session's state with stale plaintext.
        if (isStaleDecryptSession(sessionController, get().pendingDecryption)) {
            throw new BackupValidationError('復号処理がキャンセルされました。');
        }

        const snapshot = await readSnapshot();
        const conflicts = detectConflicts(backup.projects, snapshot.projects);
        const plan: ImportPlan = { backup, conflicts };
        // Atomic transition: clear pendingDecryption and set importPlan in
        // one set() so the invariant `pendingDecryption !== null ⇒ importPlan === null`
        // is never observably violated.
        set({ pendingDecryption: null, importPlan: plan });
        return { kind: 'plaintext', plan };
    },

    cancelPendingDecryption: () => {
        const pending = get().pendingDecryption;
        if (!pending) return;
        pending.abortController.abort();
        set({ pendingDecryption: null });
        (get() as WithCloseModal).closeModal?.();
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
