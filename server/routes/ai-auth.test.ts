import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// 全 AI service を no-op mock。middleware 段で 401 reject される前提なので、
// service が実呼び出しされた場合 (= middleware が機能していない) はテストが
// service mock を「呼ばれていない」と assert する経路で検出する。
const generateNovelContinuationMock = vi.fn();
const updateCharacterDataMock = vi.fn();
const generateCharacterReplyMock = vi.fn();
const generateCharacterImagePromptMock = vi.fn();
const updateWorldDataMock = vi.fn();
const generateWorldReplyMock = vi.fn();
const generateImageMock = vi.fn();
const generateNamesMock = vi.fn();
const generateKnowledgeNameMock = vi.fn();
const extractCharacterInfoMock = vi.fn();
const analyzeTextForImportMock = vi.fn();

vi.mock('../services/novelService', () => ({
    generateNovelContinuation: (body: unknown) => generateNovelContinuationMock(body),
}));
vi.mock('../services/characterService', () => ({
    updateCharacterData: (...args: unknown[]) => updateCharacterDataMock(...args),
    generateCharacterReply: (...args: unknown[]) => generateCharacterReplyMock(...args),
    generateCharacterImagePrompt: (...args: unknown[]) => generateCharacterImagePromptMock(...args),
}));
vi.mock('../services/worldService', () => ({
    updateWorldData: (...args: unknown[]) => updateWorldDataMock(...args),
    generateWorldReply: (...args: unknown[]) => generateWorldReplyMock(...args),
}));
vi.mock('../services/imageService', () => ({
    generateImage: (...args: unknown[]) => generateImageMock(...args),
}));
vi.mock('../services/utilityService', () => ({
    generateNames: (...args: unknown[]) => generateNamesMock(...args),
    generateKnowledgeName: (...args: unknown[]) => generateKnowledgeNameMock(...args),
    extractCharacterInfo: (...args: unknown[]) => extractCharacterInfoMock(...args),
}));
vi.mock('../services/analysisService', () => ({
    analyzeTextForImport: (...args: unknown[]) => analyzeTextForImportMock(...args),
}));

// usageService を vi.mock で差し替え。reserve/commit/cancel の挙動はテスト個別で
// 制御し、本テスト群では「middleware (verifyIdToken) と withUsageQuota の連携」を
// 検証する。reserve 失敗 / commit 失敗 / cancel フローの単体検証は
// usageService.test.ts / withUsageQuota の挙動テストに分離する。
//
// importOriginal で本物のエラークラスを引き継ぐ。test 内でクラスを再定義すると
// withUsageQuota の `instanceof QuotaExceededError` が runtime で false になり
// silent に 500 経路に落ちる事故を防ぐ。
const reserveMock = vi.fn();
const commitMock = vi.fn();
const cancelMock = vi.fn();
vi.mock('../services/usageService', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../services/usageService')>();
    return {
        ...actual,
        reserve: (...args: unknown[]) => reserveMock(...args),
        commit: (...args: unknown[]) => commitMock(...args),
        cancel: (...args: unknown[]) => cancelMock(...args),
    };
});

// firebaseAdmin の getFirebaseAuth は verifyIdToken middleware が import 時に解決する。
// emulator 不要なテスト環境でも動くよう vi.mock で stub。
const verifyIdTokenSdkMock = vi.fn();
vi.mock('../firebaseAdmin', () => ({
    getFirebaseAuth: () => ({
        verifyIdToken: (token: string) => verifyIdTokenSdkMock(token),
    }),
    getFirebaseFirestore: () => ({}),
}));

const { mountAiRoutes } = await import('../aiRoutes');

// rate limit は認証ゲート挙動と直交するのでテストでは pre-middleware なしで mount。
const buildApp = () => {
    const app = express();
    app.use(express.json());
    mountAiRoutes(app);
    return app;
};

const allServiceMocks = [
    generateNovelContinuationMock,
    updateCharacterDataMock,
    generateCharacterReplyMock,
    generateCharacterImagePromptMock,
    updateWorldDataMock,
    generateWorldReplyMock,
    generateImageMock,
    generateNamesMock,
    generateKnowledgeNameMock,
    extractCharacterInfoMock,
    analyzeTextForImportMock,
];

const REQ_ID = 'test-request-id-0001';

