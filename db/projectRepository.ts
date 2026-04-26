import { Project } from '../types';
import { validateAndSanitizeProjectData } from '../utils';
import { getDb, ProjectListEntry } from './dexie';

export const listProjects = async (): Promise<ProjectListEntry[]> => {
    const projects = await getDb().projects.orderBy('lastModified').reverse().toArray();
    return projects.map(p => ({
        id: p.id,
        name: p.name,
        lastModified: p.lastModified,
        isSimpleMode: p.isSimpleMode,
    }));
};

export const getProject = async (id: string): Promise<Project | null> => {
    const project = await getDb().projects.get(id);
    return project ?? null;
};

export const putProject = async (project: Project): Promise<void> => {
    const sanitized = validateAndSanitizeProjectData({ ...project, historyTree: undefined });
    const { historyTree: _historyTree, ...persistable } = sanitized as Project & { historyTree?: unknown };
    void _historyTree;
    await getDb().projects.put(persistable as Project);
};

export const deleteProject = async (id: string): Promise<void> => {
    await getDb().projects.delete(id);
};
