import { useEffect, useState } from 'react';
import { useStore } from '../store/index';
import { listProjects, getProject, createProjectApi } from '../projectApi';

export const useFirestoreSync = () => {
    const [isInitializing, setIsInitializing] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const activeProjectId = useStore(state => state.activeProjectId);
    const flushSave = useStore(state => state.flushSave);

    // Initial load: migrate localStorage then fetch from Firestore
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
                            await Promise.all(projects.map(p => createProjectApi(p)));
                            localStorage.removeItem('NOVEL_WRITER_storage');
                            console.log(`Migrated ${projects.length} projects to Firestore`);
                        }
                    } catch (e) {
                        console.error('localStorage migration failed:', e);
                    }
                }

                // Step 2: Load project list from Firestore
                const projectList = await listProjects();
                if (projectList.length > 0) {
                    // Fetch all projects
                    const projects = await Promise.all(
                        projectList.map(p => getProject(p.id))
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
