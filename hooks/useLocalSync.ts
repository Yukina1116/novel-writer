import { useEffect, useState } from 'react';
import { useStore } from '../store/index';
import { isIndexedDbAvailable } from '../db/dexie';
import { getProject, listProjects, putProject } from '../db/projectRepository';

export const useLocalSync = () => {
    const [isInitializing, setIsInitializing] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const flushSave = useStore(state => state.flushSave);

    useEffect(() => {
        const init = async () => {
            try {
                if (!(await isIndexedDbAvailable())) {
                    throw new Error(
                        'このブラウザでは IndexedDB が利用できません（プライベートモードや容量制限の可能性があります）。データはメモリ上のみ保持され、リロードで失われます。',
                    );
                }

                const projectList = await listProjects();
                if (projectList.length === 0) {
                    return;
                }

                const projects = await Promise.all(
                    projectList.map(p => getProject(p.id).catch(() => null)),
                );
                const allProjectsData: Record<string, any> = {};
                for (const p of projects) {
                    if (p) allProjectsData[p.id] = p;
                }
                useStore.setState({
                    allProjectsData,
                    activeProjectId: useStore.getState().activeProjectId || projectList[0].id,
                });
            } catch (e: any) {
                console.error('Local persistence init failed:', e);
                const message = e?.message ?? String(e);
                setError(message);
                useStore.getState().showToast(message, 'error');
            } finally {
                setIsInitializing(false);
            }
        };
        init();
    }, []);

    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            const status = useStore.getState().saveStatus;
            if (status === 'dirty' || status === 'saving') {
                flushSave();
                e.preventDefault();
            }
        };
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'hidden') {
                flushSave();
            }
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnload);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [flushSave]);

    return { isInitializing, error };
};

// Side-effect helper retained for any future migration UX.
export const persistProjectsBatch = async (projects: any[]): Promise<number> => {
    let saved = 0;
    for (const p of projects) {
        try {
            await putProject(p);
            saved++;
        } catch (e) {
            console.error(`Failed to persist project "${p?.name || p?.id}":`, e);
        }
    }
    return saved;
};
