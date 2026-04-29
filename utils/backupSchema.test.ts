import { describe, it, expect } from 'vitest';
import {
    BackupValidationError,
    buildBackupV1,
    parseBackup,
    resolveImportProjects,
    serializeBackup,
} from './backupSchema';
import { Project } from '../types';
import { defaultAiSettings, defaultDisplaySettings } from '../constants';

const makeProject = (overrides: Partial<Project> = {}): Project => ({
    id: overrides.id ?? 'p-1',
    name: overrides.name ?? 'テスト物語',
    lastModified: overrides.lastModified ?? '2026-04-28T00:00:00.000Z',
    isSimpleMode: false,
    settings: [],
    novelContent: [],
    chatHistory: [],
    knowledgeBase: [],
    plotBoard: [],
    plotTypeColors: {},
    plotRelations: [],
    plotNodePositions: [],
    timeline: [],
    timelineLanes: [],
    characterRelations: [],
    nodePositions: [],
    aiSettings: defaultAiSettings,
    displaySettings: defaultDisplaySettings,
    ...overrides,
});

describe('buildBackupV1 / serializeBackup (AC-1, AC-2)', () => {
    it('AC-1: produces v1 envelope with projects/tutorialState/analysisHistory', () => {
        const projects = [makeProject({ id: 'p-1' }), makeProject({ id: 'p-2' })];
        const backup = buildBackupV1({
            projects,
            tutorialState: { hasCompletedGlobalTutorial: true },
            analysisHistory: [{ id: 'a-1', createdAt: '2026-04-01', input: '...', output: '...' } as any],
            appVersion: '0.0.0',
            now: new Date('2026-04-28T01:23:45.000Z'),
        });
        expect(backup.schemaVersion).toBe(1);
        expect(backup.exportedAt).toBe('2026-04-28T01:23:45.000Z');
        expect(backup.appVersion).toBe('0.0.0');
        expect(backup.projects).toHaveLength(2);
        expect(backup.tutorialState.hasCompletedGlobalTutorial).toBe(true);
        expect(backup.analysisHistory).toHaveLength(1);

        const json = JSON.parse(serializeBackup(backup));
        expect(json.schemaVersion).toBe(1);
        expect(Array.isArray(json.projects)).toBe(true);
    });

    it('AC-2: historyTree is stripped from exported projects', () => {
        const projWithHistory = makeProject({
            id: 'p-1',
            historyTree: {
                nodes: { root: { id: 'root', parentId: null, childrenIds: [], timestamp: 0, type: 'settings', label: 'root', payload: {} as any } },
                currentNodeId: 'root',
                rootId: 'root',
            },
        });
        const backup = buildBackupV1({
            projects: [projWithHistory],
            tutorialState: {},
            analysisHistory: [],
            appVersion: '0.0.0',
        });
        expect(backup.projects[0]).not.toHaveProperty('historyTree');
    });
});

