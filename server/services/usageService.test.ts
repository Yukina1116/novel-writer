import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    reserve,
    commit,
    cancel,
    getUsage,
    getUsageDocId,
    QuotaExceededError,
    DuplicateRequestError,
    ReservationNotFoundError,
    type UsageDoc,
} from './usageService';

// 仮想 Firestore: in-memory state を runTransaction が atomically 操作する。
// ServerTimestamp は文字列 'TIMESTAMP' に置換して構造比較を容易にする。
type DocStore = Map<string, Record<string, unknown>>;

const createMockFirestore = (initial?: Record<string, Record<string, unknown>>) => {
    const store: DocStore = new Map();
    if (initial) {
        for (const [k, v] of Object.entries(initial)) store.set(k, v);
    }

    const getDoc = (path: string) => store.get(path);

    const buildDocRef = (path: string) => ({
        _path: path,
    });

    type DocRef = ReturnType<typeof buildDocRef>;
    type Tx = {
        get: (ref: DocRef) => Promise<{ exists: boolean; data: () => Record<string, unknown> | undefined }>;
        set: (ref: DocRef, data: Record<string, unknown>) => void;
        update: (ref: DocRef, data: Record<string, unknown>) => void;
    };

    const db = {
        collection: (col: string) => ({
            doc: (id: string) => {
                const path = `${col}/${id}`;
                const ref = buildDocRef(path);
                return {
                    ...ref,
                    get: async () => ({
                        exists: store.has(path),
                        data: () => store.get(path),
                    }),
                };
            },
        }),
        runTransaction: async <T>(fn: (tx: Tx) => Promise<T>): Promise<T> => {
            // テスト用の単純実装。並列 transaction の競合再現は別途 Firestore Emulator
            // 統合テストで担保する想定（PR-F では mock で十分）。
            const tx: Tx = {
                get: async (ref) => ({
                    exists: store.has(ref._path),
                    data: () => store.get(ref._path),
                }),
                set: (ref, data) => {
                    store.set(ref._path, normalize(data));
                },
                update: (ref, data) => {
                    const existing = store.get(ref._path) ?? {};
                    store.set(ref._path, normalize({ ...existing, ...data }));
                },
            };
            return await fn(tx);
        },
    };

    return { db: db as unknown as Parameters<typeof reserve>[4], store, getDoc };
};

const normalize = (data: Record<string, unknown>): Record<string, unknown> => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(data)) {
        if (v && typeof v === 'object' && '_methodName' in (v as object)) {
            out[k] = 'TIMESTAMP';
        } else {
            out[k] = v;
        }
    }
    return out;
};

beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-15T10:00:00Z'));
});

describe('getUsageDocId', () => {
    it('formats uid_yyyymm in UTC', () => {
        expect(getUsageDocId('alice', new Date('2026-04-15T10:00:00Z'))).toBe('alice_202604');
        expect(getUsageDocId('bob', new Date('2026-12-01T00:00:00Z'))).toBe('bob_202612');
        expect(getUsageDocId('c', new Date('2027-01-01T00:00:00Z'))).toBe('c_202701');
    });

    it('zero-pads month', () => {
        expect(getUsageDocId('alice', new Date('2026-03-01T00:00:00Z'))).toBe('alice_202603');
    });
});

