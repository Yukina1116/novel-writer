import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createBackupSlice } from './backupSlice';
import { Project } from '../types';
import { defaultAiSettings, defaultDisplaySettings } from '../constants';
import { STALE_BACKUP_DAYS } from '../utils/backupFormat';

// Mock the db layer so backupSlice can run without a real IndexedDB.
const readSnapshot = vi.fn();
const writeImport = vi.fn();
const loadLastExportedAt = vi.fn();
const saveLastExportedAt = vi.fn();
const refreshFromIndexedDb = vi.fn();
const loadTutorialState = vi.fn();
const loadAnalysisHistory = vi.fn();

vi.mock('../db/backupRepository', () => ({
    readSnapshot: (...args: unknown[]) => readSnapshot(...args),
    writeImport: (...args: unknown[]) => writeImport(...args),
    loadLastExportedAt: (...args: unknown[]) => loadLastExportedAt(...args),
    saveLastExportedAt: (...args: unknown[]) => saveLastExportedAt(...args),
}));
vi.mock('../hooks/refreshFromIndexedDb', () => ({
    refreshFromIndexedDb: (...args: unknown[]) => refreshFromIndexedDb(...args),
}));
vi.mock('../db/tutorialRepository', () => ({
    loadTutorialState: (...args: unknown[]) => loadTutorialState(...args),
}));
vi.mock('../db/analysisHistoryRepository', () => ({
    loadAnalysisHistory: (...args: unknown[]) => loadAnalysisHistory(...args),
}));

const makeProject = (over: Partial<Project> = {}): Project => ({
    id: over.id ?? 'p-1',
    name: over.name ?? 'P',
    lastModified: '2026-04-28T00:00:00.000Z',
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
    ...over,
});

interface FakeStore {
    state: ReturnType<typeof createBackupSlice> & { showToast?: any };
    set: (partial: any) => void;
    get: () => FakeStore['state'];
}

const createFakeStore = (): FakeStore => {
    const fake: FakeStore = { state: {} as any, set: () => {}, get: () => fake.state };
    fake.set = (partial: any) => {
        const next = typeof partial === 'function' ? partial(fake.state) : partial;
        fake.state = { ...fake.state, ...next };
    };
    fake.get = () => fake.state;
    fake.state = {
        ...createBackupSlice(fake.set, fake.get),
        showToast: vi.fn(),
    } as any;
    return fake;
};

beforeEach(() => {
    readSnapshot.mockReset();
    writeImport.mockReset();
    loadLastExportedAt.mockReset();
    saveLastExportedAt.mockReset();
    refreshFromIndexedDb.mockReset().mockResolvedValue({ failureCount: 0, healthyCount: 0 });
    loadTutorialState.mockReset().mockResolvedValue({});
    loadAnalysisHistory.mockReset().mockResolvedValue([]);

    // jsdom is not loaded in node env; stub minimal browser bits used by exportAllData.
    (globalThis as any).URL ??= {} as any;
    (globalThis as any).URL.createObjectURL = vi.fn(() => 'blob:mock');
    (globalThis as any).URL.revokeObjectURL = vi.fn();
    (globalThis as any).Blob = class { constructor(public parts: any, public opts: any) {} } as any;
    (globalThis as any).document ??= {} as any;
    (globalThis as any).document.createElement = vi.fn(() => ({
        click: vi.fn(),
        remove: vi.fn(),
        style: {},
    }));
    (globalThis as any).document.body ??= { appendChild: vi.fn() };
});

describe('initBackupState (AC-6)', () => {
    it('loads lastExportedAt from db and marks status loaded', async () => {
        loadLastExportedAt.mockResolvedValue('2026-04-01T00:00:00.000Z');
        const fake = createFakeStore();
        await fake.state.initBackupState();
        expect(fake.state.lastExportedAt).toBe('2026-04-01T00:00:00.000Z');
        expect(fake.state.backupMetaStatus).toBe('loaded');
    });

    it('keeps null when nothing persisted', async () => {
        loadLastExportedAt.mockResolvedValue(null);
        const fake = createFakeStore();
        await fake.state.initBackupState();
        expect(fake.state.lastExportedAt).toBeNull();
        expect(fake.state.backupMetaStatus).toBe('loaded');
    });

    it('H3: keeps backupMetaStatus=unknown on db error and toasts', async () => {
        loadLastExportedAt.mockRejectedValue(new Error('IndexedDB closed'));
        const fake = createFakeStore();
        await fake.state.initBackupState();
        expect(fake.state.backupMetaStatus).toBe('unknown');
        expect((fake.state.showToast as any)).toHaveBeenCalled();
        // Stale should be suppressed in unknown state to avoid lying to the user.
        expect(fake.state.isBackupStale()).toBe(false);
    });
});

