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
});
