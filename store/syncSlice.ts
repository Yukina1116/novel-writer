import { putProject } from '../db/projectRepository';

export interface SyncSlice {
    saveStatus: 'synced' | 'saving' | 'dirty' | 'error';
    lastSyncError: string | null;
    _saveTimer: ReturnType<typeof setTimeout> | null;
    // Set by markDirty/flushSave when saveStatus === 'saving'. flushSave checks it
    // post-await so writes during the in-flight putProject are not lost.
    _pendingFlush: boolean;
    markDirty: () => void;
    flushSave: () => Promise<void>;
}

export const createSyncSlice = (set, get): SyncSlice => ({
    saveStatus: 'synced',
    lastSyncError: null,
    _saveTimer: null,
    _pendingFlush: false,

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

        set({ saveStatus: 'saving' as const, _saveTimer: null, _pendingFlush: false });

        try {
            const project = allProjectsData[activeProjectId];
            await putProject(project);
            if (get()._pendingFlush) {
                set({ saveStatus: 'synced' as const, lastSyncError: null, _pendingFlush: false });
                get().markDirty();
            } else {
                set({ saveStatus: 'synced' as const, lastSyncError: null });
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
            });
            (get() as any).showToast?.(
                `保存に失敗しました（5秒後に自動再試行します）: ${error.message}`,
                'error',
            );
        }
    },
});
