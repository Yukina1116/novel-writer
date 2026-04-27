import { v4 as uuidv4 } from 'uuid';
import {
    AnalysisResult,
    BACKUP_SCHEMA_VERSION,
    BackupV1,
    Project,
} from '../types';
import { ProjectValidationError, validateAndSanitizeProjectData } from '../utils';

export class BackupValidationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'BackupValidationError';
    }
}

const isObject = (v: unknown): v is Record<string, unknown> =>
    !!v && typeof v === 'object' && !Array.isArray(v);

const TUTORIAL_FLAG_KEYS = [
    'hasCompletedGlobalTutorial',
    'hasCompletedGlobalKnowledgeTutorial',
    'hasCompletedGlobalChartTutorial',
    'hasCompletedGlobalPlotBoardTutorial',
    'hasCompletedGlobalTimelineTutorial',
] as const;

// Pick only the known boolean flags from raw JSON. Anything else is dropped so
// hostile JSON (e.g. `{ hasCompletedGlobalTutorial: "yes" }`) cannot poison
// IndexedDB or break boolean equality checks downstream.
const validateTutorialFlags = (v: unknown): BackupV1['tutorialState'] => {
    if (!isObject(v)) return {};
    const out: Record<string, boolean> = {};
    for (const k of TUTORIAL_FLAG_KEYS) {
        if (typeof v[k] === 'boolean') out[k] = v[k] as boolean;
    }
    return out as BackupV1['tutorialState'];
};

// Shape check against the AnalysisResult contract: characters/worldContext/
// worldTerms/dialogues/notes are all required. Hostile JSON missing any of
// these is dropped silently.
const isAnalysisResult = (v: unknown): v is AnalysisResult =>
    isObject(v)
    && isObject(v.characters)
    && isObject(v.worldContext)
    && isObject(v.worldTerms)
    && Array.isArray(v.dialogues)
    && Array.isArray(v.notes);

const validateAnalysisHistory = (v: unknown): AnalysisResult[] => {
    if (!Array.isArray(v)) return [];
    return v.filter(isAnalysisResult);
};

// historyTree is memory-only by ADR-0001 (cap=10, reset on reload). Strip it
// from the export so backups stay small and don't carry stale undo state.
const stripHistoryTree = (project: Project): Project => {
    const { historyTree: _omitted, ...rest } = project;
    return rest as Project;
};

export interface BuildBackupInput {
    projects: Project[];
    tutorialState: BackupV1['tutorialState'];
    analysisHistory: AnalysisResult[];
    appVersion: string;
    now?: Date;
}

export const buildBackupV1 = (input: BuildBackupInput): BackupV1 => ({
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: (input.now ?? new Date()).toISOString(),
    appVersion: input.appVersion,
    projects: input.projects.map(stripHistoryTree),
    tutorialState: { ...input.tutorialState },
    analysisHistory: [...input.analysisHistory],
});

export const serializeBackup = (backup: BackupV1): string =>
    JSON.stringify(backup, null, 2);

export const buildBackupFilename = (now: Date = new Date()): string => {
    const iso = now.toISOString().replace(/[:.]/g, '-');
    return `novel-writer-backup_${iso}.json`;
};

interface ParseOptions {
    rawSize: number;
}

// Legacy single-project export (handleExportProject in App.tsx) writes a bare
// Project JSON without `schemaVersion`. Detect that shape and wrap it into a
// BackupV1 so users can re-import their pre-M4 backups.
const looksLikeLegacyProject = (json: Record<string, unknown>): boolean =>
    typeof json.schemaVersion === 'undefined'
    && typeof json.id === 'string'
    && typeof json.name === 'string';

const looksLikeLegacyEnvelope = (json: Record<string, unknown>): boolean =>
    typeof json.schemaVersion === 'undefined'
    && isObject(json.project)
    && typeof (json.project as Record<string, unknown>).id === 'string';

const wrapLegacyProject = (rawProject: unknown): BackupV1 => {
    const project = validateAndSanitizeProjectData(rawProject);
    return {
        schemaVersion: BACKUP_SCHEMA_VERSION,
        exportedAt: project.lastModified ?? new Date().toISOString(),
        appVersion: 'legacy',
        projects: [project],
        tutorialState: {},
        analysisHistory: [],
    };
};

