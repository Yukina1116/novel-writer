import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// Firebase Admin SDK を mock。verifyIdToken / Firestore.runTransaction を捕捉して
// route の payload 構築（tx.set / tx.update への引数）を直接 assert する。
const verifyIdTokenMock = vi.fn();
const runTransactionMock = vi.fn();
const docMock = vi.fn();
const collectionMock = vi.fn(() => ({ doc: docMock }));

vi.mock('../firebaseAdmin', () => ({
    getFirebaseAuth: () => ({
        verifyIdToken: (token: string) => verifyIdTokenMock(token),
    }),
    getFirebaseFirestore: () => ({
        collection: collectionMock,
        runTransaction: runTransactionMock,
    }),
}));

// firebase-admin/firestore の FieldValue.serverTimestamp() は本物を呼ぶと credential が
// 必要になるため、固定 sentinel を返す stub に差し替える。
// Timestamp は instanceof チェック用に最小限の class を提供する (toDate() を持つ shape)。
const SERVER_TIMESTAMP_SENTINEL = Symbol('SERVER_TIMESTAMP');
class FakeTimestamp {
    constructor(private readonly date: Date) {}
    toDate(): Date {
        return this.date;
    }
    static fromDate(date: Date): FakeTimestamp {
        return new FakeTimestamp(date);
    }
}
vi.mock('firebase-admin/firestore', () => ({
    FieldValue: {
        serverTimestamp: () => SERVER_TIMESTAMP_SENTINEL,
    },
    Timestamp: FakeTimestamp,
}));

const usersRouter = (await import('./users')).default;
const { logger } = await import('../utils/logger');

const buildApp = () => {
    const app = express();
    app.use(express.json());
    app.use('/api/users', usersRouter);
    return app;
};

type CapturedTxOps = {
    setCalls: Array<{ ref: unknown; data: Record<string, unknown> }>;
    updateCalls: Array<{ ref: unknown; data: Record<string, unknown> }>;
    getReturns: { exists: boolean };
};

type TxStub = {
    get: ReturnType<typeof vi.fn>;
    set: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
};

const buildTxStub = (
    existingDoc: boolean,
    existingData: Record<string, unknown> = {},
): { tx: TxStub; captured: CapturedTxOps } => {
    const captured: CapturedTxOps = {
        setCalls: [],
        updateCalls: [],
        getReturns: { exists: existingDoc },
    };
    const tx: TxStub = {
        get: vi.fn(async () => ({
            exists: existingDoc,
            data: () => (existingDoc ? existingData : undefined),
        })),
        set: vi.fn((ref: unknown, data: Record<string, unknown>) => {
            captured.setCalls.push({ ref, data });
        }),
        update: vi.fn((ref: unknown, data: Record<string, unknown>) => {
            captured.updateCalls.push({ ref, data });
        }),
    };
    return { tx, captured };
};