describe('parseBackup (AC-4, AC-5, AC-9, AC-10)', () => {
    const validBackup = (over: Record<string, unknown> = {}) =>
        JSON.stringify({
            schemaVersion: 1,
            exportedAt: '2026-04-28T00:00:00.000Z',
            appVersion: '0.0.0',
            projects: [makeProject({ id: 'p-1' })],
            tutorialState: {},
            analysisHistory: [],
            ...over,
        });

    it('AC-4: rejects unsupported schema version', () => {
        const bad = JSON.stringify({ schemaVersion: 999, projects: [] });
        expect(() => parseBackup(bad, { rawSize: bad.length })).toThrow(BackupValidationError);
        expect(() => parseBackup(bad, { rawSize: bad.length })).toThrow(/v999/);
    });

    it('AC-5: surfaces problematic project index in error message', () => {
        const projects = [
            makeProject({ id: 'p-1' }),
            makeProject({ id: 'p-2' }),
            { id: 'p-3' /* missing name -> validateAndSanitizeProjectData throws */ },
        ];
        const bad = JSON.stringify({
            schemaVersion: 1,
            exportedAt: '2026-04-28T00:00:00.000Z',
            appVersion: '0.0.0',
            projects,
            tutorialState: {},
            analysisHistory: [],
        });
        expect(() => parseBackup(bad, { rawSize: bad.length })).toThrow(/3件目/);
    });

    it('AC-9: rejects malformed JSON with descriptive message', () => {
        const bad = '{"schemaVersion": 1, "projects": [';
        expect(() => parseBackup(bad, { rawSize: bad.length })).toThrow(/壊れています/);
    });

    it('AC-10: rejects empty file', () => {
        expect(() => parseBackup('', { rawSize: 0 })).toThrow(/空です/);
        expect(() => parseBackup('   ', { rawSize: 3 })).toThrow(/空です/);
    });

    it('parses a valid backup round-trip', () => {
        const raw = validBackup();
        const result = parseBackup(raw, { rawSize: raw.length });
        expect(result.schemaVersion).toBe(1);
        expect(result.projects).toHaveLength(1);
        expect(result.projects[0].id).toBe('p-1');
    });

    it('B1: legacy bare-project JSON (no schemaVersion) is wrapped into BackupV1', () => {
        const legacy = JSON.stringify(makeProject({ id: 'legacy-p', name: '旧プロジェクト' }));
        const result = parseBackup(legacy, { rawSize: legacy.length });
        expect(result.schemaVersion).toBe(1);
        expect(result.appVersion).toBe('legacy');
        expect(result.projects).toHaveLength(1);
        expect(result.projects[0].id).toBe('legacy-p');
        expect(result.projects[0].name).toBe('旧プロジェクト');
    });

    it('B1: legacy { project: {...} } envelope is unwrapped and accepted', () => {
        const legacy = JSON.stringify({ project: makeProject({ id: 'env-p' }) });
        const result = parseBackup(legacy, { rawSize: legacy.length });
        expect(result.projects).toHaveLength(1);
        expect(result.projects[0].id).toBe('env-p');
    });

    it('H1: tutorialState non-boolean values are dropped (string "yes" → omitted)', () => {
        const raw = JSON.stringify({
            schemaVersion: 1,
            exportedAt: '2026-04-28T00:00:00.000Z',
            appVersion: '0.0.0',
            projects: [],
            tutorialState: {
                hasCompletedGlobalTutorial: 'yes',
                hasCompletedGlobalKnowledgeTutorial: true,
                evil_key: 'should be dropped',
            },
            analysisHistory: [],
        });
        const result = parseBackup(raw, { rawSize: raw.length });
        expect(result.tutorialState).not.toHaveProperty('hasCompletedGlobalTutorial');
        expect(result.tutorialState.hasCompletedGlobalKnowledgeTutorial).toBe(true);
        expect(result.tutorialState).not.toHaveProperty('evil_key');
    });

    it('H1: analysisHistory items missing required fields are filtered out', () => {
        const validItem = {
            characters: { match: [], similar: [], new: [], extractedDetails: [] },
            worldContext: { worldKeywords: [], genre: '', tone: '' },
            worldTerms: { match: [], similar: [], new: [] },
            dialogues: [],
            notes: [],
        };
        const raw = JSON.stringify({
            schemaVersion: 1,
            exportedAt: '2026-04-28T00:00:00.000Z',
            appVersion: '0.0.0',
            projects: [],
            tutorialState: {},
            analysisHistory: [
                validItem,
                { characters: 'not an object' },
                null,
                { dialogues: [], notes: [] },
            ],
        });
        const result = parseBackup(raw, { rawSize: raw.length });
        expect(result.analysisHistory).toHaveLength(1);
    });
});

