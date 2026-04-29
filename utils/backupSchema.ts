import { v4 as uuidv4 } from 'uuid';
import {
    AnalysisResult,
    BACKUP_SCHEMA_VERSION,
    BackupV1,
    EncryptedBackupV1,
    Project,
} from '../types';
import { ProjectValidationError, validateAndSanitizeProjectData } from '../utils';
import { BackupPreflightError, BackupValidationError } from './backupErrors';
// Single source of truth: backupCrypto exports the canonical encrypted-envelope
// constants. Importing here avoids drift if OWASP recommendations change.
// (No circular: backupCrypto imports BackupValidationError from backupErrors,
// not from this file.)
import {
    IV_BYTES,
    MAX_ACCEPTED_ITERATIONS,
    MAX_CIPHERTEXT_BYTES,
    MIN_ACCEPTED_ITERATIONS,
    SALT_BYTES,
} from './backupCrypto';

// Re-export for callers who import the error types from backupSchema (back-compat).
export { BackupPreflightError, BackupValidationError };

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

// --- Encrypted envelope (M6) ---
//
// AC-8: discriminate encrypted envelopes from plaintext BackupV1 with an AND
// of all required fields. Half-broken envelopes (encrypted:true but missing
// other fields) are rejected explicitly by parseEncryptedEnvelope rather than
// silently falling through to the plaintext path.

export const isEncryptedBackup = (
    json: Record<string, unknown>,
): json is EncryptedBackupV1 & Record<string, unknown> =>
    json.encrypted === true
    && typeof json.algorithm === 'string'
    && typeof json.kdf === 'string'
    && typeof json.iv === 'string'
    && typeof json.ciphertext === 'string'
    && typeof json.kdfParams === 'object'
    && json.kdfParams !== null
    && typeof (json.kdfParams as Record<string, unknown>).salt === 'string';

// Strict base64 byte-length check that mirrors atob's accept set.
// Length must be a multiple of 4 and `=` may only appear as 0/1/2 trailing
// padding. Avoids materializing huge buffers just for size validation, and
// keeps decryptBackup from receiving "passes parser, fails atob" inputs.
const decodedByteLength = (b64: string): number => {
    if (b64.length === 0 || b64.length % 4 !== 0) return -1;
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) return -1;
    const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
    return (b64.length / 4) * 3 - padding;
};

export const parseEncryptedEnvelope = (
    json: Record<string, unknown>,
): EncryptedBackupV1 => {
    if (!isEncryptedBackup(json)) {
        throw new BackupValidationError(
            '暗号化バックアップの形式が壊れています（必須フィールドが不足しています）。',
            { cause: { kind: 'envelope-incomplete' } },
        );
    }
    if (json.envelopeVersion !== 1) {
        throw new BackupValidationError(
            `対応していない暗号化バックアップ形式です（envelopeVersion=${String(json.envelopeVersion)}）。`,
        );
    }
    if (json.algorithm !== 'AES-GCM-256') {
        throw new BackupValidationError(
            `対応していない暗号化アルゴリズムです: ${String(json.algorithm)}`,
        );
    }
    if (json.kdf !== 'PBKDF2-SHA256') {
        throw new BackupValidationError(
            `対応していない鍵派生関数です: ${String(json.kdf)}`,
        );
    }
    const kdfParams = json.kdfParams as { salt: string; iterations: unknown };
    if (
        typeof kdfParams.iterations !== 'number'
        || !Number.isFinite(kdfParams.iterations)
    ) {
        throw new BackupValidationError('iterations が数値ではありません。');
    }
    if (
        kdfParams.iterations < MIN_ACCEPTED_ITERATIONS
        || kdfParams.iterations > MAX_ACCEPTED_ITERATIONS
    ) {
        throw new BackupValidationError(
            `iterations が許容範囲外です（${MIN_ACCEPTED_ITERATIONS}〜${MAX_ACCEPTED_ITERATIONS}）。`,
        );
    }
    const saltLen = decodedByteLength(kdfParams.salt);
    if (saltLen !== SALT_BYTES) {
        throw new BackupValidationError(
            `salt の長さが不正です（${SALT_BYTES} bytes 期待）。`,
        );
    }
    const ivLen = decodedByteLength(json.iv);
    if (ivLen !== IV_BYTES) {
        throw new BackupValidationError(
            `iv の長さが不正です（${IV_BYTES} bytes 期待）。`,
        );
    }
    const ciphertextLen = decodedByteLength(json.ciphertext);
    if (ciphertextLen <= 0 || ciphertextLen > MAX_CIPHERTEXT_BYTES) {
        throw new BackupValidationError(
            `ciphertext の長さが不正です（最大 ${MAX_CIPHERTEXT_BYTES} bytes）。`,
        );
    }
    // appVersion / encryptedAt are AAD-bound (see buildAad) so silently
    // defaulting them would let parser-synthesized values reach the decrypt
    // step. Reject at parse time instead.
    if (typeof json.appVersion !== 'string') {
        throw new BackupValidationError('appVersion が文字列ではありません。');
    }
    if (typeof json.encryptedAt !== 'string') {
        throw new BackupValidationError('encryptedAt が文字列ではありません。');
    }

    return {
        envelopeVersion: 1,
        encrypted: true,
        algorithm: 'AES-GCM-256',
        kdf: 'PBKDF2-SHA256',
        kdfParams: { salt: kdfParams.salt, iterations: kdfParams.iterations },
        iv: json.iv,
        ciphertext: json.ciphertext,
        appVersion: json.appVersion,
        encryptedAt: json.encryptedAt,
    };
};

// AC-8: parseAnyBackup is the new top-level entrypoint for encrypted-aware
// callers. parseBackup keeps its narrow BackupV1 return type unchanged so
// existing callers don't need union narrowing they don't care about.
export const parseAnyBackup = (raw: string): BackupV1 | EncryptedBackupV1 => {
    if (raw.length === 0 || raw.trim() === '') {
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
    if (json.encrypted === true) {
        // Half-broken envelopes (e.g., {encrypted:true} only) are rejected
        // explicitly here — we never silently fall through to plaintext path.
        return parseEncryptedEnvelope(json);
    }
    return parseBackup(raw);
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
