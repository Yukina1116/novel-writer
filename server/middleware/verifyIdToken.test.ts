import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

const verifyIdTokenMock = vi.fn();
vi.mock('../firebaseAdmin', () => ({
    getFirebaseAuth: () => ({
        verifyIdToken: (token: string) => verifyIdTokenMock(token),
    }),
}));

const { verifyIdToken } = await import('./verifyIdToken');

type MockRes = Response & {
    statusCode: number;
    body: unknown;
    _status: ReturnType<typeof vi.fn>;
    _json: ReturnType<typeof vi.fn>;
};

const buildRes = (): MockRes => {
    const res = {
        statusCode: 0,
        body: undefined as unknown,
    } as MockRes;
    res._status = vi.fn((code: number) => {
        res.statusCode = code;
        return res;
    });
    res._json = vi.fn((payload: unknown) => {
        res.body = payload;
        return res;
    });
    (res as unknown as Response).status = res._status as unknown as Response['status'];
    (res as unknown as Response).json = res._json as unknown as Response['json'];
    return res;
};

const buildReq = (header?: string): Request => {
    return { headers: { authorization: header } } as unknown as Request;
};

describe('verifyIdToken middleware', () => {
    let next: NextFunction;

    beforeEach(() => {
        verifyIdTokenMock.mockReset();
        next = vi.fn();
    });

    describe('Authorization header validation', () => {
        it('returns 401 when Authorization header is missing', async () => {
            const req = buildReq(undefined);
            const res = buildRes();
            await verifyIdToken(req, res, next);
            expect(res.statusCode).toBe(401);
            expect(res.body).toMatchObject({ success: false });
            expect(next).not.toHaveBeenCalled();
        });

        it('returns 401 when header does not start with "Bearer "', async () => {
            const req = buildReq('Token abcdef');
            const res = buildRes();
            await verifyIdToken(req, res, next);
            expect(res.statusCode).toBe(401);
            expect(next).not.toHaveBeenCalled();
        });

        it('returns 401 when bearer token is empty', async () => {
            const req = buildReq('Bearer    ');
            const res = buildRes();
            await verifyIdToken(req, res, next);
            expect(res.statusCode).toBe(401);
            expect(next).not.toHaveBeenCalled();
        });
    });

    describe('successful verification', () => {
        it('injects req.user and calls next() when token is valid', async () => {
            verifyIdTokenMock.mockResolvedValueOnce({ uid: 'user-1', email: 'a@example.com' });
            const req = buildReq('Bearer valid-token');
            const res = buildRes();
            await verifyIdToken(req, res, next);
            expect(req.user).toEqual({ uid: 'user-1', email: 'a@example.com' });
            expect(next).toHaveBeenCalledTimes(1);
            expect(res._status).not.toHaveBeenCalled();
        });

        it('coerces missing email claim to null', async () => {
            verifyIdTokenMock.mockResolvedValueOnce({ uid: 'user-2' });
            const req = buildReq('Bearer valid-token');
            const res = buildRes();
            await verifyIdToken(req, res, next);
            expect(req.user).toEqual({ uid: 'user-2', email: null });
            expect(next).toHaveBeenCalledTimes(1);
        });
    });

    describe('permanent errors → 401', () => {
        const permanentCases = [
            { name: 'auth/argument-error', err: { code: 'auth/argument-error', message: 'invalid' } },
            { name: 'auth/id-token-expired', err: { code: 'auth/id-token-expired', message: 'expired' } },
            { name: 'auth/id-token-revoked', err: { code: 'auth/id-token-revoked', message: 'revoked' } },
            { name: 'plain Error', err: new Error('not a firebase error') },
            { name: 'unknown code', err: { code: 'something/else' } },
        ];

        for (const { name, err } of permanentCases) {
            it(`returns 401 for ${name}`, async () => {
                verifyIdTokenMock.mockRejectedValueOnce(err);
                const req = buildReq('Bearer t');
                const res = buildRes();
                await verifyIdToken(req, res, next);
                expect(res.statusCode).toBe(401);
                expect(res.body).toMatchObject({ success: false, error: 'Invalid or expired token' });
                expect(next).not.toHaveBeenCalled();
            });
        }
    });

    describe('transient errors → 503', () => {
        // FirebaseAuthError instance のモックは constructor 制約があるため、
        // production code 側は instanceof 判定の他に string code 判定 fallback も持つ。
        // 本テストでは string code 経路を中心に検証する（fallback パスが正しく動くこと）。
        const transientAuthCodes = [
            'auth/internal-error',
            'auth/network-request-failed',
            'auth/service-unavailable',
            'app/network-error',
        ];
        const transientNetworkCodes = ['ETIMEDOUT', 'ECONNRESET', 'ENOTFOUND', 'ECONNREFUSED', 'EAI_AGAIN'];

        for (const code of [...transientAuthCodes, ...transientNetworkCodes]) {
            it(`returns 503 for code "${code}"`, async () => {
                verifyIdTokenMock.mockRejectedValueOnce({ code, message: `simulated ${code}` });
                const req = buildReq('Bearer t');
                const res = buildRes();
                await verifyIdToken(req, res, next);
                expect(res.statusCode).toBe(503);
                expect(res.body).toMatchObject({ success: false, error: 'Auth service temporarily unavailable' });
                expect(next).not.toHaveBeenCalled();
            });
        }
    });
});
