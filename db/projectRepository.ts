import { Project } from '../types';
import { validateAndSanitizeProjectData } from '../utils';
import { db, ProjectListEntry } from './dexie';

export const listProjects = async (): Promise<ProjectListEntry[]> => {
    const projects = await db.projects.orderBy('lastModified').reverse().toArray();
    return projects.map(p => ({
        id: p.id,
        name: p.name,
        lastModified: p.lastModified,
        isSimpleMode: p.isSimpleMode,
    }));
};

export const getProject = async (id: string): Promise<Project | null> => {
    const project = await db.projects.get(id);
    return project ?? null;
};

// historyTree is intentionally not persisted (memory-only, max 10 nodes per ADR-0001).
export const putProject = async (project: Project): Promise<void> => {
    const { historyTree: _omitted, ...rest } = validateAndSanitizeProjectData(project);
    await db.projects.put(rest as Project);
};

export const deleteProject = async (id: string): Promise<void> => {
    await db.projects.delete(id);
};
