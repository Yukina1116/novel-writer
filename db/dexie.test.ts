import { describe, it, expect, vi, beforeEach } from 'vitest';

// Capture the most recently constructed mock Dexie instance so each test can
// inspect the `on('blocked', ...)` registration that ran inside `createDb`.
const mockInstances: MockInstance[] = [];

interface MockInstance {
    on: ReturnType<typeof vi.fn>;
    versionCalls: Array<{ version: number; stores: Record<string, string> }>;
    /**
     * The wrapper Dexie hands to `instance.on('blocked', wrapper)` —
     * createDb passes `(event: IDBVersionChangeEvent) => fireBlocked(...)`.
     * Tests fire it with a synthesised event payload.
     */
    blockedListeners: Array<(event: IDBVersionChangeEvent) => void>;
}

const fakeEvent = (oldVersion = 1, newVersion: number | null = 2): IDBVersionChangeEvent =>
    ({ oldVersion, newVersion }) as unknown as IDBVersionChangeEvent;

vi.mock('dexie', () => {
    // Minimal Dexie shape the SUT relies on. `version()` returns a chainable
    // Version-like object whose `.stores()` records the call AND returns the
    // same chainable so multi-step `.version().stores().upgrade()` chains
    // (which the SUT may add later) don't crash. Asserting against
    // `versionCalls` from a test catches schema-declaration regressions.
    class MockDexie {
        constructor(_name: string) {
            const captured: MockInstance = {
                on: vi.fn((event: string, listener: (event: IDBVersionChangeEvent) => void) => {
                    if (event === 'blocked') {
                        captured.blockedListeners.push(listener);
                    }
                }),
                versionCalls: [],
                blockedListeners: [],
            };
            mockInstances.push(captured);
            const versionChain = (v: number) => {
                const chain = {
                    stores: (s: Record<string, string>) => {
                        captured.versionCalls.push({ version: v, stores: s });
                        return chain;
                    },
                    upgrade: () => chain,
                };
                return chain;
            };
            Object.assign(this, {
                on: captured.on,
                version: versionChain,
            });
        }
    }
    return { default: MockDexie };
});