describe('reserve', () => {
    it('creates doc with reservedCost on first call (empty doc)', async () => {
        const { db, getDoc } = createMockFirestore();
        await reserve('alice', 'req-1', 200, 10000, db);
        const doc = getDoc('usage/alice_202604');
        expect(doc).toMatchObject({
            usedCost: 0,
            reservedCost: 200,
            reservations: { 'req-1': 200 },
            processedIds: [],
        });
    });

    it('accumulates reservedCost on second reserve with different requestId', async () => {
        const { db, getDoc } = createMockFirestore();
        await reserve('alice', 'req-1', 200, 10000, db);
        await reserve('alice', 'req-2', 100, 10000, db);
        const doc = getDoc('usage/alice_202604');
        expect(doc).toMatchObject({
            reservedCost: 300,
            reservations: { 'req-1': 200, 'req-2': 100 },
        });
    });

    it('throws DuplicateRequestError when requestId is in current reservations', async () => {
        const { db } = createMockFirestore();
        await reserve('alice', 'req-1', 200, 10000, db);
        await expect(reserve('alice', 'req-1', 200, 10000, db)).rejects.toBeInstanceOf(DuplicateRequestError);
    });

    it('throws DuplicateRequestError when requestId was already processed (committed)', async () => {
        const { db } = createMockFirestore({
            'usage/alice_202604': {
                usedCost: 200,
                reservedCost: 0,
                reservations: {},
                processedIds: ['req-1'],
            } satisfies UsageDoc,
        });
        await expect(reserve('alice', 'req-1', 100, 10000, db)).rejects.toBeInstanceOf(DuplicateRequestError);
    });

    it('throws QuotaExceededError when projected (used + reserved + estimated) > limit', async () => {
        const { db } = createMockFirestore({
            'usage/alice_202604': {
                usedCost: 9000,
                reservedCost: 500,
                reservations: { 'r-old': 500 },
                processedIds: [],
            } satisfies UsageDoc,
        });
        await expect(reserve('alice', 'req-1', 600, 10000, db)).rejects.toBeInstanceOf(QuotaExceededError);
    });

    it('allows reserve at exactly the limit boundary (used + reserved + estimated == limit)', async () => {
        const { db, getDoc } = createMockFirestore({
            'usage/alice_202604': {
                usedCost: 9000,
                reservedCost: 500,
                reservations: { 'r-old': 500 },
                processedIds: [],
            } satisfies UsageDoc,
        });
        await reserve('alice', 'req-1', 500, 10000, db);
        expect(getDoc('usage/alice_202604')).toMatchObject({
            reservedCost: 1000,
            reservations: { 'r-old': 500, 'req-1': 500 },
        });
    });

    it('rejects negative estimatedCost', async () => {
        const { db } = createMockFirestore();
        await expect(reserve('alice', 'req-1', -1, 10000, db)).rejects.toThrow('estimatedCost must be non-negative');
    });

    it('rejects negative limit', async () => {
        const { db } = createMockFirestore();
        await expect(reserve('alice', 'req-1', 100, -1, db)).rejects.toThrow('limit must be non-negative');
    });
});

describe('commit', () => {
    it('moves reservedCost to usedCost and removes reservation', async () => {
        const { db, getDoc } = createMockFirestore();
        const handle = await reserve('alice', 'req-1', 200, 10000, db);
        await commit('alice', 'req-1', 200, handle, db);
        expect(getDoc('usage/alice_202604')).toMatchObject({
            usedCost: 200,
            reservedCost: 0,
            reservations: {},
            processedIds: ['req-1'],
        });
    });

    it('actualCost can be less than reservedCost (refund)', async () => {
        const { db, getDoc } = createMockFirestore();
        const handle = await reserve('alice', 'req-1', 300, 10000, db);
        await commit('alice', 'req-1', 100, handle, db);
        expect(getDoc('usage/alice_202604')).toMatchObject({
            usedCost: 100,
            reservedCost: 0,
        });
    });

    it('throws ReservationNotFoundError when commit without reserve', async () => {
        const { db } = createMockFirestore();
        await expect(commit('alice', 'unknown', 100, undefined, db)).rejects.toBeInstanceOf(ReservationNotFoundError);
    });

    it('caps processedIds at MAX_PROCESSED_IDS (drops oldest)', async () => {
        const initialIds = Array.from({ length: 200 }, (_, i) => `r-${i}`);
        const { db, getDoc } = createMockFirestore({
            'usage/alice_202604': {
                usedCost: 0,
                reservedCost: 50,
                reservations: { 'req-new': 50 },
                processedIds: initialIds,
            } satisfies UsageDoc,
        });
        await commit('alice', 'req-new', 50, undefined, db);
        const doc = getDoc('usage/alice_202604') as Record<string, unknown>;
        const ids = doc.processedIds as string[];
        expect(ids).toHaveLength(200);
        expect(ids).not.toContain('r-0');
        expect(ids[ids.length - 1]).toBe('req-new');
    });
});

describe('cancel', () => {
    it('removes reservation and refunds reservedCost (no usedCost change)', async () => {
        const { db, getDoc } = createMockFirestore();
        const handle = await reserve('alice', 'req-1', 300, 10000, db);
        await cancel('alice', 'req-1', handle, db);
        expect(getDoc('usage/alice_202604')).toMatchObject({
            usedCost: 0,
            reservedCost: 0,
            reservations: {},
        });
    });

    it('is no-op when doc does not exist (idempotent)', async () => {
        const { db, getDoc } = createMockFirestore();
        await cancel('alice', 'unknown', undefined, db);
        expect(getDoc('usage/alice_202604')).toBeUndefined();
    });

    it('is no-op when reservation already gone (idempotent)', async () => {
        const { db, getDoc } = createMockFirestore({
            'usage/alice_202604': {
                usedCost: 100,
                reservedCost: 0,
                reservations: {},
                processedIds: ['req-1'],
            } satisfies UsageDoc,
        });
        await cancel('alice', 'req-1', undefined, db);
        expect(getDoc('usage/alice_202604')).toMatchObject({
            usedCost: 100,
            reservedCost: 0,
        });
    });
});

