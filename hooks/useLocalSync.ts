import { useEffect, useState } from 'react';
import { useStore } from '../store/index';
import { Project } from '../types';
import { getProject, listProjects } from '../db/projectRepository';

const INDEXED_DB_UNAVAILABLE_MESSAGE =
    'このブラウザでは IndexedDB が利用できません（プライベートモードや容量制限の可能性があります）。データはメモリ上のみ保持され、リロードで失われます。';

export const useLocalSync = () => {
    const [isInitializing, setIsInitializing] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const init = async () => {
            try {
                const projectList = await listProjects();
                if (projectList.length === 0) return;

                const projects = await Promise.all(
                    projectList.map(p => getProject(p.id).catch(() => null)),
                );
                const allProjectsData: Record<string, Project> = {};
                for (const p of projects) {
                    if (p) allProjectsData[p.id] = p;
                }
                useStore.setState({
                    allProjectsData,
                    activeProjectId: useStore.getState().activeProjectId || projectList[0].id,
                });
            } catch (e: unknown) {
                console.error('Local persistence init failed:', e);
                const detail = e instanceof Error ? e.message : String(e);
                const message = `${INDEXED_DB_UNAVAILABLE_MESSAGE}（${detail}）`;
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
            const { saveStatus, flushSave } = useStore.getState();
            if (saveStatus === 'dirty' || saveStatus === 'saving') {
                flushSave();
                e.preventDefault();
            }
        };
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'hidden') {
                useStore.getState().flushSave();
            }
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnload);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, []);

    return { isInitializing, error };
};
