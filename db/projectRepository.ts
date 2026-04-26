import { Project } from '../types';
import { validateAndSanitizeProjectData } from '../utils';
import { db, ProjectListEntry } from './dexie';

// historyTree is intentionally excluded (memory-only, max 10 nodes per ADR-0001).
// Other unknown fields (e.g. `_order` from legacy Firestore docs) are dropped
// by this whitelist to satisfy AC A6.
const PERSISTABLE_KEYS = [
    'id',
    'name',
    'lastModified',
    'isSimpleMode',
    'settings',
    'novelContent',
    'chatHistory',
    'knowledgeBase',
    'knowledgeCategoryOrder',
    'plotBoard',
    'plotTypeColors',
    'plotRelations',
    'plotNodePositions',
    'timeline',
    'timelineLanes',
    'characterRelations',
    'nodePositions',
    'userProfile',
    'aiSettings',
    'displaySettings',
] as const satisfies readonly (keyof Project)[];

const pickPersistableFields = (project: Project): Project => {
    const out: Record<string, unknown> = {};
    for (const key of PERSISTABLE_KEYS) {
        const value = project[key];
        if (value !== undefined) out[key] = value;
    }
    return out as unknown as Project;
};

// Drop legacy Firestore subcollection internals such as `_order` recursively.
// AC A6 requires Import payloads to be sanitized; the top-level whitelist
// alone misses fields nested inside settings / knowledgeBase / novelContent etc.
const stripInternalKeys = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(stripInternalKeys);
    if (value && typeof value === 'object') {
        const out: Record<string, unknown> = {};
        for (const k of Object.keys(value)) {
            if (k.startsWith('_')) continue;
            out[k] = stripInternalKeys((value as Record<string, unknown>)[k]);
        }
        return out;
    }
    return value;
};

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

export const putProject = async (project: Project): Promise<void> => {
    const sanitized = validateAndSanitizeProjectData(project);
    const persistable = pickPersistableFields(sanitized);
    await db.projects.put(stripInternalKeys(persistable) as Project);
};

export const deleteProject = async (id: string): Promise<void> => {
    await db.projects.delete(id);
};
