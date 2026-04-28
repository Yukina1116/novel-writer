import { describe, it, expect, vi, beforeEach } from 'vitest';

// Capture the most recently constructed mock Dexie instance so each test can
// inspect the `on('blocked', ...)` registration that ran inside `createDb`.
const mockInstances: MockInstance[] = [];

interface MockInstance {
    on: ReturnType<typeof vi.fn>;
    versionCalls: Array<{ version: number; stores: Record<string, string> }>;
    blockedHandlers: Array<() => void>;
}

vi.mock('dexie', () => {
    class MockDexie {
        constructor(_name: string) {
            const captured: MockInstance = {
                on: vi.fn((event: string, handler: () => void) => {
                    if (event === 'blocked') {
                        captured.blockedHandlers.push(handler);
                    }
                }),
                versionCalls: [],
                blockedHandlers: [],
            };
            mockInstances.push(captured);
            // Mix the captured fields onto `this` so the SUT sees them
            // (createDb does `instance.on(...)` etc.)
            Object.assign(this, {
                on: captured.on,
                version: (v: number) => ({
                    stores: (s: Record<string, string>) => {
                        captured.versionCalls.push({ version: v, stores: s });
                        return { stores: () => undefined };
                    },
                }),
            });
        }
    }
    return { default: MockDexie };
});

describe('db/dexie blocked-event handler wiring', () => {
    let dexieModule: typeof import('./dexie');

    beforeEach(async () => {
        // Reset the captured instances and the module's lazy-init `_db`
        // singleton so each test gets a fresh `createDb()` invocation.
        mockInstances.length = 0;
        vi.resetModules();
        dexieModule = await import('./dexie');
    });

    it('registers exactly one blocked listener on the Dexie instance', () => {
        dexieModule.getDb();

        expect(mockInstances).toHaveLength(1);
        const onCalls = mockInstances[0].on.mock.calls;
        const blockedCalls = onCalls.filter(([event]) => event === 'blocked');
        expect(blockedCalls).toHaveLength(1);
        expect(typeof blockedCalls[0][1]).toBe('function');
    });

    it('lazy-init: getDb returns the same instance across calls', () => {
        const a = dexieModule.getDb();
        const b = dexieModule.getDb();
        expect(a).toBe(b);
        expect(mockInstances).toHaveLength(1);
    });

    it('blocked event with no handler registered is a silent no-op (does not throw)', () => {
        dexieModule.getDb();
        const fire = mockInstances[0].blockedHandlers[0];
        // No setBlockedHandler call → fire must not throw, must not call
        // anything observable.
        expect(() => fire()).not.toThrow();
    });

    it('setBlockedHandler installs a handler that the blocked event invokes', () => {
        dexieModule.getDb();
        const handler = vi.fn();
        dexieModule.setBlockedHandler(handler);

        const fire = mockInstances[0].blockedHandlers[0];
        fire();

        expect(handler).toHaveBeenCalledOnce();
    });

    it('setBlockedHandler(null) detaches the handler (idempotent re-fire safe)', () => {
        dexieModule.getDb();
        const handler = vi.fn();
        dexieModule.setBlockedHandler(handler);
        // Reset because installing the handler can flush a pending event;
        // we want this case to test detach behavior in isolation.
        handler.mockReset();
        dexieModule.setBlockedHandler(null);

        const fire = mockInstances[0].blockedHandlers[0];
        fire();
        fire();

        expect(handler).not.toHaveBeenCalled();
    });

    it('latest setBlockedHandler call wins (replace, not stack)', () => {
        dexieModule.getDb();
        const first = vi.fn();
        const second = vi.fn();
        dexieModule.setBlockedHandler(first);
        dexieModule.setBlockedHandler(second);

        const fire = mockInstances[0].blockedHandlers[0];
        fire();

        expect(first).not.toHaveBeenCalled();
        expect(second).toHaveBeenCalledOnce();
    });

    it('handler throwing does not bubble out of the event dispatcher', () => {
        dexieModule.getDb();
        const handler = vi.fn(() => {
            throw new Error('showToast unavailable');
        });
        dexieModule.setBlockedHandler(handler);
        const fire = mockInstances[0].blockedHandlers[0];

        // Dexie would otherwise propagate the throw into the IDB upgrade
        // pipeline. The wrapper must catch + log so the user can still use
        // the app.
        const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        expect(() => fire()).not.toThrow();
        expect(errSpy).toHaveBeenCalled();
        errSpy.mockRestore();
    });

    it('multiple fires per handler installation collapse to a single notification', () => {
        dexieModule.getDb();
        const handler = vi.fn();
        dexieModule.setBlockedHandler(handler);
        const fire = mockInstances[0].blockedHandlers[0];

        fire();
        fire();
        fire();

        // Dexie can fire `blocked` repeatedly while another tab keeps the
        // older schema open; spamming the user with the same toast for
        // every retick is not what we want.
        expect(handler).toHaveBeenCalledOnce();
    });

    it('re-installing a handler resets the once-only gate so future events fire again', () => {
        dexieModule.getDb();
        const first = vi.fn();
        dexieModule.setBlockedHandler(first);
        const fire = mockInstances[0].blockedHandlers[0];
        fire();
        fire(); // collapsed
        expect(first).toHaveBeenCalledOnce();

        const second = vi.fn();
        dexieModule.setBlockedHandler(second);
        fire();
        // After replacement the new handler is "fresh" — same blocked
        // condition during a different session phase still notifies.
        expect(second).toHaveBeenCalledOnce();
    });

    it('blocked fired before any handler is installed flushes once on first install', () => {
        dexieModule.getDb();
        const fire = mockInstances[0].blockedHandlers[0];
        // Race: the IDB upgrade hits `blocked` before the consumer hook ran.
        fire();
        fire();

        const handler = vi.fn();
        dexieModule.setBlockedHandler(handler);

        // The pending fire is flushed exactly once; subsequent `fire`s on
        // the same handler are collapsed by the once-gate.
        expect(handler).toHaveBeenCalledOnce();
        fire();
        expect(handler).toHaveBeenCalledOnce();
    });

    it('pending fire survives a transient null install — the next real handler still flushes', () => {
        dexieModule.getDb();
        const fire = mockInstances[0].blockedHandlers[0];
        fire();

        // null detach must not throw and must not flush an absent handler.
        expect(() => dexieModule.setBlockedHandler(null)).not.toThrow();

        // Hold the pending fire until a real handler arrives. Otherwise a
        // hot-reload-induced unmount→remount cycle between IDB upgrade and
        // hook init could silently lose the only `blocked` event.
        const handler = vi.fn();
        dexieModule.setBlockedHandler(handler);
        expect(handler).toHaveBeenCalledOnce();
    });
});