const aiEndpoints: ReadonlyArray<{ method: 'post'; path: string; body: Record<string, unknown> }> = [
    { method: 'post', path: '/api/ai/novel/generate', body: { requestId: REQ_ID } },
    { method: 'post', path: '/api/ai/character/update', body: { requestId: REQ_ID, chatHistory: [], currentCharacterData: {}, intent: 'create' } },
    { method: 'post', path: '/api/ai/character/reply', body: { requestId: REQ_ID, updatedCharacterData: {} } },
    { method: 'post', path: '/api/ai/character/image-prompt', body: { requestId: REQ_ID, chatHistory: [] } },
    { method: 'post', path: '/api/ai/world/update', body: { requestId: REQ_ID, chatHistory: [], currentWorldData: {}, intent: 'create' } },
    { method: 'post', path: '/api/ai/world/reply', body: { requestId: REQ_ID, updatedWorldData: {} } },
    { method: 'post', path: '/api/ai/image/generate', body: { requestId: REQ_ID, prompt: 'test' } },
    { method: 'post', path: '/api/ai/utility/names', body: { requestId: REQ_ID, category: 'human', keywords: 'foo' } },
    { method: 'post', path: '/api/ai/utility/knowledge-name', body: { requestId: REQ_ID, sentence: 'foo' } },
    { method: 'post', path: '/api/ai/utility/extract-character', body: { requestId: REQ_ID, characterName: 'A', novelContent: 'x' } },
    { method: 'post', path: '/api/ai/analysis/import', body: { requestId: REQ_ID, importedText: 'x', existingCharacters: [], existingWorldSettings: [], existingKnowledge: [] } },
];

