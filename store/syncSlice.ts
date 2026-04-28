import { putProject } from '../db/projectRepository';

/**
 * Delay before the auto-retry kicks in after a save failure. Single source
 * of truth for both the timer (in flushSave's catch) and the user-facing
 * toast text — a literal mismatch would lie to the user.
 */
export const SAVE_RETRY_DELAY_MS = 5_000;

/**
 * Default ceiling for flushSaveBlocking. A hung IndexedDB shouldn't be able
 * to deadlock the UI for longer than this. prepareImport reuses this value
 * directly; callers that genuinely need a different deadline should pass
 * their own.
 */
export const FLUSH_SAVE_BLOCKING_DEFAULT_TIMEOUT_MS = 10_000;

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
     *
     * Internal — exposed on the interface only because Zustand slices
     * can't use TypeScript `private`. External code MUST NOT mutate this
     * directly; corrupting the field will break in-flight tracking and
     * silently break flushSaveBlocking. The underscore prefix follows
     * the existing internal-field convention (_saveTimer, _pendingFlush).
     */
    _savingPromise: Promise<void> | null;
    markDirty: () => void;
    flushSave: () => Promise<void>;
    /**
     * Wait until the active project is fully persisted, then resolve.
     * Behavior:
     * - synced: returns immediately (no-op).
     * - saving (a putProject is in flight): awaits `_savingPromise`. If
     *   that in-flight save **rejects**, this method rejects with the
     *   same error — the caller decides whether to retry. We do NOT
     *   silently retry inside the same call; doing so would obscure
     *   transient failures and mask repeated cross-tab races.
     * - dirty / error (no save in flight, but pending changes): triggers
     *   a fresh flushSave() and awaits its outcome. flushSave never
     *   throws (it converts failures into saveStatus='error'), so we
     *   re-check saveStatus after the await and throw to surface a
     *   real failure to the caller.
     *
     * Times out after `timeoutMs` (default
     * `FLUSH_SAVE_BLOCKING_DEFAULT_TIMEOUT_MS`) so a hung IndexedDB
     * can't deadlock the UI. The caller (e.g. prepareImport) is expected
     * to retry once on rejection before giving up to the user.
     */
    flushSaveBlocking: (timeoutMs?: number) => Promise<void>;
}

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
            const retryTimer = setTimeout(() => get().flushSave(), SAVE_RETRY_DELAY_MS);
            set({
                saveStatus: 'error' as const,
                lastSyncError: error.message,
                _pendingFlush: false,
                _saveTimer: retryTimer,
                _savingPromise: null,
            });
            (get() as any).showToast?.(
                `保存に失敗しました（${SAVE_RETRY_DELAY_MS / 1000}秒後に自動再試行します）: ${error.message}`,
                'error',
            );
            rejectSavingPromise!(error);
        }
    },

    flushSaveBlocking: async (timeoutMs = FLUSH_SAVE_BLOCKING_DEFAULT_TIMEOUT_MS) => {
        const work = async () => {
            // 1. If a save is already in flight, wait for IT. If it rejects,
            //    propagate the failure to the caller — DO NOT silently retry
            //    inside this same call. Letting the caller see the rejection
            //    keeps the contract clear (in-flight failure is the caller's
            //    failure, not a hidden retry) and preserves their ability
            //    to decide retry policy. prepareImport, for example, retries
            //    once at its layer before alerting the user.
            const inFlight = get()._savingPromise;
            if (inFlight) {
                await inFlight;
                // Successful in-flight save — the slice may now be 'dirty'
                // because a markDirty during the save set _pendingFlush,
                // which flushSave's success path translates back to dirty
                // via markDirty(). Fall through to the dirty/error branch
                // below so we re-flush.
            }
            // 2. dirty (markDirty fired during in-flight or unrelated edit)
            //    or error (a previous failed flush parked here): trigger
            //    a fresh flush. flushSave never throws — it converts
            //    failures into saveStatus='error' + a SAVE_RETRY_DELAY_MS
            //    retry timer. Re-check saveStatus afterwards rather than
            //    relying on await to surface failure.
            //    activeProjectId-less stores leave saveStatus untouched
            //    ('synced'), which is correctly treated as nothing-to-do.
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