describe('resolveImportProjects (AC-3)', () => {
    it('non-conflicting projects go to toUpsert as-is', () => {
        const incoming = [makeProject({ id: 'p-new' })];
        const existingIds = new Set<string>(['p-existing']);
        const r = resolveImportProjects(incoming, existingIds, new Map());
        expect(r.toUpsert).toHaveLength(1);
        expect(r.toUpsert[0].id).toBe('p-new');
        expect(r.toCreate).toHaveLength(0);
    });

    it('overwrite resolution upserts the incoming project keeping its id', () => {
        const incoming = [makeProject({ id: 'p-1', name: 'incoming' })];
        const r = resolveImportProjects(
            incoming,
            new Set(['p-1']),
            new Map([['p-1', 'overwrite' as const]]),
        );
        expect(r.toUpsert).toHaveLength(1);
        expect(r.toUpsert[0].id).toBe('p-1');
        expect(r.toUpsert[0].name).toBe('incoming');
    });

    it('duplicate resolution writes a new uuid and decorated name', () => {
        const incoming = [makeProject({ id: 'p-1', name: 'incoming' })];
        const r = resolveImportProjects(
            incoming,
            new Set(['p-1']),
            new Map([['p-1', 'duplicate' as const]]),
        );
        expect(r.toUpsert).toHaveLength(0);
        expect(r.toCreate).toHaveLength(1);
        expect(r.toCreate[0].id).not.toBe('p-1');
        expect(r.toCreate[0].name).toBe('incoming (インポート)');
    });

    it('skip resolution drops the project entirely', () => {
        const incoming = [makeProject({ id: 'p-1' })];
        const r = resolveImportProjects(
            incoming,
            new Set(['p-1']),
            new Map([['p-1', 'skip' as const]]),
        );
        expect(r.toUpsert).toHaveLength(0);
        expect(r.toCreate).toHaveLength(0);
    });

    it('mixed batch: new + overwrite + skip + duplicate', () => {
        const incoming = [
            makeProject({ id: 'new' }),
            makeProject({ id: 'over' }),
            makeProject({ id: 'skip' }),
            makeProject({ id: 'dup' }),
        ];
        const r = resolveImportProjects(
            incoming,
            new Set(['over', 'skip', 'dup']),
            new Map([
                ['over', 'overwrite' as const],
                ['skip', 'skip' as const],
                ['dup', 'duplicate' as const],
            ]),
        );
        expect(r.toUpsert.map(p => p.id).sort()).toEqual(['new', 'over']);
        expect(r.toCreate).toHaveLength(1);
        expect(r.toCreate[0].id).not.toBe('dup');
    });

    it('H7: missing resolution for a conflicting id throws BackupValidationError', () => {
        const incoming = [makeProject({ id: 'p-1' })];
        expect(() =>
            resolveImportProjects(incoming, new Set(['p-1']), new Map()),
        ).toThrow(BackupValidationError);
    });
});

// --- M6 PR-B: parseAnyBackup + isEncryptedBackup + parseEncryptedEnvelope (AC-8) ---

import { encryptBackup, IV_BYTES, PBKDF2_ITERATIONS, randomBytes, SALT_BYTES, toBase64 } from './backupCrypto';
import { isEncryptedBackup, parseAnyBackup, parseEncryptedEnvelope } from './backupSchema';
import { buildSampleBackup } from '../tests/fixtures/backup';
import type { BackupV1 } from '../types';

const VALID_PASSPHRASE = 'test-passphrase-12-chars-ok';

describe('parseBackup return type invariance (AC-8 regression)', () => {
    it('AC-8: parseBackup of plaintext BackupV1 returns BackupV1, not union', () => {
        const backup = buildBackupV1({
            projects: [makeProject({ id: 'p-1' })],
            tutorialState: {},
            analysisHistory: [],
            appVersion: '1.0.0',
        });
        const raw = serializeBackup(backup);
        const parsed = parseBackup(raw);
        // type-level: parseBackup must return BackupV1; encrypted should not exist.
        // @ts-expect-error -- BackupV1 has no encrypted field
        const _check: typeof parsed.encrypted = undefined;
        expect(parsed.schemaVersion).toBe(1);
        expect(parsed.projects).toHaveLength(1);
    });
});

describe('parseAnyBackup + isEncryptedBackup AND-conjunction (AC-8)', () => {
    it('AC-8: plaintext BackupV1 routes through plaintext path (parseAnyBackup)', () => {
        const backup = buildBackupV1({
            projects: [makeProject({ id: 'p-1' })],
            tutorialState: {},
            analysisHistory: [],
            appVersion: '1.0.0',
        });
        const raw = serializeBackup(backup);
        const result = parseAnyBackup(raw);
        expect((result as { encrypted?: boolean }).encrypted).toBeUndefined();
        expect((result as BackupV1).schemaVersion).toBe(1);
    });

    it('AC-8: half-broken envelope (encrypted:true only) is REJECTED, not silently treated as plaintext', () => {
        const half = JSON.stringify({ encrypted: true, schemaVersion: 1 });
        try {
            parseAnyBackup(half);
            expect.unreachable();
        } catch (e) {
            expect(e).toBeInstanceOf(BackupValidationError);
            expect((e as Error).cause).toEqual({ kind: 'envelope-incomplete' });
        }
    });

    it('AC-8: isEncryptedBackup AND-conjunction returns false when any field missing', () => {
        const base = {
            envelopeVersion: 1,
            encrypted: true,
            algorithm: 'AES-GCM-256',
            kdf: 'PBKDF2-SHA256',
            kdfParams: { salt: 'sss', iterations: 600_000 },
            iv: 'iii',
            ciphertext: 'ccc',
            appVersion: '1.0.0',
            encryptedAt: '2026-04-29T00:00:00.000Z',
        };
        expect(isEncryptedBackup(base)).toBe(true);

        const fields: Array<keyof typeof base> = ['encrypted', 'algorithm', 'kdf', 'iv', 'ciphertext', 'kdfParams'];
        for (const k of fields) {
            const broken = { ...base } as Record<string, unknown>;
            delete broken[k];
            expect(isEncryptedBackup(broken)).toBe(false);
        }
    });

    it('AC-8: isEncryptedBackup returns false when encrypted=false (legacy plaintext shape)', () => {
        expect(isEncryptedBackup({ encrypted: false } as Record<string, unknown>)).toBe(false);
        expect(isEncryptedBackup({} as Record<string, unknown>)).toBe(false);
    });

    it('AC-8: encrypted envelope round-trips through parseAnyBackup', async () => {
        const env = await encryptBackup(buildSampleBackup(), VALID_PASSPHRASE, '1.0.0');
        const raw = JSON.stringify(env);
        const result = parseAnyBackup(raw);
        expect((result as { encrypted?: boolean }).encrypted).toBe(true);
    });
});

