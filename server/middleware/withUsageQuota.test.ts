import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// withUsageQuota 単体の commit/cancel 分岐を検証する。
// ai-auth.test.ts は認証ゲートとの連携検証に専念しているため、
// PartialSuccessError の按分ロジックはこちらに分離する（ai-auth.test.ts 冒頭コメント参照）。

const generateImageMock = vi.fn();
vi.mock('../services/imageService', () => ({
    generateImage: (...args: unknown[]) => generateImageMock(...args),
}));

// 他の AI service は本テストで叩かないが、aiRoutes.ts が import するため no-op mock が必要。
vi.mock('../services/novelService', () => ({ generateNovelContinuation: vi.fn() }));
vi.mock('../services/characterService', () => ({
    updateCharacterData: vi.fn(),
    generateCharacterReply: vi.fn(),
    generateCharacterImagePrompt: vi.fn(),
}));
vi.mock('../services/worldService', () => ({ updateWorldData: vi.fn(), generateWorldReply: vi.fn() }));
vi.mock('../services/utilityService', () => ({
    generateNames: vi.fn(),
    generateKnowledgeName: vi.fn(),
    extractCharacterInfo: vi.fn(),
}));
vi.mock('../services/analysisService', () => ({ analyzeTextForImport: vi.fn() }));

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

const verifyIdTokenSdkMock = vi.fn();
vi.mock('../firebaseAdmin', () => ({
    getFirebaseAuth: () => ({
        verifyIdToken: (token: string) => verifyIdTokenSdkMock(token),
    }),
    getFirebaseFirestore: () => ({}),
}));

const { mountAiRoutes } = await import('../aiRoutes');
const { PartialSuccessError } = await import('../services/usageService');

const buildApp = () => {
    const app = express();
    app.use(express.json());
    mountAiRoutes(app);
    return app;
};

const REQ_ID = 'test-request-id-0001';
const handle = { reservedAt: new Date('2026-07-05T10:00:00Z') };

describe('withUsageQuota - PartialSuccessError 按分 commit', () => {
    beforeEach(() => {
        verifyIdTokenSdkMock.mockReset();
        reserveMock.mockReset();
        commitMock.mockReset();
        cancelMock.mockReset();
        generateImageMock.mockReset();
        verifyIdTokenSdkMock.mockResolvedValue({ uid: 'u1', email: 'a@example.com' });
        reserveMock.mockResolvedValue(handle);
    });

    it('全件成功時は estimatedCost で commit される（回帰確認）', async () => {
        generateImageMock.mockResolvedValueOnce(['data:image/png;base64,aaa']);

        const res = await request(buildApp())
            .post('/api/ai/image/generate')
            .set('Authorization', 'Bearer valid-token')
            .send({ requestId: REQ_ID, prompt: 'test' });

        expect(res.status).toBe(200);
        expect(commitMock).toHaveBeenCalledWith('u1', REQ_ID, 1000, handle);
        expect(cancelMock).not.toHaveBeenCalled();
    });

    it('PartialSuccessError(successRatio=0.75, 4枚中3枚成功) は成功比率分だけ commit し、cancel は呼ばれない', async () => {
        generateImageMock.mockRejectedValueOnce(
            new PartialSuccessError('画像生成に失敗しました: 4枚中3枚のみ成功しました。', 0.75),
        );

        const res = await request(buildApp())
            .post('/api/ai/image/generate')
            .set('Authorization', 'Bearer valid-token')
            .send({ requestId: REQ_ID, prompt: 'test' });

        expect(res.status).toBe(500);
        expect(commitMock).toHaveBeenCalledWith('u1', REQ_ID, 750, handle);
        expect(cancelMock).not.toHaveBeenCalled();
    });

    it('PartialSuccessError(successRatio=0.25, 4枚中1枚成功) も比率どおりに commit される（境界値: 最小成功数）', async () => {
        generateImageMock.mockRejectedValueOnce(
            new PartialSuccessError('画像生成に失敗しました: 4枚中1枚のみ成功しました。', 0.25),
        );

        const res = await request(buildApp())
            .post('/api/ai/image/generate')
            .set('Authorization', 'Bearer valid-token')
            .send({ requestId: REQ_ID, prompt: 'test' });

        expect(res.status).toBe(500);
        expect(commitMock).toHaveBeenCalledWith('u1', REQ_ID, 250, handle);
        expect(cancelMock).not.toHaveBeenCalled();
    });

    it('通常の Error（全滅、成功0枚）は従来どおり cancel され、commit は呼ばれない（異常系: 全件失敗）', async () => {
        generateImageMock.mockRejectedValueOnce(
            new Error('画像生成に失敗しました: レスポンスに画像データが含まれていません。'),
        );

        const res = await request(buildApp())
            .post('/api/ai/image/generate')
            .set('Authorization', 'Bearer valid-token')
            .send({ requestId: REQ_ID, prompt: 'test' });

        expect(res.status).toBe(500);
        expect(cancelMock).toHaveBeenCalledWith('u1', REQ_ID, handle);
        expect(commitMock).not.toHaveBeenCalled();
    });
});
