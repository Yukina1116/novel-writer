import { Project } from '../types';
import { validateAndSanitizeProjectData } from '../utils';
import { getDb, ProjectListEntry } from './dexie';

// historyTree omitted: memory-only by ADR-0001; persisting would defeat the cap
// and bloat IndexedDB. Whitelist (not blocklist) so future legacy keys from
// imported JSON cannot leak into IndexedDB.
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

// Compile-time tripwire: errors out if a required Project field is added without
// being whitelisted above (or explicitly excluded). Adjust the exclusion union
// when intentionally omitting a field.
type RequiredProjectKeys = {
    [K in keyof Project]-?: undefined extends Project[K] ? never : K;
}[keyof Project];
type _MissingFromWhitelist = Exclude<
    RequiredProjectKeys,
    typeof PERSISTABLE_KEYS[number] | 'historyTree'
>;
const _coverageCheck: [_MissingFromWhitelist] extends [never] ? true : never = true;
void _coverageCheck;

const pickPersistableFields = (project: Project): Project => {
    const out: Record<string, unknown> = {};
    for (const key of PERSISTABLE_KEYS) {
        const value = project[key];
        if (value !== undefined) out[key] = value;
    }
    return out as unknown as Project;
};

// Recursive pass: pickPersistableFields whitelists only the top level, but
// legacy fields like _order can be nested under settings/knowledgeBase/
// novelContent. AC A6.
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
    const projects = await getDb().projects.orderBy('lastModified').reverse().toArray();
    return projects.map(p => ({
        id: p.id,
        name: p.name,
        lastModified: p.lastModified,
        isSimpleMode: p.isSimpleMode,
    }));
};

/**
 * Returns the project for `id`, or null if no record exists.
 * @throws {ProjectValidationError} if the record is found but missing
 *   required fields. Dexie does not enforce schema on read, so callers
 *   must treat this as a corrupted-record signal.
 */
export const getProject = async (id: string): Promise<Project | null> => {
    const project = await getDb().projects.get(id);
    if (!project) return null;
    return validateAndSanitizeProjectData(project);
};

export const putProject = async (project: Project): Promise<void> => {
    const sanitized = validateAndSanitizeProjectData(project);
    const persistable = pickPersistableFields(sanitized);
    await getDb().projects.put(stripInternalKeys(persistable) as Project);
};

export const deleteProject = async (id: string): Promise<void> => {
    await getDb().projects.delete(id);
};