describe('db/dexie', () => {
    let dexieModule: typeof import('./dexie');

    beforeEach(async () => {
        // Reset captured instances + module's lazy-init `_db` singleton so
        // each test gets a fresh `createDb()` invocation. fail-fast assert
        // catches a future top-level side effect that creates instances
        // before the test triggers getDb().
        mockInstances.length = 0;
        vi.resetModules();
        dexieModule = await import('./dexie');
        expect(mockInstances).toHaveLength(0);
    });

    describe('schema declaration (H10-followup-2)', () => {
        it('declares both v1 and v2 schemas with the expected store shapes', () => {
            dexieModule.getDb();

            const calls = mockInstances[0].versionCalls;
            expect(calls).toHaveLength(2);
            expect(calls[0].version).toBe(1);
            expect(calls[0].stores).toEqual({
                projects: 'id, lastModified',
                tutorialState: 'version',
                analysisHistory: 'key',
            });
            // v2 must include backupMeta on top of v1's stores. Dropping any
            // store or renaming a primary key would break upgrade for
            // existing users — pin the shape so a refactor is loud.
            expect(calls[1].version).toBe(2);
            expect(calls[1].stores).toEqual({
                projects: 'id, lastModified',
                tutorialState: 'version',
                analysisHistory: 'key',
                backupMeta: 'key',
            });
        });
    });

    describe('blocked-event handler wiring', () => {
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
            const fire = mockInstances[0].blockedListeners[0];
            expect(() => fire(fakeEvent())).not.toThrow();
        });

        it('setBlockedHandler installs a handler that the blocked event invokes with the IDB version payload', () => {
            dexieModule.getDb();
            const handler = vi.fn();
            dexieModule.setBlockedHandler(handler);

            const fire = mockInstances[0].blockedListeners[0];
            fire(fakeEvent(1, 2));

            expect(handler).toHaveBeenCalledOnce();
            // H10-followup-3: the wrapper must translate the raw
            // IDBVersionChangeEvent into a stable BlockedEventPayload so
            // future Dexie/IDB drift doesn't leak into consumers.
            expect(handler).toHaveBeenCalledWith({ oldVersion: 1, newVersion: 2 });
        });

        it('setBlockedHandler(null) detaches the handler (idempotent re-fire safe)', () => {
            dexieModule.getDb();
            const handler = vi.fn();
            dexieModule.setBlockedHandler(handler);
            handler.mockReset();
            dexieModule.setBlockedHandler(null);

            const fire = mockInstances[0].blockedListeners[0];
            fire(fakeEvent());
            fire(fakeEvent());

            expect(handler).not.toHaveBeenCalled();
        });

        it('latest setBlockedHandler call wins (replace, not stack)', () => {
            dexieModule.getDb();
            const first = vi.fn();
            const second = vi.fn();
            dexieModule.setBlockedHandler(first);
            dexieModule.setBlockedHandler(second);

            const fire = mockInstances[0].blockedListeners[0];
            fire(fakeEvent());

            expect(first).not.toHaveBeenCalled();
            expect(second).toHaveBeenCalledOnce();
        });

        it('handler throwing does not bubble out of the event dispatcher', () => {
            dexieModule.getDb();
            const handler = vi.fn(() => {
                throw new Error('showToast unavailable');
            });
            dexieModule.setBlockedHandler(handler);
            const fire = mockInstances[0].blockedListeners[0];

            const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
            expect(() => fire(fakeEvent())).not.toThrow();
            expect(errSpy).toHaveBeenCalled();
            errSpy.mockRestore();
        });

        it('multiple fires per handler installation collapse to a single notification', () => {
            dexieModule.getDb();
            const handler = vi.fn();
            dexieModule.setBlockedHandler(handler);
            const fire = mockInstances[0].blockedListeners[0];

            fire(fakeEvent());
            fire(fakeEvent());
            fire(fakeEvent());

            expect(handler).toHaveBeenCalledOnce();
        });

        it('re-installing a handler resets the once-only gate so future events fire again', () => {
            dexieModule.getDb();
            const first = vi.fn();
            dexieModule.setBlockedHandler(first);
            const fire = mockInstances[0].blockedListeners[0];
            fire(fakeEvent());
            fire(fakeEvent()); // collapsed
            expect(first).toHaveBeenCalledOnce();

            const second = vi.fn();
            dexieModule.setBlockedHandler(second);
            fire(fakeEvent());
            expect(second).toHaveBeenCalledOnce();
        });

        it('blocked fired before any handler is installed flushes the latest payload once on first install', () => {
            dexieModule.getDb();
            const fire = mockInstances[0].blockedListeners[0];
            // Race: the IDB upgrade hits `blocked` before the consumer hook ran.
            // We keep only the latest payload (most recent version numbers
            // are the useful ones), so flush should carry the second event's
            // shape, not the first.
            fire(fakeEvent(1, 2));
            fire(fakeEvent(2, 3));

            const handler = vi.fn();
            dexieModule.setBlockedHandler(handler);

            expect(handler).toHaveBeenCalledOnce();
            expect(handler).toHaveBeenCalledWith({ oldVersion: 2, newVersion: 3 });
            fire(fakeEvent());
            expect(handler).toHaveBeenCalledOnce();
        });

        it('pending fire survives a transient null install — the next real handler still flushes', () => {
            dexieModule.getDb();
            const fire = mockInstances[0].blockedListeners[0];
            fire(fakeEvent(5, 6));

            expect(() => dexieModule.setBlockedHandler(null)).not.toThrow();

            const handler = vi.fn();
            dexieModule.setBlockedHandler(handler);
            expect(handler).toHaveBeenCalledOnce();
            expect(handler).toHaveBeenCalledWith({ oldVersion: 5, newVersion: 6 });
        });
    });
});
