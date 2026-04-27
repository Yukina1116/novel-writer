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

    const tutorialState = isObject(json.tutorialState) ? (json.tutorialState as BackupV1['tutorialState']) : {};
    const analysisHistory = Array.isArray(json.analysisHistory) ? (json.analysisHistory as AnalysisResult[]) : [];

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
        const decision = resolutions.get(p.id) ?? 'skip';
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
