import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createSyncSlice, type SyncSlice } from './syncSlice';

// Mock the IndexedDB write so the slice can run in node without a real DB.
const putProject = vi.fn<(p: any) => Promise<void>>();

vi.mock('../db/projectRepository', () => ({
    putProject: (...args: unknown[]) => putProject(...(args as [any])),
}));

interface FakeStore {
    state: SyncSlice & {
        activeProjectId: string;
        allProjectsData: Record<string, any>;
        showToast?: ReturnType<typeof vi.fn>;
    };
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
        ...createSyncSlice(fake.set, fake.get),
        activeProjectId: 'p-1',
        allProjectsData: { 'p-1': { id: 'p-1', name: 'P' } },
        showToast: vi.fn(),
    } as any;
    return fake;
};

beforeEach(() => {
    putProject.mockReset();
    vi.useFakeTimers();
});
afterEach(() => {
    // syncSlice schedules a 5s retry timer on save failure. In tests that
    // exercise the failure path, that timer is still pending when we
    // switch back to real timers — it would fire later and re-invoke
    // flushSave with stale captured state. Clear all pending timers
    // first to avoid cross-test pollution.
    vi.clearAllTimers();
    vi.useRealTimers();
});

describe('flushSaveBlocking (H2 redesign)', () => {
    it('synced state: returns immediately without calling putProject', async () => {
        const fake = createFakeStore();
        // Default state is 'synced' so a blocking flush has nothing to do.
        await fake.state.flushSaveBlocking(1000);
        expect(putProject).not.toHaveBeenCalled();
    });

    it('dirty state: triggers a fresh flush and resolves on success', async () => {
        const fake = createFakeStore();
        putProject.mockResolvedValue(undefined);
        fake.set({ saveStatus: 'dirty' });

        await fake.state.flushSaveBlocking(1000);

        expect(putProject).toHaveBeenCalledOnce();
        expect(fake.state.saveStatus).toBe('synced');
    });

    it('saving state: awaits the in-flight promise instead of early-returning', async () => {
        // Reproduce H2 root cause: with the old flushSave, calling it while
        // saveStatus === 'saving' silently early-returned (apparent success
        // while putProject was still in flight). flushSaveBlocking must
        // wait on _savingPromise until the underlying putProject finishes.
        const fake = createFakeStore();
        let resolvePut!: () => void;
        putProject.mockImplementationOnce(
            () => new Promise<void>((res) => { resolvePut = res; }),
        );

        // Kick off the in-flight save; do NOT await yet.
        fake.set({ saveStatus: 'dirty' });
        const inFlight = fake.state.flushSave();
        // The slice should now be in 'saving' with _savingPromise set.
        expect(fake.state.saveStatus).toBe('saving');
        expect(fake.state._savingPromise).not.toBeNull();

        // Concurrent caller invokes flushSaveBlocking. It must NOT return
        // before the in-flight putProject resolves.
        let blockingDone = false;
        const blocking = fake.state.flushSaveBlocking(5000).then(() => {
            blockingDone = true;
        });
        await Promise.resolve(); // micro-task tick
        expect(blockingDone).toBe(false);

        // Now finish the in-flight save. Both promises should settle.
        resolvePut();
        await inFlight;
        await blocking;
        expect(blockingDone).toBe(true);
        expect(fake.state.saveStatus).toBe('synced');
        expect(putProject).toHaveBeenCalledOnce(); // no double-flush
    });

    it('saving state: in-flight rejection propagates to flushSaveBlocking', async () => {
        const fake = createFakeStore();
        let rejectPut!: (e: Error) => void;
        putProject.mockImplementationOnce(
            () => new Promise<void>((_, rej) => { rejectPut = rej; }),
        );

        fake.set({ saveStatus: 'dirty' });
        const inFlight = fake.state.flushSave();
        const blocking = fake.state.flushSaveBlocking(5000);

        rejectPut(new Error('IDB quota exceeded'));
        // syncSlice swallows the rejection internally (converts to
        // saveStatus='error' + toast + retry timer), but flushSaveBlocking
        // MUST throw so prepareImport can abort.
        await inFlight;
        await expect(blocking).rejects.toThrow(/quota exceeded/);
        expect(fake.state.saveStatus).toBe('error');
    });

    it('error state: flushSaveBlocking re-flushes and surfaces the new failure', async () => {
        const fake = createFakeStore();
        // Pre-existing error state with a remembered message.
        fake.set({ saveStatus: 'error', lastSyncError: 'previous attempt failed' });
        putProject.mockRejectedValue(new Error('IDB still locked'));

        await expect(fake.state.flushSaveBlocking(5000)).rejects.toThrow(/IDB still locked/);
        expect(fake.state.saveStatus).toBe('error');
    });

    it('timeout: rejects with a timeout error if the work never settles', async () => {
        const fake = createFakeStore();
        // putProject hangs forever — simulates a stuck IndexedDB.
        putProject.mockImplementation(() => new Promise(() => {}));
        fake.set({ saveStatus: 'dirty' });

        const blocking = fake.state.flushSaveBlocking(50);
        // Attach the rejection handler BEFORE advancing fake timers so the
        // synthetic reject() in setTimeout is observed as handled. Without
        // this, Node's microtask check sees a rejected promise with no
        // attached .catch yet and reports it as unhandled, which Vitest
        // surfaces as a test-runner error.
        const settled = blocking.then(
            () => ({ kind: 'fulfilled' as const }),
            (err: unknown) => ({ kind: 'rejected' as const, err }),
        );
        await vi.advanceTimersByTimeAsync(50);
        const result = await settled;
        expect(result.kind).toBe('rejected');
        if (result.kind === 'rejected') {
            expect((result.err as Error).message).toMatch(/timed out after 50ms/);
        }
    });

    it('default timeout is generous enough that a normal save resolves first', async () => {
        const fake = createFakeStore();
        putProject.mockResolvedValue(undefined);
        fake.set({ saveStatus: 'dirty' });

        // Use the default timeout (no argument). The save resolves on the
        // next microtask, so the timeout (10s) never fires.
        await fake.state.flushSaveBlocking();
        expect(fake.state.saveStatus).toBe('synced');
    });

    it('no active project: flushSaveBlocking returns without trying to write', async () => {
        const fake = createFakeStore();
        fake.set({ activeProjectId: '', saveStatus: 'synced' });
        await fake.state.flushSaveBlocking(1000);
        expect(putProject).not.toHaveBeenCalled();
    });

    it('saving → dirty → re-flush: in-flight save with _pendingFlush triggers a second putProject', async () => {
        // PR #57 root-cause regression: when an edit lands during an
        // in-flight save (_pendingFlush is set true), the slice becomes
        // 'dirty' again immediately after the save resolves. Without
        // flushSaveBlocking's status-recheck branch, prepareImport would
        // observe a stale on-disk snapshot. Pin all three phases here:
        // wait for in-flight, see dirty, re-flush.
        const fake = createFakeStore();
        let resolveFirst!: () => void;
        let resolveSecond!: () => void;
        putProject
            .mockImplementationOnce(() => new Promise<void>((res) => { resolveFirst = res; }))
            .mockImplementationOnce(() => new Promise<void>((res) => { resolveSecond = res; }));

        // Kick off the in-flight save.
        fake.set({ saveStatus: 'dirty' });
        const inFlight = fake.state.flushSave();
        expect(fake.state.saveStatus).toBe('saving');
        // Simulate an edit during the save → markDirty sets _pendingFlush.
        fake.state.markDirty();
        expect(fake.state._pendingFlush).toBe(true);

        // Now flushSaveBlocking enters: waits for in-flight, sees the
        // post-resolve 'dirty' status (because _pendingFlush triggers
        // markDirty inside flushSave's resolve path), re-flushes.
        const blocking = fake.state.flushSaveBlocking(5000);

        // Resolve the first save. Inside flushSave's success branch, it
        // sets synced + clears _pendingFlush + calls markDirty(), which
        // schedules a debounced flush. flushSaveBlocking must observe
        // 'dirty' and call flushSave again.
        resolveFirst();
        await inFlight;
        // Drain pending microtasks so flushSaveBlocking's status check
        // runs and the second flushSave is scheduled.
        await Promise.resolve();
        await Promise.resolve();

        // Second putProject should be in-flight by now.
        expect(putProject).toHaveBeenCalledTimes(2);

        resolveSecond();
        await blocking;
        expect(fake.state.saveStatus).toBe('synced');
    });
});