describe('POST /api/users/init', () => {
    beforeEach(() => {
        verifyIdTokenMock.mockReset();
        runTransactionMock.mockReset();
        docMock.mockReset();
        collectionMock.mockClear();
    });

    describe('D.4.4 — Authorization absent', () => {
        it('returns 401 when no Authorization header is sent', async () => {
            const app = buildApp();
            const res = await request(app).post('/api/users/init');
            expect(res.status).toBe(401);
            expect(res.body).toMatchObject({ success: false });
        });
    });

    describe('D.4.1 — new uid creates full doc with 6 fields (M7-α: termsAcceptedAt + termsVersion 追加)', () => {
        it('calls tx.set with {email, plan, createdAt, updatedAt, termsAcceptedAt: null, termsVersion: null}', async () => {
            verifyIdTokenMock.mockResolvedValueOnce({ uid: 'new-user-1', email: 'new@example.com' });
            const refSentinel = { __ref: 'users/new-user-1' };
            docMock.mockReturnValueOnce(refSentinel);
            const { tx, captured } = buildTxStub(false);
            runTransactionMock.mockImplementationOnce(async (fn: (tx: TxStub) => Promise<unknown>) => fn(tx));

            const res = await request(buildApp())
                .post('/api/users/init')
                .set('Authorization', 'Bearer valid-token');

            expect(res.status).toBe(200);
            expect(res.body).toMatchObject({
                success: true,
                user: {
                    plan: 'free',
                    termsAcceptedAt: null,
                    termsVersion: null,
                },
                currentTermsVersion: expect.any(String),
            });
            expect(captured.setCalls).toHaveLength(1);
            expect(captured.updateCalls).toHaveLength(0);

            const [setCall] = captured.setCalls;
            expect(setCall.ref).toBe(refSentinel);
            expect(Object.keys(setCall.data).sort()).toEqual([
                'createdAt',
                'email',
                'plan',
                'termsAcceptedAt',
                'termsVersion',
                'updatedAt',
            ]);
            expect(setCall.data.email).toBe('new@example.com');
            expect(setCall.data.plan).toBe('free');
            expect(setCall.data.createdAt).toBe(SERVER_TIMESTAMP_SENTINEL);
            expect(setCall.data.updatedAt).toBe(SERVER_TIMESTAMP_SENTINEL);
            // M7-α: 新規ユーザーは未同意状態で作成
            expect(setCall.data.termsAcceptedAt).toBeNull();
            expect(setCall.data.termsVersion).toBeNull();
        });
    });

    describe('D.4.2 + D.4.3 — existing uid: tx.update payload excludes createdAt, plan, terms* (Partial Update assertion)', () => {
        it('calls tx.update with only {email, updatedAt} (no createdAt/plan/terms*)', async () => {
            verifyIdTokenMock.mockResolvedValueOnce({ uid: 'existing-user', email: 'old@example.com' });
            const refSentinel = { __ref: 'users/existing-user' };
            docMock.mockReturnValueOnce(refSentinel);
            const acceptedAt = FakeTimestamp.fromDate(new Date('2026-04-28T00:00:00Z'));
            const { tx, captured } = buildTxStub(true, {
                termsAcceptedAt: acceptedAt,
                termsVersion: '2026-04-28',
            });
            runTransactionMock.mockImplementationOnce(async (fn: (tx: TxStub) => Promise<unknown>) => fn(tx));

            const res = await request(buildApp())
                .post('/api/users/init')
                .set('Authorization', 'Bearer valid-token');

            expect(res.status).toBe(200);
            expect(res.body).toMatchObject({
                success: true,
                user: {
                    plan: 'free',
                    termsAcceptedAt: '2026-04-28T00:00:00.000Z',
                    termsVersion: '2026-04-28',
                },
            });
            expect(captured.updateCalls).toHaveLength(1);
            expect(captured.setCalls).toHaveLength(0);

            const [updateCall] = captured.updateCalls;
            expect(updateCall.ref).toBe(refSentinel);
            // CLAUDE.md MUST #5 Partial Update assertion: 既存値を上書きするフィールドが含まれないこと
            expect(Object.prototype.hasOwnProperty.call(updateCall.data, 'createdAt')).toBe(false);
            expect(Object.prototype.hasOwnProperty.call(updateCall.data, 'plan')).toBe(false);
            expect(Object.prototype.hasOwnProperty.call(updateCall.data, 'termsAcceptedAt')).toBe(false);
            expect(Object.prototype.hasOwnProperty.call(updateCall.data, 'termsVersion')).toBe(false);
            expect(Object.keys(updateCall.data).sort()).toEqual(['email', 'updatedAt']);
            expect(updateCall.data.email).toBe('old@example.com');
            expect(updateCall.data.updatedAt).toBe(SERVER_TIMESTAMP_SENTINEL);
        });

        it('returns null termsAcceptedAt/termsVersion when existing doc has neither (legacy 経路)', async () => {
            verifyIdTokenMock.mockResolvedValueOnce({ uid: 'legacy-user', email: 'legacy@example.com' });
            docMock.mockReturnValueOnce({});
            const { tx } = buildTxStub(true, {});
            runTransactionMock.mockImplementationOnce(async (fn: (tx: TxStub) => Promise<unknown>) => fn(tx));

            const res = await request(buildApp())
                .post('/api/users/init')
                .set('Authorization', 'Bearer valid-token');

            expect(res.status).toBe(200);
            expect(res.body).toMatchObject({
                success: true,
                user: { termsAcceptedAt: null, termsVersion: null },
            });
        });
    });

    describe('D.4 boundary — invalid email claim', () => {
        it('returns 400 when ID token has empty email claim', async () => {
            verifyIdTokenMock.mockResolvedValueOnce({ uid: 'no-email-user', email: '' });
            const res = await request(buildApp())
                .post('/api/users/init')
                .set('Authorization', 'Bearer valid-token');
            expect(res.status).toBe(400);
            expect(res.body).toMatchObject({ success: false });
            expect(runTransactionMock).not.toHaveBeenCalled();
        });

        it('returns 400 when ID token has missing email claim', async () => {
            verifyIdTokenMock.mockResolvedValueOnce({ uid: 'no-email-user' });
            const res = await request(buildApp())
                .post('/api/users/init')
                .set('Authorization', 'Bearer valid-token');
            expect(res.status).toBe(400);
            expect(runTransactionMock).not.toHaveBeenCalled();
        });
    });

    describe('D.4.5 — Firestore error classification', () => {
        const transientCases = [
            { name: 'UNAVAILABLE (string)', code: 'UNAVAILABLE' },
            { name: 'DEADLINE_EXCEEDED (string)', code: 'DEADLINE_EXCEEDED' },
            { name: 'gRPC code 14 (UNAVAILABLE)', code: 14 },
            { name: 'gRPC code 4 (DEADLINE_EXCEEDED)', code: 4 },
        ];

        for (const { name, code } of transientCases) {
            it(`returns 503 for transient Firestore error: ${name}`, async () => {
                verifyIdTokenMock.mockResolvedValueOnce({ uid: 'u', email: 'a@example.com' });
                docMock.mockReturnValueOnce({});
                runTransactionMock.mockRejectedValueOnce(Object.assign(new Error('firestore down'), { code }));

                const res = await request(buildApp())
                    .post('/api/users/init')
                    .set('Authorization', 'Bearer valid-token');

                expect(res.status).toBe(503);
                expect(res.body).toMatchObject({ success: false });
            });
        }

        it('logs uid context before generic handleApiError log (forensic trail)', async () => {
            const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
            verifyIdTokenMock.mockResolvedValueOnce({ uid: 'forensic-uid', email: 'a@example.com' });
            docMock.mockReturnValueOnce({});
            runTransactionMock.mockRejectedValueOnce(Object.assign(new Error('firestore down'), { code: 'UNAVAILABLE' }));

            await request(buildApp())
                .post('/api/users/init')
                .set('Authorization', 'Bearer valid-token');

            expect(errorSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: 'users/init failed',
                    uid: 'forensic-uid',
                }),
            );
            errorSpy.mockRestore();
        });

        it('returns 500 for permanent Firestore error (unknown code)', async () => {
            verifyIdTokenMock.mockResolvedValueOnce({ uid: 'u', email: 'a@example.com' });
            docMock.mockReturnValueOnce({});
            runTransactionMock.mockRejectedValueOnce(Object.assign(new Error('boom'), { code: 'INVALID_ARGUMENT' }));

            const res = await request(buildApp())
                .post('/api/users/init')
                .set('Authorization', 'Bearer valid-token');

            expect(res.status).toBe(500);
            expect(res.body).toMatchObject({ success: false });
        });

        it('returns 500 for plain Error without code', async () => {
            verifyIdTokenMock.mockResolvedValueOnce({ uid: 'u', email: 'a@example.com' });
            docMock.mockReturnValueOnce({});
            runTransactionMock.mockRejectedValueOnce(new Error('something went wrong'));

            const res = await request(buildApp())
                .post('/api/users/init')
                .set('Authorization', 'Bearer valid-token');

            expect(res.status).toBe(500);
        });
    });
});

