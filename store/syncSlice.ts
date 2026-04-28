import { putProject } from '../db/projectRepository';

export interface SyncSlice {
    saveStatus: 'synced' | 'saving' | 'dirty' | 'error';
    lastSyncError: string | null;
    _saveTimer: ReturnType<typeof setTimeout> | null;
    // Set by markDirty/flushSave when saveStatus === 'saving'. flushSave checks it
    // post-await so writes during the in-flight putProject are not lost.
    _pendingFlush: boolean;
    /**
     * Settles when the current putProject() completes (resolve on success,
     * reject with the underlying error on failure). Null when no save is
     * in flight. Consumers awaiting "true flush completion" must await
     * this — flushSave() itself returns immediately when `saveStatus`
     * was already 'saving' to avoid stacking writes.
     */
    _savingPromise: Promise<void> | null;
    markDirty: () => void;
    flushSave: () => Promise<void>;
    /**
     * Wait until the active project is fully persisted. Differs from
     * flushSave(): if a save is in flight, waits for it; if dirty/error,
     * triggers and waits for a fresh flush; if synced, returns immediately.
     * Throws on save failure (the caller — e.g. prepareImport — needs to
     * abort instead of silently using a stale on-disk snapshot). Times
     * out after `timeoutMs` so a hung IndexedDB can't deadlock the UI.
     */
    flushSaveBlocking: (timeoutMs?: number) => Promise<void>;
}

const FLUSH_SAVE_BLOCKING_DEFAULT_TIMEOUT_MS = 10_000;

export const createSyncSlice = (set, get): SyncSlice => ({
    saveStatus: 'synced',
    lastSyncError: null,
    _saveTimer: null,
    _pendingFlush: false,
    _savingPromise: null,

    markDirty: () => {
        const { _saveTimer, saveStatus } = get();
        if (saveStatus === 'saving') {
            set({ _pendingFlush: true });
            return;
        }
        if (_saveTimer) clearTimeout(_saveTimer);
        const timer = setTimeout(() => {
            get().flushSave();
        }, 2000);
        set({ saveStatus: 'dirty' as const, _saveTimer: timer });
    },

    flushSave: async () => {
        const { activeProjectId, allProjectsData, _saveTimer, saveStatus } = get();
        if (_saveTimer) clearTimeout(_saveTimer);
        if (!activeProjectId || !allProjectsData[activeProjectId]) return;
        if (saveStatus === 'saving') {
            set({ _pendingFlush: true });
            return;
        }

        // Build an externally-resolvable promise so callers awaiting via
        // flushSaveBlocking() can observe the actual disk-write completion
        // (resolve) or failure (reject) — not the early-return resolve.
        let resolveSavingPromise: () => void;
        let rejectSavingPromise: (e: unknown) => void;
        const savingPromise = new Promise<void>((res, rej) => {
            resolveSavingPromise = res;
            rejectSavingPromise = rej;
        });
        // Suppress unhandled rejection if no one awaits us — we still
        // surface failure via saveStatus + toast in the catch block.
        savingPromise.catch(() => {});

        set({
            saveStatus: 'saving' as const,
            _saveTimer: null,
            _pendingFlush: false,
            _savingPromise: savingPromise,
        });

        try {
            const project = allProjectsData[activeProjectId];
            await putProject(project);
            if (get()._pendingFlush) {
                set({ saveStatus: 'synced' as const, lastSyncError: null, _pendingFlush: false, _savingPromise: null });
                resolveSavingPromise!();
                get().markDirty();
            } else {
                set({ saveStatus: 'synced' as const, lastSyncError: null, _savingPromise: null });
                resolveSavingPromise!();
            }
        } catch (error: any) {
            console.error('Failed to save project:', error);
            // Schedule a retry so subsequent edits aren't stranded by a transient
            // failure (quota / DB closed by another tab / Dexie open race).
            const retryTimer = setTimeout(() => get().flushSave(), 5000);
            set({
                saveStatus: 'error' as const,
                lastSyncError: error.message,
                _pendingFlush: false,
                _saveTimer: retryTimer,
                _savingPromise: null,
            });
            (get() as any).showToast?.(
                `保存に失敗しました（5秒後に自動再試行します）: ${error.message}`,
                'error',
            );
            rejectSavingPromise!(error);
        }
    },

    flushSaveBlocking: async (timeoutMs = FLUSH_SAVE_BLOCKING_DEFAULT_TIMEOUT_MS) => {
        const work = async () => {
            // 1. If a save is already in flight, wait for IT to finish first.
            //    Without this, callers see a "synced" race where flushSave
            //    short-circuits while putProject is still in flight on the
            //    other branch.
            const inFlight = get()._savingPromise;
            if (inFlight) {
                // The in-flight save's failure is the caller's failure —
                // propagate it (the throw is caught by the outer
                // .catch below).
                await inFlight;
            }
            // 2. After waiting, the slice may be dirty (a markDirty fired
            //    during the in-flight save — _pendingFlush=true path) or
            //    error (the in-flight save rejected). Trigger a fresh
            //    flush in either case.
            //    Note: flushSave never throws — it converts failures into
            //    saveStatus='error' + a 5s retry timer. We must re-check
            //    saveStatus afterwards rather than relying on the await
            //    to surface failure. activeProjectId-less stores leave
            //    saveStatus untouched ('synced'), which is correctly
            //    treated as nothing-to-do here.
            const status = get().saveStatus;
            if (status === 'dirty' || status === 'error') {
                await get().flushSave();
                if (get().saveStatus === 'error') {
                    throw new Error(get().lastSyncError ?? 'save failed');
                }
            }
            // 3. Otherwise the slice is already synced → nothing to do.
        };

        // Use a constructed Promise (not Promise.race + a separately
        // constructed timeout Promise) so the timeout rejection is always
        // owned by a settled-flag-guarded reject() call. Promise.race +
        // a free-standing rejecting Promise leaves the loser's rejection
        // un-awaited, which Node reports as an unhandled rejection in
        // certain test runners.
        return new Promise<void>((resolve, reject) => {
            let settled = false;
            const timer = setTimeout(() => {
                if (settled) return;
                settled = true;
                reject(new Error(`flushSave timed out after ${timeoutMs}ms`));
            }, timeoutMs);

            work().then(
                () => {
                    if (settled) return;
                    settled = true;
                    clearTimeout(timer);
                    resolve();
                },
                (err) => {
                    if (settled) return;
                    settled = true;
                    clearTimeout(timer);
                    reject(err);
                },
            );
        });
    },
});
