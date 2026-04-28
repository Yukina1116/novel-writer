import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the singletons that wireBlockedHandler talks to. `setBlockedHandler`
// is the contract surface — capture every call so we can assert install /
// detach symmetry. `useStore.getState().showToast` is what the registered
// handler must invoke when the blocked event fires.
const setBlockedHandler = vi.fn<(handler: (() => void) | null) => void>();
const showToast = vi.fn<(message: string, kind?: string) => void>();

vi.mock('../db/dexie', () => ({
    setBlockedHandler: (handler: (() => void) | null) => setBlockedHandler(handler),
}));
vi.mock('../store/index', () => ({
    useStore: {
        getState: () => ({ showToast }),
    },
}));
// useLocalSync also imports refreshFromIndexedDb at module-eval time via the
// useEffect; stub it so importing the file doesn't drag IndexedDB in.
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
        installed();
        expect(showToast).toHaveBeenCalledOnce();
        expect(showToast).toHaveBeenCalledWith(DB_BLOCKED_MESSAGE, 'error');
    });

    it('returns a detach function that calls setBlockedHandler(null)', () => {
        const detach = wireBlockedHandler();
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
        installed();
        expect(showToast).toHaveBeenCalledWith(DB_BLOCKED_MESSAGE, 'error');
    });

    it('strict-mode-style double mount and detach in LIFO order: latest detach restores null', () => {
        // React Strict Mode invokes the effect twice in dev: setUp1 → setUp2
        // → cleanup1 → cleanup2 (or browsers' hot-reload follows the same
        // shape). The wiring must end with a non-stale handler (the second
        // mount's) that subsequently detaches cleanly.
        const detach1 = wireBlockedHandler();
        const detach2 = wireBlockedHandler();
        expect(setBlockedHandler).toHaveBeenCalledTimes(2);
        const handler1 = setBlockedHandler.mock.calls[0][0];
        const handler2 = setBlockedHandler.mock.calls[1][0];
        // Each install builds a fresh closure (different identity) — a
        // future regression that memoizes the closure module-side would
        // break this assertion.
        expect(handler1).not.toBe(handler2);

        // React invokes cleanups in LIFO; the last `setBlockedHandler` call
        // we observe must be `null` — no stale closure left registered.
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