export const parseBackup = (raw: string, opts: ParseOptions = { rawSize: raw.length }): BackupV1 => {
    if (opts.rawSize === 0 || raw.trim() === '') {
        throw new BackupValidationError('ファイルが空です。');
    }
    let json: unknown;
    try {
        json = JSON.parse(raw);
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        throw new BackupValidationError(`バックアップファイルが壊れています: ${msg}`);
    }
    if (!isObject(json)) {
        throw new BackupValidationError('バックアップファイルが有効なオブジェクトではありません。');
    }

    if (looksLikeLegacyProject(json)) {
        try {
            return wrapLegacyProject(json);
        } catch (e) {
            const msg = e instanceof ProjectValidationError ? e.message : String(e);
            throw new BackupValidationError(`旧形式のプロジェクトファイルを読み込めませんでした: ${msg}`);
        }
    }
    if (looksLikeLegacyEnvelope(json)) {
        try {
            return wrapLegacyProject((json as { project: unknown }).project);
        } catch (e) {
            const msg = e instanceof ProjectValidationError ? e.message : String(e);
            throw new BackupValidationError(`旧形式のプロジェクトファイルを読み込めませんでした: ${msg}`);
        }
    }

    const { schemaVersion } = json;
    if (schemaVersion !== BACKUP_SCHEMA_VERSION) {
        throw new BackupValidationError(
            `対応していないバックアップ形式です（v${String(schemaVersion)}、本アプリは v${BACKUP_SCHEMA_VERSION} のみ対応）。`,
        );
    }

    const projectsRaw = json.projects;
    if (!Array.isArray(projectsRaw)) {
        throw new BackupValidationError('projects 配列がありません。');
    }
    const projects: Project[] = projectsRaw.map((p, i) => {
        try {
            return validateAndSanitizeProjectData(p);
        } catch (e) {
            const msg = e instanceof ProjectValidationError ? e.message : String(e);
            throw new BackupValidationError(`${i + 1}件目のプロジェクトに問題があります: ${msg}`);
        }
    });

    const tutorialState = validateTutorialFlags(json.tutorialState);
    const analysisHistory = validateAnalysisHistory(json.analysisHistory);

    const exportedAt = typeof json.exportedAt === 'string' ? json.exportedAt : new Date().toISOString();
    const appVersion = typeof json.appVersion === 'string' ? json.appVersion : 'unknown';

    return {
        schemaVersion: BACKUP_SCHEMA_VERSION,
        exportedAt,
        appVersion,
        projects,
        tutorialState,
        analysisHistory,
    };
};

export interface ResolvedImportProjects {
    toUpsert: Project[];
    toCreate: Project[];
}

// Apply per-project conflict resolutions. `existingIds` is the set of IDs
// currently in IndexedDB at executeImport time (re-read to avoid TOCTOU).
//
// Caller contract: every conflicting id MUST appear in `resolutions`. Missing
// entries throw rather than defaulting silently — a hidden default would split
// "user picked skip" from "we forgot to seed it" and mask future detection
// bugs (the seed is owned by detectConflicts; the modal then mutates each).
export const resolveImportProjects = (
    incoming: Project[],
    existingIds: Set<string>,
    resolutions: Map<string, 'overwrite' | 'duplicate' | 'skip'>,
): ResolvedImportProjects => {
    const toUpsert: Project[] = [];
    const toCreate: Project[] = [];
    for (const p of incoming) {
        const isConflict = existingIds.has(p.id);
        if (!isConflict) {
            toUpsert.push(p);
            continue;
        }
        const decision = resolutions.get(p.id);
        if (decision === undefined) {
            throw new BackupValidationError(
                `内部エラー: プロジェクト ${p.id} の衝突解決方針が指定されていません。`,
            );
        }
        if (decision === 'overwrite') {
            toUpsert.push(p);
        } else if (decision === 'duplicate') {
            const newId = uuidv4();
            toCreate.push({ ...p, id: newId, name: `${p.name} (インポート)` });
        }
        // skip: do nothing
    }
    return { toUpsert, toCreate };
};
