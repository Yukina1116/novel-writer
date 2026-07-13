import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { DEVELOPER_OVERRIDE_LIMIT_SEN } from '../services/usageConfig';

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
const recordQuotaExceededMock = vi.fn();
const recordImageGenerationKindMock = vi.fn();
vi.mock('../services/usageService', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../services/usageService')>();
    return {
        ...actual,
        reserve: (...args: unknown[]) => reserveMock(...args),
        commit: (...args: unknown[]) => commitMock(...args),
        cancel: (...args: unknown[]) => cancelMock(...args),
        recordQuotaExceeded: (...args: unknown[]) => recordQuotaExceededMock(...args),
        recordImageGenerationKind: (...args: unknown[]) => recordImageGenerationKindMock(...args),
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
const { PartialSuccessError, QuotaExceededError } = await import('../services/usageService');

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
        recordQuotaExceededMock.mockReset();
        recordImageGenerationKindMock.mockReset();
        generateImageMock.mockReset();
        verifyIdTokenSdkMock.mockResolvedValue({ uid: 'u1', email: 'a@example.com' });
        reserveMock.mockResolvedValue(handle);
        recordQuotaExceededMock.mockResolvedValue(undefined);
        recordImageGenerationKindMock.mockResolvedValue(undefined);
    });

    it('全件成功時は estimatedCost で commit される（回帰確認）', async () => {
        generateImageMock.mockResolvedValueOnce(['data:image/png;base64,aaa']);

        const res = await request(buildApp())
            .post('/api/ai/image/generate')
            .set('Authorization', 'Bearer valid-token')
            .send({ requestId: REQ_ID, prompt: 'test' });

        expect(res.status).toBe(200);
        expect(commitMock).toHaveBeenCalledWith('u1', REQ_ID, 1200, handle, 'image/generate');
        expect(cancelMock).not.toHaveBeenCalled();
    });

    it('PartialSuccessError(successRatio=0.5, 2枚中1枚成功) は成功比率分だけ commit し、cancel は呼ばれない（境界値: N=2唯一の部分成功比率）', async () => {
        generateImageMock.mockRejectedValueOnce(
            new PartialSuccessError('画像生成に失敗しました: 2枚中1枚のみ成功しました。', 0.5),
        );

        const res = await request(buildApp())
            .post('/api/ai/image/generate')
            .set('Authorization', 'Bearer valid-token')
            .send({ requestId: REQ_ID, prompt: 'test' });

        expect(res.status).toBe(500);
        expect(commitMock).toHaveBeenCalledWith('u1', REQ_ID, 600, handle, 'image/generate');
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

    it('PartialSuccessError の commit 自体が失敗した場合、best-effort で cancel にフォールバックする（code review 指摘: reservation 残存防止）', async () => {
        generateImageMock.mockRejectedValueOnce(
            new PartialSuccessError('画像生成に失敗しました: 2枚中1枚のみ成功しました。', 0.5),
        );
        commitMock.mockRejectedValueOnce(new Error('firestore transient error'));

        const res = await request(buildApp())
            .post('/api/ai/image/generate')
            .set('Authorization', 'Bearer valid-token')
            .send({ requestId: REQ_ID, prompt: 'test' });

        expect(res.status).toBe(500);
        expect(commitMock).toHaveBeenCalledWith('u1', REQ_ID, 600, handle, 'image/generate');
        expect(cancelMock).toHaveBeenCalledWith('u1', REQ_ID, handle);
    });
});

describe('withUsageQuota - QuotaExceededError 計測 (Issue #232)', () => {
    beforeEach(() => {
        verifyIdTokenSdkMock.mockReset();
        reserveMock.mockReset();
        commitMock.mockReset();
        cancelMock.mockReset();
        recordQuotaExceededMock.mockReset();
        generateImageMock.mockReset();
        verifyIdTokenSdkMock.mockResolvedValue({ uid: 'u1', email: 'a@example.com' });
        recordQuotaExceededMock.mockResolvedValue(undefined);
    });

    it('quota 超過時に recordQuotaExceeded(uid, routeKey) が呼ばれ、429 を返す', async () => {
        reserveMock.mockRejectedValueOnce(new QuotaExceededError(9500, 500, 10000));

        const res = await request(buildApp())
            .post('/api/ai/image/generate')
            .set('Authorization', 'Bearer valid-token')
            .send({ requestId: REQ_ID, prompt: 'test' });

        expect(res.status).toBe(429);
        expect(res.body.code).toBe('QUOTA_EXCEEDED');
        expect(recordQuotaExceededMock).toHaveBeenCalledWith('u1', 'image/generate');
    });

    it('recordQuotaExceeded が失敗しても 429 レスポンス自体は正常に返る（best-effort）', async () => {
        reserveMock.mockRejectedValueOnce(new QuotaExceededError(9500, 500, 10000));
        recordQuotaExceededMock.mockRejectedValueOnce(new Error('firestore transient error'));

        const res = await request(buildApp())
            .post('/api/ai/image/generate')
            .set('Authorization', 'Bearer valid-token')
            .send({ requestId: REQ_ID, prompt: 'test' });

        expect(res.status).toBe(429);
        expect(res.body.code).toBe('QUOTA_EXCEEDED');
    });
});

