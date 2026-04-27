import { useStore } from '../store/index';
import { Project } from '../types';
import { getProject, listProjects } from '../db/projectRepository';
import { ProjectValidationError } from '../utils';

export interface RefreshFromIndexedDbResult {
    failureCount: number;
    healthyCount: number;
}

// Reload projects from IndexedDB and reseat allProjectsData. Used at startup
// (useLocalSync) and after a successful import (backupSlice.executeImport)
// so memory and disk stay in sync — otherwise the next markDirty/flushSave
// would resurrect pre-import state and silently overwrite imported rows.
//
// Lives in its own module rather than alongside useLocalSync to avoid a
// hooks → store → hooks import cycle that would otherwise break the slice
// composition order at module evaluation time.
export const refreshFromIndexedDb = async (
    options: { keepActive?: boolean } = {},
): Promise<RefreshFromIndexedDbResult> => {
    const projectList = await listProjects();
    if (projectList.length === 0) {
        useStore.setState({ allProjectsData: {}, activeProjectId: null });
        return { failureCount: 0, healthyCount: 0 };
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

    const healthyProjects = projectList.filter(p => allProjectsData[p.id]);
    const existingId = useStore.getState().activeProjectId;
    const validExistingId =
        existingId && allProjectsData[existingId] ? existingId : null;
    const fallbackId = options.keepActive
        ? validExistingId
        : (validExistingId ?? healthyProjects[0]?.id ?? null);

    useStore.setState({
        allProjectsData,
        activeProjectId: fallbackId,
    });

    return {
        failureCount: validationFailures + infrastructureFailures,
        healthyCount: healthyProjects.length,
    };
};