describe('/api/ai/* requires Authorization Bearer ID Token', () => {
    beforeEach(() => {
        verifyIdTokenSdkMock.mockReset();
        reserveMock.mockReset();
        commitMock.mockReset();
        cancelMock.mockReset();
        for (const m of allServiceMocks) m.mockReset();
    });

    describe('Authorization absent → 401 (全 11 endpoint)', () => {
        for (const { method, path, body } of aiEndpoints) {
            it(`${method.toUpperCase()} ${path} returns 401 when no Authorization header`, async () => {
                const app = buildApp();
                const res = await request(app)[method](path).send(body);
                expect(res.status).toBe(401);
                expect(res.body).toMatchObject({ success: false });
                // middleware で reject されたので usage / service は呼ばれない
                expect(reserveMock).not.toHaveBeenCalled();
                for (const m of allServiceMocks) {
                    expect(m).not.toHaveBeenCalled();
                }
            });
        }
    });

    describe('Authorization malformed → 401', () => {
        it('rejects "Token <id>" (missing Bearer prefix)', async () => {
            const res = await request(buildApp())
                .post('/api/ai/utility/names')
                .set('Authorization', 'Token foo')
                .send({ requestId: REQ_ID, category: 'human', keywords: 'x' });
            expect(res.status).toBe(401);
            expect(generateNamesMock).not.toHaveBeenCalled();
            expect(reserveMock).not.toHaveBeenCalled();
        });

        it('rejects empty bearer token', async () => {
            const res = await request(buildApp())
                .post('/api/ai/utility/names')
                .set('Authorization', 'Bearer    ')
                .send({ requestId: REQ_ID, category: 'human', keywords: 'x' });
            expect(res.status).toBe(401);
            expect(generateNamesMock).not.toHaveBeenCalled();
            expect(reserveMock).not.toHaveBeenCalled();
        });
    });

    describe('Authorization present + valid token → reserve → service → commit', () => {
        it('passes through to service when Bearer token verifies and reserve succeeds', async () => {
            verifyIdTokenSdkMock.mockResolvedValueOnce({ uid: 'u1', email: 'a@example.com' });
            const handle = { reservedAt: new Date('2026-04-15T10:00:00Z') };
            reserveMock.mockResolvedValueOnce(handle);
            commitMock.mockResolvedValueOnce(undefined);
            generateNamesMock.mockResolvedValueOnce(['name-1', 'name-2']);

            const res = await request(buildApp())
                .post('/api/ai/utility/names')
                .set('Authorization', 'Bearer valid-token')
                .send({ requestId: REQ_ID, category: 'human', keywords: 'foo' });

            expect(res.status).toBe(200);
            expect(res.body).toEqual({ success: true, data: ['name-1', 'name-2'] });
            expect(reserveMock).toHaveBeenCalledWith('u1', REQ_ID, 50, 10000);
            expect(generateNamesMock).toHaveBeenCalledTimes(1);
            // commit/cancel は reserve の返した handle を必ず渡す（月境界耐性の契約）
            expect(commitMock).toHaveBeenCalledWith('u1', REQ_ID, 50, handle);
            expect(cancelMock).not.toHaveBeenCalled();
        });

        it('returns 400 when requestId is missing', async () => {
            verifyIdTokenSdkMock.mockResolvedValueOnce({ uid: 'u1', email: 'a@example.com' });
            const res = await request(buildApp())
                .post('/api/ai/utility/names')
                .set('Authorization', 'Bearer valid-token')
                .send({ category: 'human', keywords: 'foo' });
            expect(res.status).toBe(400);
            expect(res.body).toMatchObject({ success: false, code: 'INVALID_REQUEST_ID' });
            expect(reserveMock).not.toHaveBeenCalled();
            expect(generateNamesMock).not.toHaveBeenCalled();
        });

        it('returns 429 with QUOTA_EXCEEDED when reserve throws QuotaExceededError', async () => {
            verifyIdTokenSdkMock.mockResolvedValueOnce({ uid: 'u1', email: 'a@example.com' });
            const { QuotaExceededError } = await import('../services/usageService');
            reserveMock.mockRejectedValueOnce(new QuotaExceededError(9000, 500, 10000));

            const res = await request(buildApp())
                .post('/api/ai/utility/names')
                .set('Authorization', 'Bearer valid-token')
                .send({ requestId: REQ_ID, category: 'human', keywords: 'foo' });

            expect(res.status).toBe(429);
            expect(res.body).toMatchObject({
                success: false,
                code: 'QUOTA_EXCEEDED',
                usage: { used: 9000, reserved: 500, limit: 10000 },
            });
            expect(generateNamesMock).not.toHaveBeenCalled();
            expect(commitMock).not.toHaveBeenCalled();
            expect(cancelMock).not.toHaveBeenCalled();
        });

        it('returns 409 with DUPLICATE_REQUEST when reserve throws DuplicateRequestError', async () => {
            verifyIdTokenSdkMock.mockResolvedValueOnce({ uid: 'u1', email: 'a@example.com' });
            const { DuplicateRequestError } = await import('../services/usageService');
            reserveMock.mockRejectedValueOnce(new DuplicateRequestError(REQ_ID));

            const res = await request(buildApp())
                .post('/api/ai/utility/names')
                .set('Authorization', 'Bearer valid-token')
                .send({ requestId: REQ_ID, category: 'human', keywords: 'foo' });

            expect(res.status).toBe(409);
            expect(res.body).toMatchObject({ success: false, code: 'DUPLICATE_REQUEST' });
            expect(generateNamesMock).not.toHaveBeenCalled();
        });

        it('cancels reservation when AI service throws (no double charge)', async () => {
            verifyIdTokenSdkMock.mockResolvedValueOnce({ uid: 'u1', email: 'a@example.com' });
            const handle = { reservedAt: new Date('2026-04-15T10:00:00Z') };
            reserveMock.mockResolvedValueOnce(handle);
            cancelMock.mockResolvedValueOnce(undefined);
            generateNamesMock.mockRejectedValueOnce(new Error('AI service exploded'));

            const res = await request(buildApp())
                .post('/api/ai/utility/names')
                .set('Authorization', 'Bearer valid-token')
                .send({ requestId: REQ_ID, category: 'human', keywords: 'foo' });

            expect(res.status).toBe(500);
            expect(res.body).toMatchObject({ success: false });
            // cancel も reserve の handle を渡す（月境界耐性の契約）
            expect(cancelMock).toHaveBeenCalledWith('u1', REQ_ID, handle);
            expect(commitMock).not.toHaveBeenCalled();
        });
    });

    describe('Verify token transient error → 503 (middleware 経路保持)', () => {
        it('returns 503 when verifyIdToken throws auth/network-request-failed', async () => {
            verifyIdTokenSdkMock.mockRejectedValueOnce({ code: 'auth/network-request-failed', message: 'net' });
            const res = await request(buildApp())
                .post('/api/ai/utility/names')
                .set('Authorization', 'Bearer t')
                .send({ requestId: REQ_ID, category: 'human', keywords: 'x' });
            expect(res.status).toBe(503);
            expect(generateNamesMock).not.toHaveBeenCalled();
            expect(reserveMock).not.toHaveBeenCalled();
        });
    });

    describe('Middleware order contract (rateLimit → verifyIdToken → handler)', () => {
        // brute-force 防御の仕様: rate limit は認証より先に走り、認証エラー時にも
        // 消費される。順序が逆転すると未認証リクエストが rate limit を浴びずに
        // 401 を返せるため、attacker が認証 endpoint を無制限に叩ける。
        it('invokes rateLimit before verifyIdToken (order is preserved)', async () => {
            const callOrder: string[] = [];
            const rateLimit = (_req: unknown, _res: unknown, next: () => void) => {
                callOrder.push('rateLimit');
                next();
            };
            verifyIdTokenSdkMock.mockImplementationOnce((token: string) => {
                callOrder.push('verifyIdToken');
                return Promise.reject({ code: 'auth/argument-error', message: `bad ${token}` });
            });

            const app = express();
            app.use(express.json());
            mountAiRoutes(app, { rateLimit });
            await request(app)
                .post('/api/ai/utility/names')
                .set('Authorization', 'Bearer t')
                .send({ requestId: REQ_ID, category: 'human', keywords: 'x' });

            expect(callOrder).toEqual(['rateLimit', 'verifyIdToken']);
            expect(generateNamesMock).not.toHaveBeenCalled();
        });
    });
});