describe('exportAllData (AC-1, AC-6)', () => {
    it('serializes snapshot, persists lastExportedAt, surfaces toast', async () => {
        readSnapshot.mockResolvedValue({
            projects: [makeProject({ id: 'p-1' }), makeProject({ id: 'p-2' })],
            tutorialState: { hasCompletedGlobalTutorial: true },
            analysisHistory: [],
        });
        const fake = createFakeStore();
        await fake.state.exportAllData();
        expect(saveLastExportedAt).toHaveBeenCalledOnce();
        expect(fake.state.lastExportedAt).toBeTruthy();
        expect((fake.state.showToast as any)).toHaveBeenCalled();
    });
});

describe('prepareImport / executeImport (AC-3, AC-5)', () => {
    it('detects conflicts against existing IndexedDB ids', async () => {
        readSnapshot.mockResolvedValue({
            projects: [makeProject({ id: 'p-existing', name: '既存' })],
            tutorialState: {},
            analysisHistory: [],
        });
        const fake = createFakeStore();
        const raw = JSON.stringify({
            schemaVersion: 1,
            exportedAt: '2026-04-28T00:00:00.000Z',
            appVersion: '0.0.0',
            projects: [
                makeProject({ id: 'p-existing', name: 'インポート' }),
                makeProject({ id: 'p-new', name: '新規' }),
            ],
            tutorialState: {},
            analysisHistory: [],
        });
        const plan = await fake.state.prepareImport(raw);
        expect(plan.conflicts).toHaveLength(1);
        expect(plan.conflicts[0].incomingId).toBe('p-existing');
        expect(plan.conflicts[0].existingName).toBe('既存');
        expect(plan.conflicts[0].resolution).toBe('overwrite'); // default
    });

    it('AC-5 (atomicity): writeImport invoked once with consolidated payload', async () => {
        readSnapshot.mockResolvedValue({
            projects: [makeProject({ id: 'p-existing' })],
            tutorialState: {},
            analysisHistory: [],
        });
        writeImport.mockResolvedValue(undefined);
        const fake = createFakeStore();
        const raw = JSON.stringify({
            schemaVersion: 1,
            exportedAt: '2026-04-28T00:00:00.000Z',
            appVersion: '0.0.0',
            projects: [
                makeProject({ id: 'p-existing' }),
                makeProject({ id: 'p-new' }),
            ],
            tutorialState: { hasCompletedGlobalTutorial: true },
            analysisHistory: [],
        });
        await fake.state.prepareImport(raw);
        const result = await fake.state.executeImport();
        expect(writeImport).toHaveBeenCalledOnce();
        const payload = writeImport.mock.calls[0][0];
        expect(payload.toUpsert.map((p: Project) => p.id).sort()).toEqual(['p-existing', 'p-new']);
        expect(result.upserted).toBe(2);
        expect(result.created).toBe(0);
    });

    it('AC-5 (atomicity): writeImport rejection bubbles up, no partial state in store', async () => {
        readSnapshot.mockResolvedValue({
            projects: [],
            tutorialState: {},
            analysisHistory: [],
        });
        writeImport.mockRejectedValue(new Error('quota exceeded'));
        const fake = createFakeStore();
        const raw = JSON.stringify({
            schemaVersion: 1,
            exportedAt: '2026-04-28T00:00:00.000Z',
            appVersion: '0.0.0',
            projects: [makeProject({ id: 'p-1' })],
            tutorialState: {},
            analysisHistory: [],
        });
        await fake.state.prepareImport(raw);
        await expect(fake.state.executeImport()).rejects.toThrow(/quota/);
        // importPlan retained so user can retry / inspect
        expect(fake.state.importPlan).not.toBeNull();
    });

    // H4: full prepareImport → setImportResolution → executeImport flow.
    // Existing tests cover the default-overwrite path; this block exercises
    // resolution mutation (skip / duplicate / mixed) so the Map seeded from
    // `plan.conflicts` reaches `resolveImportProjects` intact.
    describe('H4 setImportResolution → executeImport flow', () => {
        it('skip resolution drops conflicting incoming, keeps non-conflicting', async () => {
            readSnapshot.mockResolvedValue({
                projects: [makeProject({ id: 'p-existing', name: '既存' })],
                tutorialState: {},
                analysisHistory: [],
            });
            writeImport.mockResolvedValue(undefined);
            const fake = createFakeStore();
            const raw = JSON.stringify({
                schemaVersion: 1,
                exportedAt: '2026-04-28T00:00:00.000Z',
                appVersion: '0.0.0',
                projects: [
                    makeProject({ id: 'p-existing', name: 'インポート' }),
                    makeProject({ id: 'p-new', name: '新規' }),
                ],
                tutorialState: {},
                analysisHistory: [],
            });

            await fake.state.prepareImport(raw);
            fake.state.setImportResolution('p-existing', 'skip');
            const result = await fake.state.executeImport();

            expect(writeImport).toHaveBeenCalledOnce();
            const payload = writeImport.mock.calls[0][0];
            expect(payload.toUpsert.map((p: Project) => p.id)).toEqual(['p-new']);
            expect(payload.toCreate).toEqual([]);
            expect(result).toEqual({ upserted: 1, created: 0, skipped: 1 });
        });

        it('duplicate resolution issues fresh id + (インポート) suffix into toCreate', async () => {
            readSnapshot.mockResolvedValue({
                projects: [makeProject({ id: 'p-existing', name: '既存' })],
                tutorialState: {},
                analysisHistory: [],
            });
            writeImport.mockResolvedValue(undefined);
            const fake = createFakeStore();
            const raw = JSON.stringify({
                schemaVersion: 1,
                exportedAt: '2026-04-28T00:00:00.000Z',
                appVersion: '0.0.0',
                projects: [makeProject({ id: 'p-existing', name: 'インポート版' })],
                tutorialState: {},
                analysisHistory: [],
            });

            await fake.state.prepareImport(raw);
            fake.state.setImportResolution('p-existing', 'duplicate');
            const result = await fake.state.executeImport();

            const payload = writeImport.mock.calls[0][0];
            expect(payload.toUpsert).toEqual([]);
            expect(payload.toCreate).toHaveLength(1);
            expect(payload.toCreate[0].id).not.toBe('p-existing'); // freshly minted UUID
            expect(payload.toCreate[0].name).toBe('インポート版 (インポート)');
            expect(result).toEqual({ upserted: 0, created: 1, skipped: 0 });
        });

        it('mixed resolutions: overwrite + skip + duplicate produce a single consolidated writeImport', async () => {
            readSnapshot.mockResolvedValue({
                projects: [
                    makeProject({ id: 'p-a', name: 'A既存' }),
                    makeProject({ id: 'p-b', name: 'B既存' }),
                    makeProject({ id: 'p-c', name: 'C既存' }),
                ],
                tutorialState: {},
                analysisHistory: [],
            });
            writeImport.mockResolvedValue(undefined);
            const fake = createFakeStore();
            const raw = JSON.stringify({
                schemaVersion: 1,
                exportedAt: '2026-04-28T00:00:00.000Z',
                appVersion: '0.0.0',
                projects: [
                    makeProject({ id: 'p-a', name: 'A入力' }),
                    makeProject({ id: 'p-b', name: 'B入力' }),
                    makeProject({ id: 'p-c', name: 'C入力' }),
                    makeProject({ id: 'p-d', name: 'D入力（新規）' }),
                ],
                tutorialState: {},
                analysisHistory: [],
            });

            await fake.state.prepareImport(raw);
            fake.state.setImportResolution('p-a', 'overwrite');
            fake.state.setImportResolution('p-b', 'skip');
            fake.state.setImportResolution('p-c', 'duplicate');
            const result = await fake.state.executeImport();

            expect(writeImport).toHaveBeenCalledOnce();
            const payload = writeImport.mock.calls[0][0];
            // p-a (overwrite) + p-d (new) → toUpsert
            expect(payload.toUpsert.map((p: Project) => p.id).sort()).toEqual(['p-a', 'p-d']);
            // p-c (duplicate) → toCreate with fresh id
            expect(payload.toCreate).toHaveLength(1);
            expect(payload.toCreate[0].id).not.toBe('p-c');
            // p-b (skip) → absent everywhere
            const allOutgoingIds = [...payload.toUpsert, ...payload.toCreate].map((p: Project) => p.id);
            expect(allOutgoingIds).not.toContain('p-b');
            expect(result).toEqual({ upserted: 2, created: 1, skipped: 1 });
        });

        it('setImportResolution is a no-op when there is no active plan (defensive)', () => {
            const fake = createFakeStore();
            // Should not throw, should not flip importPlan from null.
            fake.state.setImportResolution('does-not-matter', 'skip');
            expect(fake.state.importPlan).toBeNull();
        });
    });

    // H5: TOCTOU between prepareImport and executeImport. The slice re-reads
    // existingIds at execute time so concurrent deletes/inserts don't lock the
    // user into a stale conflict picture. Switch readSnapshot via
    // `mockResolvedValueOnce` to simulate the two reads returning different
    // states, and assert the second read drives the actual write.
    describe('H5 TOCTOU re-read between prepareImport and executeImport', () => {
        it('delete-after-prepare: skip resolution is overridden when target no longer exists at execute', async () => {
            const fake = createFakeStore();
            writeImport.mockResolvedValue(undefined);

            // 1st read (prepareImport): p-existing is on disk → conflict detected.
            readSnapshot.mockResolvedValueOnce({
                projects: [makeProject({ id: 'p-existing', name: '既存' })],
                tutorialState: {},
                analysisHistory: [],
            });
            // 2nd read (executeImport): p-existing was deleted in another tab → no longer conflicts.
            readSnapshot.mockResolvedValueOnce({
                projects: [],
                tutorialState: {},
                analysisHistory: [],
            });

            const raw = JSON.stringify({
                schemaVersion: 1,
                exportedAt: '2026-04-28T00:00:00.000Z',
                appVersion: '0.0.0',
                projects: [makeProject({ id: 'p-existing', name: 'インポート' })],
                tutorialState: {},
                analysisHistory: [],
            });

            await fake.state.prepareImport(raw);
            // User picks "skip" because they thought it would clash. By execute
            // time the row is gone, so resolveImportProjects sees no conflict
            // and treats the incoming project as a fresh insert (toUpsert).
            fake.state.setImportResolution('p-existing', 'skip');
            const result = await fake.state.executeImport();

            expect(readSnapshot).toHaveBeenCalledTimes(2);
            const payload = writeImport.mock.calls[0][0];
            expect(payload.toUpsert.map((p: Project) => p.id)).toEqual(['p-existing']);
            expect(result.upserted).toBe(1);
        });

        it('insert-after-prepare: new conflict without resolution surfaces a BackupValidationError instead of silently overwriting', async () => {
            const fake = createFakeStore();
            writeImport.mockResolvedValue(undefined);

            // 1st read: empty disk → no conflicts seeded.
            readSnapshot.mockResolvedValueOnce({
                projects: [],
                tutorialState: {},
                analysisHistory: [],
            });
            // 2nd read: another tab inserted p-1 between prepare and execute.
            readSnapshot.mockResolvedValueOnce({
                projects: [makeProject({ id: 'p-1', name: '他タブで追加' })],
                tutorialState: {},
                analysisHistory: [],
            });

            const raw = JSON.stringify({
                schemaVersion: 1,
                exportedAt: '2026-04-28T00:00:00.000Z',
                appVersion: '0.0.0',
                projects: [makeProject({ id: 'p-1', name: 'インポート' })],
                tutorialState: {},
                analysisHistory: [],
            });

            await fake.state.prepareImport(raw);
            // No setImportResolution call — plan.conflicts was empty. The TOCTOU
            // re-read discovers a new collision, but resolutions Map has nothing
            // to say, so resolveImportProjects refuses to silently overwrite and
            // throws. Critical invariant: writeImport must NOT be called.
            await expect(fake.state.executeImport()).rejects.toThrow(/衝突解決方針/);
            expect(writeImport).not.toHaveBeenCalled();
            // importPlan retained so the UI can re-prepare or surface the race.
            expect(fake.state.importPlan).not.toBeNull();
        });
    });
});

