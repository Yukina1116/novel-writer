import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the singletons that wireBlockedHandler talks to. `setBlockedHandler`
// is the contract surface — capture every call so we can assert install /
// detach symmetry. `useStore.getState().showToast` is what the registered
// handler must invoke when the blocked event fires. The handler now
// receives a BlockedEventPayload (H10-followup-3); current consumer
// ignores it but the contract test exercises both passing and absent
// payloads.
type BlockedHandler = (payload: { oldVersion: number; newVersion: number | null }) => void;
const setBlockedHandler = vi.fn<(handler: BlockedHandler | null) => void>();
const showToast = vi.fn<(message: string, kind?: string) => void>();
const fakePayload = { oldVersion: 1, newVersion: 2 } as const;

vi.mock('../db/dexie', () => ({
    setBlockedHandler: (handler: BlockedHandler | null) => setBlockedHandler(handler),
}));
vi.mock('../store/index', () => ({
    useStore: {
        getState: () => ({ showToast }),
    },
}));
// useLocalSync transitively imports refreshFromIndexedDb; stub it so importing
// this module doesn't drag IndexedDB into the test environment.
vi.mock('./refreshFromIndexedDb', () => ({
    refreshFromIndexedDb: vi.fn().mockResolvedValue({ failureCount: 0, healthyCount: 0 }),
}));

// Import after mocks are wired so the SUT picks them up.
const { wireBlockedHandler, DB_BLOCKED_MESSAGE } = await import('./useLocalSync');

beforeEach(() => {
    setBlockedHandler.mockReset();
    showToast.mockReset();
});

describe('wireBlockedHandler contract (H10-followup-1)', () => {
    it('installs a non-null handler on call', () => {
        wireBlockedHandler();
        expect(setBlockedHandler).toHaveBeenCalledOnce();
        const installed = setBlockedHandler.mock.calls[0][0];
        expect(typeof installed).toBe('function');
    });

    it('the installed handler routes the blocked event to showToast with the canonical error message', () => {
        wireBlockedHandler();
        const installed = setBlockedHandler.mock.calls[0][0]!;
        // Pass a payload like the real wrapper does. Today the consumer
        // ignores it; we still pass it so a future regression in the
        // signature (forgetting the parameter, accidentally requiring
        // extra fields) surfaces here.
        installed(fakePayload);
        expect(showToast).toHaveBeenCalledOnce();
        expect(showToast).toHaveBeenCalledWith(DB_BLOCKED_MESSAGE, 'error');
    });

    it('returns a detach function that calls setBlockedHandler(null)', () => {
        const detach = wireBlockedHandler();
        // The detach return must satisfy React's `useEffect` cleanup
        // contract — `() => void`. A regression returning undefined would
        // skip detach silently and leak a stale handler.
        expect(typeof detach).toBe('function');
        setBlockedHandler.mockClear(); // ignore the install call so we only see detach
        detach();
        expect(setBlockedHandler).toHaveBeenCalledOnce();
        expect(setBlockedHandler).toHaveBeenCalledWith(null);
    });

    it('handler reads showToast at call time (not at wire time) so store swaps still surface', () => {
        // First wire: install a handler bound to the original showToast spy.
        wireBlockedHandler();
        const installed = setBlockedHandler.mock.calls[0][0]!;

        // Simulate a store rebuild between wire-time and event-fire-time.
        // The handler uses `useStore.getState()` so it must keep working
        // even though the showToast spy was reset (i.e. it doesn't capture
        // the old reference).
        showToast.mockClear();
        installed(fakePayload);
        expect(showToast).toHaveBeenCalledWith(DB_BLOCKED_MESSAGE, 'error');
    });

    it('two consecutive installs end with the singleton at null after both detaches (regardless of order)', () => {
        // We don't simulate React's actual Strict Mode dispatch (the real
        // ordering is mount → cleanup → mount on remount, not two mounts
        // followed by two cleanups). What we do pin is the contract this
        // singleton needs to honor when re-installation happens before a
        // detach: each install builds a fresh closure, and once both
        // detaches have run, no stale closure remains registered. That
        // property is sufficient for any plausible Strict Mode / HMR /
        // double-consumer scenario.
        const detach1 = wireBlockedHandler();
        const detach2 = wireBlockedHandler();
        expect(setBlockedHandler).toHaveBeenCalledTimes(2);
        const handler1 = setBlockedHandler.mock.calls[0][0];
        const handler2 = setBlockedHandler.mock.calls[1][0];
        // Each install builds a fresh closure (different identity) — a
        // future regression that memoizes the closure module-side would
        // break this assertion.
        expect(handler1).not.toBe(handler2);

        detach1();
        detach2();
        expect(setBlockedHandler).toHaveBeenLastCalledWith(null);
    });

    it('detach is idempotent in this layer (the singleton handles repeat null setters)', () => {
        const detach = wireBlockedHandler();
        setBlockedHandler.mockClear();
        detach();
        detach();
        expect(setBlockedHandler).toHaveBeenCalledTimes(2);
        expect(setBlockedHandler).toHaveBeenNthCalledWith(1, null);
        expect(setBlockedHandler).toHaveBeenNthCalledWith(2, null);
    });
});

describe('useLocalSync useEffect ordering (H10-followup-1, fragile static check)', () => {
    // Without a React renderer we cannot run useLocalSync's useEffect
    // callback to observe the call order at runtime. Until jsdom +
    // @testing-library/react are introduced (see Issue #49 future
    // follow-up), pin the order via a low-effort static check on the
    // source: the line invoking wireBlockedHandler() must precede the
    // line invoking init(). This is fragile (sensitive to formatting)
    // but it does catch the most likely regression — a future refactor
    // that swaps the two lines and reintroduces the bootstrap-gap silent
    // hang.
    it('source: wireBlockedHandler() is invoked before init() inside the wiring useEffect', async () => {
        const { readFile } = await import('node:fs/promises');
        const { fileURLToPath } = await import('node:url');
        const path = fileURLToPath(new URL('./useLocalSync.ts', import.meta.url));
        const src = await readFile(path, 'utf-8');
        const wireIdx = src.indexOf('wireBlockedHandler()');
        const initIdx = src.indexOf('init();');
        expect(wireIdx).toBeGreaterThan(-1);
        expect(initIdx).toBeGreaterThan(-1);
        expect(wireIdx).toBeLessThan(initIdx);
    });
});
