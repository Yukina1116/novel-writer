import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createBackupSlice } from './backupSlice';
import { Project } from '../types';
import { defaultAiSettings, defaultDisplaySettings } from '../constants';

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
});

describe('isBackupStale (AC-7)', () => {
    // Anchor "now" so day-boundary math is deterministic. Without a fixed clock
    // a test comparing exact 30-day deltas would race the wall clock and flake
    // around midnight UTC.
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

    it('returns false when exported within 30 days', () => {
        const fake = createFakeStore();
        setLoaded(fake, isoFromNowMinus(5 * DAY_MS));
        expect(fake.state.isBackupStale()).toBe(false);
    });

    it('returns true when exported >30 days ago', () => {
        const fake = createFakeStore();
        setLoaded(fake, isoFromNowMinus(31 * DAY_MS));
        expect(fake.state.isBackupStale()).toBe(true);
    });

    it('returns true on malformed iso', () => {
        const fake = createFakeStore();
        setLoaded(fake, 'not-an-iso');
        expect(fake.state.isBackupStale()).toBe(true);
    });

    // H6: Boundary tests — `isBackupStale` flips on `days > 30`, where
    // `days = floor((now - exportedAt) / ms_per_day)`. Verify both sides of
    // the floor (just-under / just-over) and the exact 30-day mark to lock
    // the contract against accidental `>=` regressions.
    describe('H6 boundary (exactly 30 days)', () => {
        it('is NOT stale at exactly 30 days 0 ms (days === 30, boundary inclusive of fresh)', () => {
            const fake = createFakeStore();
            setLoaded(fake, isoFromNowMinus(30 * DAY_MS));
            expect(fake.state.isBackupStale()).toBe(false);
        });

        it('is NOT stale at 30 days + 1 ms (still floors to 30)', () => {
            const fake = createFakeStore();
            setLoaded(fake, isoFromNowMinus(30 * DAY_MS + 1));
            expect(fake.state.isBackupStale()).toBe(false);
        });

        it('is NOT stale just under 31 days (30 days + DAY_MS - 1 ms still floors to 30)', () => {
            const fake = createFakeStore();
            setLoaded(fake, isoFromNowMinus(31 * DAY_MS - 1));
            expect(fake.state.isBackupStale()).toBe(false);
        });

        it('IS stale at exactly 31 days 0 ms (days === 31, first stale tick)', () => {
            const fake = createFakeStore();
            setLoaded(fake, isoFromNowMinus(31 * DAY_MS));
            expect(fake.state.isBackupStale()).toBe(true);
        });

        it('IS stale at 31 days + 1 ms', () => {
            const fake = createFakeStore();
            setLoaded(fake, isoFromNowMinus(31 * DAY_MS + 1));
            expect(fake.state.isBackupStale()).toBe(true);
        });
    });
});
