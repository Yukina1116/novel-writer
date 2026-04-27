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

const aiEndpoints: ReadonlyArray<{ method: 'post'; path: string; body: Record<string, unknown> }> = [
    { method: 'post', path: '/api/ai/novel/generate', body: {} },
    { method: 'post', path: '/api/ai/character/update', body: { chatHistory: [], currentCharacterData: {}, intent: 'create' } },
    { method: 'post', path: '/api/ai/character/reply', body: { updatedCharacterData: {} } },
    { method: 'post', path: '/api/ai/character/image-prompt', body: { chatHistory: [] } },
    { method: 'post', path: '/api/ai/world/update', body: { chatHistory: [], currentWorldData: {}, intent: 'create' } },
    { method: 'post', path: '/api/ai/world/reply', body: { updatedWorldData: {} } },
    { method: 'post', path: '/api/ai/image/generate', body: { prompt: 'test' } },
    { method: 'post', path: '/api/ai/utility/names', body: { category: 'human', keywords: 'foo' } },
    { method: 'post', path: '/api/ai/utility/knowledge-name', body: { sentence: 'foo' } },
    { method: 'post', path: '/api/ai/utility/extract-character', body: { characterName: 'A', novelContent: 'x' } },
    { method: 'post', path: '/api/ai/analysis/import', body: { importedText: 'x', existingCharacters: [], existingWorldSettings: [], existingKnowledge: [] } },
];

describe('/api/ai/* requires Authorization Bearer ID Token', () => {
    beforeEach(() => {
        verifyIdTokenSdkMock.mockReset();
        for (const m of allServiceMocks) m.mockReset();
    });

    describe('Authorization absent → 401 (全 11 endpoint)', () => {
        for (const { method, path, body } of aiEndpoints) {
            it(`${method.toUpperCase()} ${path} returns 401 when no Authorization header`, async () => {
                const app = buildApp();
                const res = await request(app)[method](path).send(body);
                expect(res.status).toBe(401);
                expect(res.body).toMatchObject({ success: false });
                // middleware で reject されたので service は呼ばれない
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
                .send({ category: 'human', keywords: 'x' });
            expect(res.status).toBe(401);
            expect(generateNamesMock).not.toHaveBeenCalled();
        });

        it('rejects empty bearer token', async () => {
            const res = await request(buildApp())
                .post('/api/ai/utility/names')
                .set('Authorization', 'Bearer    ')
                .send({ category: 'human', keywords: 'x' });
            expect(res.status).toBe(401);
            expect(generateNamesMock).not.toHaveBeenCalled();
        });
    });

    describe('Authorization present + valid token → service is invoked', () => {
        // middleware 通過後の正常経路サンプル: /api/ai/utility/names で service が
        // 呼ばれることだけ確認する (handler 個別の挙動は別テストで)。
        it('passes through to service when Bearer token verifies', async () => {
            verifyIdTokenSdkMock.mockResolvedValueOnce({ uid: 'u1', email: 'a@example.com' });
            generateNamesMock.mockResolvedValueOnce(['name-1', 'name-2']);

            const res = await request(buildApp())
                .post('/api/ai/utility/names')
                .set('Authorization', 'Bearer valid-token')
                .send({ category: 'human', keywords: 'foo' });

            expect(res.status).toBe(200);
            expect(res.body).toEqual({ success: true, data: ['name-1', 'name-2'] });
            expect(generateNamesMock).toHaveBeenCalledTimes(1);
        });
    });

    describe('Verify token transient error → 503 (middleware 経路保持)', () => {
        it('returns 503 when verifyIdToken throws auth/network-request-failed', async () => {
            verifyIdTokenSdkMock.mockRejectedValueOnce({ code: 'auth/network-request-failed', message: 'net' });
            const res = await request(buildApp())
                .post('/api/ai/utility/names')
                .set('Authorization', 'Bearer t')
                .send({ category: 'human', keywords: 'x' });
            expect(res.status).toBe(503);
            expect(generateNamesMock).not.toHaveBeenCalled();
        });
    });
});
