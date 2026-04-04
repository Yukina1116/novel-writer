import { updateProjectApi } from '../projectApi';

export interface SyncSlice {
    saveStatus: 'synced' | 'saving' | 'dirty' | 'error';
    lastSyncError: string | null;
    _saveTimer: ReturnType<typeof setTimeout> | null;
    markDirty: () => void;
    flushSave: () => Promise<void>;
}

export const createSyncSlice = (set, get): SyncSlice => ({
    saveStatus: 'synced',
    lastSyncError: null,
    _saveTimer: null,

    markDirty: () => {
        const { _saveTimer } = get();
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
        if (saveStatus === 'saving') return;

        set({ saveStatus: 'saving' as const, _saveTimer: null });

        try {
            const project = allProjectsData[activeProjectId];
            await updateProjectApi(activeProjectId, project);
            set({ saveStatus: 'synced' as const, lastSyncError: null });
        } catch (error: any) {
            console.error('Failed to save project:', error);
            set({ saveStatus: 'error' as const, lastSyncError: error.message });
        }
    },
});