describe('reserve → AI succeeds → commit (happy path, no double charge)', () => {
    it('full lifecycle leaves only usedCost increment', async () => {
        const { db, getDoc } = createMockFirestore();
        const h1 = await reserve('alice', 'req-1', 200, 10000, db);
        await commit('alice', 'req-1', 200, h1, db);
        const h2 = await reserve('alice', 'req-2', 100, 10000, db);
        await commit('alice', 'req-2', 100, h2, db);
        expect(getDoc('usage/alice_202604')).toMatchObject({
            usedCost: 300,
            reservedCost: 0,
            reservations: {},
            processedIds: ['req-1', 'req-2'],
        });
    });
});

describe('reserve → AI fails → cancel (no charge)', () => {
    it('cancel restores reservedCost without affecting usedCost', async () => {
        const { db, getDoc } = createMockFirestore();
        await reserve('alice', 'req-1', 200, 10000, db);
        const h2 = await reserve('alice', 'req-2', 100, 10000, db);
        await cancel('alice', 'req-2', h2, db);
        expect(getDoc('usage/alice_202604')).toMatchObject({
            usedCost: 0,
            reservedCost: 200,
            reservations: { 'req-1': 200 },
        });
    });
});

describe('UTC month boundary (reserve→AI→commit/cancel cross-month resilience)', () => {
    it('commit uses reservation handle docId even after month rollover', async () => {
        const { db, getDoc } = createMockFirestore();
        // 4 月末 23:59:59 UTC で reserve
        vi.setSystemTime(new Date('2026-04-30T23:59:59Z'));
        const handle = await reserve('alice', 'req-1', 200, 10000, db);
        // AI 処理中に 5 月に突入
        vi.setSystemTime(new Date('2026-05-01T00:00:01Z'));
        await commit('alice', 'req-1', 200, handle, db);

        // 5 月 doc は作成されない、4 月 doc が確定済みになる
        expect(getDoc('usage/alice_202605')).toBeUndefined();
        expect(getDoc('usage/alice_202604')).toMatchObject({
            usedCost: 200,
            reservedCost: 0,
            reservations: {},
            processedIds: ['req-1'],
        });
    });

    it('cancel uses reservation handle docId even after month rollover', async () => {
        const { db, getDoc } = createMockFirestore();
        vi.setSystemTime(new Date('2026-04-30T23:59:59Z'));
        const handle = await reserve('alice', 'req-1', 200, 10000, db);
        vi.setSystemTime(new Date('2026-05-01T00:00:01Z'));
        await cancel('alice', 'req-1', handle, db);

        expect(getDoc('usage/alice_202605')).toBeUndefined();
        expect(getDoc('usage/alice_202604')).toMatchObject({
            usedCost: 0,
            reservedCost: 0,
            reservations: {},
        });
    });

    it('omitted handle falls back to current month (legacy behavior, may break across boundary)', async () => {
        // handle 省略時の挙動を契約として固定。withUsageQuota は必ず handle を渡す
        // 設計のため、ここでは「handle 未指定 → 現在時刻ベース」の挙動のみ検証する。
        const { db, getDoc } = createMockFirestore();
        vi.setSystemTime(new Date('2026-04-15T10:00:00Z'));
        await reserve('alice', 'req-1', 200, 10000, db);
        await commit('alice', 'req-1', 200, undefined, db);
        expect(getDoc('usage/alice_202604')).toMatchObject({ usedCost: 200, reservedCost: 0 });
    });
});

describe('getUsage', () => {
    it('returns empty doc when not initialized', async () => {
        const { db } = createMockFirestore();
        const usage = await getUsage('alice', db);
        expect(usage).toEqual({ usedCost: 0, reservedCost: 0, reservations: {}, processedIds: [] });
    });

    it('returns current state from Firestore', async () => {
        const { db } = createMockFirestore({
            'usage/alice_202604': {
                usedCost: 500,
                reservedCost: 100,
                reservations: { 'r1': 100 },
                processedIds: ['done-1'],
            } satisfies UsageDoc,
        });
        const usage = await getUsage('alice', db);
        expect(usage).toEqual({
            usedCost: 500,
            reservedCost: 100,
            reservations: { 'r1': 100 },
            processedIds: ['done-1'],
        });
    });
});