describe('POST /api/users/accept-terms (M7-α)', () => {
    const TERMS_VERSION = '2026-04-28';

    beforeEach(() => {
        verifyIdTokenMock.mockReset();
        runTransactionMock.mockReset();
        docMock.mockReset();
        collectionMock.mockClear();
    });

    it('returns 401 when no Authorization header is sent', async () => {
        const app = buildApp();
        const res = await request(app).post('/api/users/accept-terms').send({ termsVersion: TERMS_VERSION });
        expect(res.status).toBe(401);
    });

    it('returns 400 when termsVersion is missing in body', async () => {
        verifyIdTokenMock.mockResolvedValueOnce({ uid: 'u', email: 'a@example.com' });
        const res = await request(buildApp())
            .post('/api/users/accept-terms')
            .set('Authorization', 'Bearer valid-token')
            .send({});
        expect(res.status).toBe(400);
        expect(res.body).toMatchObject({ success: false });
    });

    it('returns 400 when termsVersion is empty string', async () => {
        verifyIdTokenMock.mockResolvedValueOnce({ uid: 'u', email: 'a@example.com' });
        const res = await request(buildApp())
            .post('/api/users/accept-terms')
            .set('Authorization', 'Bearer valid-token')
            .send({ termsVersion: '' });
        expect(res.status).toBe(400);
    });

    it('returns 409 with code TERMS_VERSION_MISMATCH when client sends old version', async () => {
        verifyIdTokenMock.mockResolvedValueOnce({ uid: 'u', email: 'a@example.com' });
        const res = await request(buildApp())
            .post('/api/users/accept-terms')
            .set('Authorization', 'Bearer valid-token')
            .send({ termsVersion: '2025-01-01' });
        expect(res.status).toBe(409);
        expect(res.body).toMatchObject({
            success: false,
            code: 'TERMS_VERSION_MISMATCH',
            currentTermsVersion: TERMS_VERSION,
        });
    });

    it('returns 409 with code USER_DOC_MISSING when users doc not yet initialized', async () => {
        verifyIdTokenMock.mockResolvedValueOnce({ uid: 'no-init-user', email: 'a@example.com' });
        docMock.mockReturnValueOnce({});
        const { tx } = buildTxStub(false);
        runTransactionMock.mockImplementationOnce(async (fn: (tx: TxStub) => Promise<unknown>) => fn(tx));

        const res = await request(buildApp())
            .post('/api/users/accept-terms')
            .set('Authorization', 'Bearer valid-token')
            .send({ termsVersion: TERMS_VERSION });

        expect(res.status).toBe(409);
        expect(res.body).toMatchObject({
            success: false,
            code: 'USER_DOC_MISSING',
        });
    });

    it('updates termsAcceptedAt + termsVersion + updatedAt in transaction (Partial Update assertion: createdAt/plan/email 不在)', async () => {
        verifyIdTokenMock.mockResolvedValueOnce({ uid: 'accept-user', email: 'a@example.com' });
        const refSentinel = { __ref: 'users/accept-user' };
        const refGetMock = vi.fn(async () => ({
            data: () => ({
                termsAcceptedAt: FakeTimestamp.fromDate(new Date('2026-04-28T12:00:00Z')),
            }),
        }));
        docMock.mockReturnValueOnce(Object.assign(refSentinel, { get: refGetMock }));
        const { tx, captured } = buildTxStub(true, {});
        runTransactionMock.mockImplementationOnce(async (fn: (tx: TxStub) => Promise<unknown>) => fn(tx));

        const res = await request(buildApp())
            .post('/api/users/accept-terms')
            .set('Authorization', 'Bearer valid-token')
            .send({ termsVersion: TERMS_VERSION });

        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({
            success: true,
            termsAcceptedAt: '2026-04-28T12:00:00.000Z',
            termsVersion: TERMS_VERSION,
        });
        expect(captured.updateCalls).toHaveLength(1);
        const [updateCall] = captured.updateCalls;
        // termsAcceptedAt / termsVersion / updatedAt のみ書込み (Partial Update assertion)
        expect(Object.keys(updateCall.data).sort()).toEqual([
            'termsAcceptedAt',
            'termsVersion',
            'updatedAt',
        ]);
        expect(Object.prototype.hasOwnProperty.call(updateCall.data, 'createdAt')).toBe(false);
        expect(Object.prototype.hasOwnProperty.call(updateCall.data, 'plan')).toBe(false);
        expect(Object.prototype.hasOwnProperty.call(updateCall.data, 'email')).toBe(false);
        expect(updateCall.data.termsAcceptedAt).toBe(SERVER_TIMESTAMP_SENTINEL);
        expect(updateCall.data.termsVersion).toBe(TERMS_VERSION);
        expect(updateCall.data.updatedAt).toBe(SERVER_TIMESTAMP_SENTINEL);
    });

    it('returns 503 for transient Firestore error (UNAVAILABLE)', async () => {
        verifyIdTokenMock.mockResolvedValueOnce({ uid: 'u', email: 'a@example.com' });
        docMock.mockReturnValueOnce({});
        runTransactionMock.mockRejectedValueOnce(Object.assign(new Error('firestore down'), { code: 'UNAVAILABLE' }));

        const res = await request(buildApp())
            .post('/api/users/accept-terms')
            .set('Authorization', 'Bearer valid-token')
            .send({ termsVersion: TERMS_VERSION });

        expect(res.status).toBe(503);
    });

    it('logs uid context on failure (forensic trail)', async () => {
        const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
        verifyIdTokenMock.mockResolvedValueOnce({ uid: 'forensic-accept', email: 'a@example.com' });
        docMock.mockReturnValueOnce({});
        runTransactionMock.mockRejectedValueOnce(Object.assign(new Error('boom'), { code: 'INTERNAL' }));

        await request(buildApp())
            .post('/api/users/accept-terms')
            .set('Authorization', 'Bearer valid-token')
            .send({ termsVersion: TERMS_VERSION });

        expect(errorSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'users/accept-terms failed',
                uid: 'forensic-accept',
            }),
        );
        errorSpy.mockRestore();
    });
});