describe('isBackupStale (AC-7)', () => {
    // Anchor "now" so day-boundary math is deterministic. Without a fixed
    // clock, an exact-N-day delta test would race the wall clock and flake
    // around any day rollover (`Math.floor` flips precisely on the boundary).
    const FIXED_NOW = new Date('2026-05-01T00:00:00.000Z');
    const DAY_MS = 24 * 60 * 60 * 1000;

    const setLoaded = (fake: ReturnType<typeof createFakeStore>, lastExportedAt: string | null) => {
        fake.set({ lastExportedAt, backupMetaStatus: 'loaded' });
    };
    const isoFromNowMinus = (ms: number) => new Date(FIXED_NOW.getTime() - ms).toISOString();

    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(FIXED_NOW);
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    it('returns true when never exported (loaded + null)', () => {
        const fake = createFakeStore();
        setLoaded(fake, null);
        expect(fake.state.isBackupStale()).toBe(true);
    });

    it('returns false when exported within STALE_BACKUP_DAYS', () => {
        const fake = createFakeStore();
        setLoaded(fake, isoFromNowMinus(5 * DAY_MS));
        expect(fake.state.isBackupStale()).toBe(false);
    });

    it('returns true when exported beyond STALE_BACKUP_DAYS', () => {
        const fake = createFakeStore();
        setLoaded(fake, isoFromNowMinus((STALE_BACKUP_DAYS + 1) * DAY_MS));
        expect(fake.state.isBackupStale()).toBe(true);
    });

    it('returns true on malformed iso', () => {
        const fake = createFakeStore();
        setLoaded(fake, 'not-an-iso');
        expect(fake.state.isBackupStale()).toBe(true);
    });

    // H6: Boundary tests — `isBackupStale` flips on `days > STALE_BACKUP_DAYS`,
    // where `days = floor((now - exportedAt) / ms_per_day)`. Verify both sides
    // of the floor (just-under / just-over) and the exact-threshold mark to
    // lock the contract against accidental `>=` regressions.
    describe(`H6 boundary (exactly STALE_BACKUP_DAYS=${STALE_BACKUP_DAYS} days)`, () => {
        it(`is NOT stale at exactly STALE_BACKUP_DAYS 0 ms (days === ${STALE_BACKUP_DAYS}, predicate is strict >)`, () => {
            const fake = createFakeStore();
            setLoaded(fake, isoFromNowMinus(STALE_BACKUP_DAYS * DAY_MS));
            expect(fake.state.isBackupStale()).toBe(false);
        });

        it(`is NOT stale at STALE_BACKUP_DAYS + 1 ms (floor still pins days to ${STALE_BACKUP_DAYS})`, () => {
            const fake = createFakeStore();
            setLoaded(fake, isoFromNowMinus(STALE_BACKUP_DAYS * DAY_MS + 1));
            expect(fake.state.isBackupStale()).toBe(false);
        });

        it(`is NOT stale just under STALE_BACKUP_DAYS+1 (DAY_MS - 1 ms before the next floor tick)`, () => {
            const fake = createFakeStore();
            setLoaded(fake, isoFromNowMinus((STALE_BACKUP_DAYS + 1) * DAY_MS - 1));
            expect(fake.state.isBackupStale()).toBe(false);
        });

        it(`IS stale at exactly STALE_BACKUP_DAYS+1 0 ms (days === ${STALE_BACKUP_DAYS + 1}, first stale tick)`, () => {
            const fake = createFakeStore();
            setLoaded(fake, isoFromNowMinus((STALE_BACKUP_DAYS + 1) * DAY_MS));
            expect(fake.state.isBackupStale()).toBe(true);
        });

        it(`IS stale at STALE_BACKUP_DAYS+1 + 1 ms`, () => {
            const fake = createFakeStore();
            setLoaded(fake, isoFromNowMinus((STALE_BACKUP_DAYS + 1) * DAY_MS + 1));
            expect(fake.state.isBackupStale()).toBe(true);
        });
    });
});
