import { useEffect, useState } from 'react';
import { useStore } from '../store/index';
import { listProjects, getProject, createProjectApi } from '../projectApi';

export const useFirestoreSync = () => {
    const [isInitializing, setIsInitializing] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const flushSave = useStore(state => state.flushSave);

    useEffect(() => {
        const init = async () => {
            try {
                // Step 1: Migrate localStorage data if it exists
                const stored = localStorage.getItem('NOVEL_WRITER_storage');
                if (stored) {
                    try {
                        const parsed = JSON.parse(stored);
                        const state = parsed?.state;
                        if (state?.allProjectsData) {
                            const projects = Object.values(state.allProjectsData) as any[];
                            let migrated = 0;
                            for (const p of projects) {
                                try {
                                    await createProjectApi(p);
                                    migrated++;
                                } catch (e) {
                                    console.error(`Failed to migrate project "${p.name || p.id}":`, e);
                                }
                            }
                            console.log(`Migrated ${migrated}/${projects.length} projects to Firestore`);
                        }
                    } catch (e) {
                        console.error('localStorage parse failed:', e);
                    }
                    // Always remove localStorage regardless of migration result
                    localStorage.removeItem('NOVEL_WRITER_storage');
                }

                // Step 2: Load project list from Firestore
                const projectList = await listProjects();
                if (projectList.length > 0) {
                    const projects = await Promise.all(
                        projectList.map(p => getProject(p.id).catch(() => null))
                    );
                    const allProjectsData: Record<string, any> = {};
                    for (const p of projects) {
                        if (p) allProjectsData[p.id] = p;
                    }
                    useStore.setState({
                        allProjectsData,
                        activeProjectId: useStore.getState().activeProjectId || projectList[0].id,
                    });
                }
            } catch (e: any) {
                console.error('Firestore init failed:', e);
                setError(e.message);
            } finally {
                setIsInitializing(false);
            }
        };
        init();
    }, []);

    // Flush on beforeunload and visibilitychange
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
