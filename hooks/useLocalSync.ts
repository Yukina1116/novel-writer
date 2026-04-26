import { useEffect, useState } from 'react';
import { useStore } from '../store/index';
import { Project } from '../types';
import { getProject, listProjects } from '../db/projectRepository';

const LOCAL_DB_INIT_FAILED_MESSAGE =
    'ローカルデータの読み込みに失敗しました。プライベートモードや容量不足で IndexedDB が利用できない場合、データはメモリ上のみ保持され、リロードで失われます。';

export const useLocalSync = () => {
    const [isInitializing, setIsInitializing] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const init = async () => {
            try {
                const projectList = await listProjects();
                if (projectList.length === 0) {
                    if (useStore.getState().activeProjectId) {
                        useStore.setState({ activeProjectId: null });
                    }
                    return;
                }

                const projects = await Promise.all(
                    projectList.map(p =>
                        getProject(p.id).catch((err: unknown) => {
                            console.error(`Failed to load project ${p.id}:`, err);
                            return null;
                        }),
                    ),
                );
                const allProjectsData: Record<string, Project> = {};
                for (const p of projects) {
                    if (p) allProjectsData[p.id] = p;
                }

                // Preserve projectList ordering (lastModified DESC) but filter to
                // entries that loaded successfully — this is the only safe pool
                // for activeProjectId (allProjectsData keyspace).
                const healthyProjects = projectList.filter(p => allProjectsData[p.id]);
                const corruptedCount = projectList.length - healthyProjects.length;

                // Reuse pre-existing activeProjectId only if its record loaded
                // successfully (dangling-id guard for stale cross-session state).
                const existingId = useStore.getState().activeProjectId;
                const validExistingId =
                    existingId && allProjectsData[existingId] ? existingId : null;
                const fallbackId = healthyProjects[0]?.id ?? null;

                useStore.setState({
                    allProjectsData,
                    activeProjectId: validExistingId ?? fallbackId,
                });

                if (corruptedCount > 0) {
                    useStore.getState().showToast(
                        `プロジェクト ${corruptedCount} 件の読み込みに失敗しました（破損データを除外しました）`,
                        'error',
                    );
                }
            } catch (e: unknown) {
                console.error('Local persistence init failed:', e);
                const detail = e instanceof Error ? e.message : String(e);
                const message = `${LOCAL_DB_INIT_FAILED_MESSAGE}（詳細: ${detail}）`;
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