describe('parseEncryptedEnvelope parse-time guards (AC-4)', () => {
    const baseEnv = (): Record<string, unknown> => ({
        envelopeVersion: 1,
        encrypted: true,
        algorithm: 'AES-GCM-256',
        kdf: 'PBKDF2-SHA256',
        kdfParams: { salt: toBase64(randomBytes(SALT_BYTES)), iterations: PBKDF2_ITERATIONS },
        iv: toBase64(randomBytes(IV_BYTES)),
        ciphertext: toBase64(new Uint8Array(64)),
        appVersion: '1.0.0',
        encryptedAt: '2026-04-29T00:00:00.000Z',
    });

    it('AC-4: rejects unknown algorithm literal', () => {
        const env = { ...baseEnv(), algorithm: 'AES-GCM-256-FUTURE' };
        expect(() => parseEncryptedEnvelope(env)).toThrow(/アルゴリズム/);
    });

    it('AC-4: rejects unknown kdf literal', () => {
        const env = { ...baseEnv(), kdf: 'Argon2id' };
        expect(() => parseEncryptedEnvelope(env)).toThrow(/鍵派生関数/);
    });

    it('AC-4: rejects iterations below MIN_ACCEPTED_ITERATIONS', () => {
        const env = baseEnv();
        (env.kdfParams as { iterations: number }).iterations = 50_000;
        expect(() => parseEncryptedEnvelope(env)).toThrow(/iterations/);
    });

    it('AC-4: rejects iterations above MAX_ACCEPTED_ITERATIONS', () => {
        const env = baseEnv();
        (env.kdfParams as { iterations: number }).iterations = 20_000_000;
        expect(() => parseEncryptedEnvelope(env)).toThrow(/iterations/);
    });

    it('AC-4: rejects salt with wrong byte length', () => {
        const env = baseEnv();
        (env.kdfParams as { salt: string }).salt = toBase64(new Uint8Array(8)); // 8 bytes != 16
        expect(() => parseEncryptedEnvelope(env)).toThrow(/salt/);
    });

    it('AC-4: rejects iv with wrong byte length', () => {
        const env = baseEnv();
        env.iv = toBase64(new Uint8Array(16)); // 16 bytes != 12
        expect(() => parseEncryptedEnvelope(env)).toThrow(/iv/);
    });

    it('AC-4: rejects empty ciphertext', () => {
        const env = baseEnv();
        env.ciphertext = '';
        expect(() => parseEncryptedEnvelope(env)).toThrow(/ciphertext/);
    });

    it('AC-4: boundary iterations MIN_ACCEPTED_ITERATIONS accepted', () => {
        const env = baseEnv();
        (env.kdfParams as { iterations: number }).iterations = 100_000;
        expect(() => parseEncryptedEnvelope(env)).not.toThrow();
    });

    it('AC-4: boundary iterations MAX_ACCEPTED_ITERATIONS accepted', () => {
        const env = baseEnv();
        (env.kdfParams as { iterations: number }).iterations = 10_000_000;
        expect(() => parseEncryptedEnvelope(env)).not.toThrow();
    });
});
