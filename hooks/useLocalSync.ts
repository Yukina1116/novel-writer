import { useEffect, useState } from 'react';
import { useStore } from '../store/index';
import { Project } from '../types';
import { getProject, listProjects } from '../db/projectRepository';
import { ProjectValidationError } from '../utils';

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
                    useStore.setState({ activeProjectId: null });
                    return;
                }

                let validationFailures = 0;
                let infrastructureFailures = 0;
                const projects = await Promise.all(
                    projectList.map(p =>
                        getProject(p.id).catch((err: unknown) => {
                            console.error(`Failed to load project ${p.id}:`, err);
                            if (err instanceof ProjectValidationError) {
                                validationFailures++;
                            } else {
                                infrastructureFailures++;
                            }
                            return null;
                        }),
                    ),
                );
                const allProjectsData: Record<string, Project> = {};
                for (const p of projects) {
                    if (p) allProjectsData[p.id] = p;
                }

                // Filter while preserving listProjects' lastModified-DESC order
                // so the fallback below picks the most recent healthy project.
                const healthyProjects = projectList.filter(p => allProjectsData[p.id]);

                // Dangling-id guard: a persisted activeProjectId may point at a
                // project that is now missing or corrupted across sessions.
                const existingId = useStore.getState().activeProjectId;
                const validExistingId =
                    existingId && allProjectsData[existingId] ? existingId : null;
                const fallbackId = healthyProjects[0]?.id ?? null;

                useStore.setState({
                    allProjectsData,
                    activeProjectId: validExistingId ?? fallbackId,
                });

                const failureCount = validationFailures + infrastructureFailures;
                if (failureCount > 0) {
                    const detail = infrastructureFailures > 0
                        ? '一時的なエラーの可能性があります。リロードで復旧する場合があります'
                        : '破損データを除外しました';
                    useStore.getState().showToast(
                        `プロジェクト ${failureCount} 件の読み込みに失敗しました（${detail}）`,
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
