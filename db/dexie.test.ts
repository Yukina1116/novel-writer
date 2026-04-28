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
});
