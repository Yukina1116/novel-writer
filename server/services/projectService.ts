import { projectsCollection } from '../firestoreClient';
import { Project } from '../../types';

function stripUndefined(obj: any): any {
    if (obj === null || obj === undefined) return null;
    if (Array.isArray(obj)) return obj.map(stripUndefined);
    if (typeof obj === 'object') {
        const result: any = {};
        for (const [key, value] of Object.entries(obj)) {
            if (value !== undefined) {
                result[key] = stripUndefined(value);
            }
        }
        return result;
    }
    return obj;
}

function stripHistoryTree(project: any): any {
    const { historyTree, ...rest } = project;
    return rest;
}

export const listProjects = async (): Promise<Array<{ id: string; name: string; lastModified: string; isSimpleMode?: boolean }>> => {
    const snapshot = await projectsCollection()
        .select('id', 'name', 'lastModified', 'isSimpleMode')
        .get();
    return snapshot.docs.map(doc => doc.data() as any);
};

export const getProject = async (id: string): Promise<Project | null> => {
    const doc = await projectsCollection().doc(id).get();
    if (!doc.exists) return null;
    return doc.data() as Project;
};

export const createProject = async (project: Project): Promise<void> => {
    const data = stripUndefined(stripHistoryTree(project));
    await projectsCollection().doc(project.id).set(data);
};

export const updateProject = async (id: string, project: Project): Promise<void> => {
    const data = stripUndefined(stripHistoryTree(project));
    await projectsCollection().doc(id).set(data);
};

export const deleteProject = async (id: string): Promise<void> => {
    await projectsCollection().doc(id).delete();
};