describe('withUsageQuota - 開発者アカウント Tier 免除 (DEVELOPER_UIDS)', () => {
    beforeEach(() => {
        verifyIdTokenSdkMock.mockReset();
        reserveMock.mockReset();
        commitMock.mockReset();
        cancelMock.mockReset();
        generateImageMock.mockReset();
        verifyIdTokenSdkMock.mockResolvedValue({ uid: 'u1', email: 'a@example.com' });
        reserveMock.mockResolvedValue(handle);
        generateImageMock.mockResolvedValue(['data:image/png;base64,aaa']);
    });

    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it('DEVELOPER_UIDS に含まれる uid では reserve に DEVELOPER_OVERRIDE_LIMIT_SEN (Tier 1 の 10 倍、無制限ではない) が渡る', async () => {
        vi.stubEnv('DEVELOPER_UIDS', 'u1');

        await request(buildApp())
            .post('/api/ai/image/generate')
            .set('Authorization', 'Bearer valid-token')
            .send({ requestId: REQ_ID, prompt: 'test' });

        expect(reserveMock).toHaveBeenCalledWith('u1', REQ_ID, 1200, DEVELOPER_OVERRIDE_LIMIT_SEN);
    });

    it('DEVELOPER_UIDS に含まれない uid では従来どおり limit=10000 が渡る（回帰確認）', async () => {
        vi.stubEnv('DEVELOPER_UIDS', 'someone-else');

        await request(buildApp())
            .post('/api/ai/image/generate')
            .set('Authorization', 'Bearer valid-token')
            .send({ requestId: REQ_ID, prompt: 'test' });

        expect(reserveMock).toHaveBeenCalledWith('u1', REQ_ID, 1200, 10000);
    });

    it('DEVELOPER_UIDS 未設定時は全 uid が limit=10000（安全側デフォルト）', async () => {
        vi.stubEnv('DEVELOPER_UIDS', undefined as unknown as string);

        await request(buildApp())
            .post('/api/ai/image/generate')
            .set('Authorization', 'Bearer valid-token')
            .send({ requestId: REQ_ID, prompt: 'test' });

        expect(reserveMock).toHaveBeenCalledWith('u1', REQ_ID, 1200, 10000);
    });
});

describe('image/generate - isAdditionalGeneration 計測 (Issue #232)', () => {
    beforeEach(() => {
        verifyIdTokenSdkMock.mockReset();
        reserveMock.mockReset();
        commitMock.mockReset();
        cancelMock.mockReset();
        recordImageGenerationKindMock.mockReset();
        generateImageMock.mockReset();
        verifyIdTokenSdkMock.mockResolvedValue({ uid: 'u1', email: 'a@example.com' });
        reserveMock.mockResolvedValue(handle);
        recordImageGenerationKindMock.mockResolvedValue(undefined);
        generateImageMock.mockResolvedValue(['data:image/png;base64,aaa']);
    });

    it('isAdditionalGeneration 省略時は false として記録される（初回生成）', async () => {
        const res = await request(buildApp())
            .post('/api/ai/image/generate')
            .set('Authorization', 'Bearer valid-token')
            .send({ requestId: REQ_ID, prompt: 'test' });

        expect(res.status).toBe(200);
        expect(recordImageGenerationKindMock).toHaveBeenCalledWith('u1', false, handle);
    });

    it('isAdditionalGeneration: true を送ると true として記録される（追加生成）', async () => {
        const res = await request(buildApp())
            .post('/api/ai/image/generate')
            .set('Authorization', 'Bearer valid-token')
            .send({ requestId: REQ_ID, prompt: 'test', isAdditionalGeneration: true });

        expect(res.status).toBe(200);
        expect(recordImageGenerationKindMock).toHaveBeenCalledWith('u1', true, handle);
    });

    it('isAdditionalGeneration が truthy な非 boolean 値（文字列 "true" 等）の場合は false 扱いにする', async () => {
        const res = await request(buildApp())
            .post('/api/ai/image/generate')
            .set('Authorization', 'Bearer valid-token')
            .send({ requestId: REQ_ID, prompt: 'test', isAdditionalGeneration: 'true' });

        expect(res.status).toBe(200);
        expect(recordImageGenerationKindMock).toHaveBeenCalledWith('u1', false, handle);
    });

    it('recordImageGenerationKind が失敗しても画像生成レスポンス自体は成功として返る（best-effort）', async () => {
        recordImageGenerationKindMock.mockRejectedValueOnce(new Error('firestore transient error'));

        const res = await request(buildApp())
            .post('/api/ai/image/generate')
            .set('Authorization', 'Bearer valid-token')
            .send({ requestId: REQ_ID, prompt: 'test' });

        expect(res.status).toBe(200);
        expect(res.body.data).toEqual(['data:image/png;base64,aaa']);
    });

    it('PartialSuccessError（一部枚数のみ成功）でも生成は実行されたため imageGenerationCounts に計上する', async () => {
        generateImageMock.mockReset();
        generateImageMock.mockRejectedValueOnce(
            new PartialSuccessError('画像生成に失敗しました: 2枚中1枚のみ成功しました。', 0.5),
        );

        const res = await request(buildApp())
            .post('/api/ai/image/generate')
            .set('Authorization', 'Bearer valid-token')
            .send({ requestId: REQ_ID, prompt: 'test' });

        expect(res.status).toBe(500);
        expect(recordImageGenerationKindMock).toHaveBeenCalledWith('u1', false, handle);
    });

    it('完全失敗（0 枚成功、通常の Error）では imageGenerationCounts に計上しない', async () => {
        generateImageMock.mockReset();
        generateImageMock.mockRejectedValueOnce(
            new Error('画像生成に失敗しました: レスポンスに画像データが含まれていません。'),
        );

        const res = await request(buildApp())
            .post('/api/ai/image/generate')
            .set('Authorization', 'Bearer valid-token')
            .send({ requestId: REQ_ID, prompt: 'test' });

        expect(res.status).toBe(500);
        expect(recordImageGenerationKindMock).not.toHaveBeenCalled();
    });
});
