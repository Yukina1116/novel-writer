import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// aiClient 全体 (@google/genai の GoogleGenAI インスタンス構築) はモック整備コストが高いため、
// wrapper である getAiClient のみを差し替える。これにより generateImage() 内の
// allSettled 集計・PartialSuccessError の成功比率計算を実際に実行して検証できる
// (SDK 自体の mock 整備は不要)。
const generateContentMock = vi.fn();
vi.mock('../aiClient', () => ({
    getAiClient: () => ({ models: { generateContent: generateContentMock } }),
    IMAGE_MODEL: 'gemini-3.1-flash-lite-image',
}));

const AI_CLIENT_PATH = resolve(__dirname, '../aiClient.ts');
const aiClientSource = readFileSync(AI_CLIENT_PATH, 'utf8');

const fulfilledImageResponse = (data = 'aaa', mimeType = 'image/png') => ({
    candidates: [{ content: { parts: [{ inlineData: { data, mimeType } }] } }],
});

const fulfilledNoImageResponse = () => ({
    candidates: [{ content: { parts: [{ text: 'safety block' }] } }],
});

describe('generateImage - Nano Banana 2 Lite (Gemini 3.1 Flash-Lite Image) 並列2回呼び出し（quota制約による段階生成方式）', () => {
    beforeEach(() => {
        generateContentMock.mockReset();
    });

    it('2件とも画像を返す場合、2枚の data URI 配列を返す', async () => {
        generateContentMock.mockResolvedValue(fulfilledImageResponse());
        const { generateImage } = await import('./imageService');

        const images = await generateImage('prompt');

        expect(images).toHaveLength(2);
        expect(images[0]).toBe('data:image/png;base64,aaa');
        expect(generateContentMock).toHaveBeenCalledTimes(2);
    });

    it('レスポンスの mimeType を動的に使う（PNG 固定ではない）', async () => {
        generateContentMock.mockResolvedValue(fulfilledImageResponse('bbb', 'image/webp'));
        const { generateImage } = await import('./imageService');

        const images = await generateImage('prompt');

        expect(images[0]).toBe('data:image/webp;base64,bbb');
    });

    it('2件中1件が reject（rate limit 等）→ PartialSuccessError(successRatio=0.5) を throw する', async () => {
        generateContentMock
            .mockResolvedValueOnce(fulfilledImageResponse())
            .mockRejectedValueOnce(new Error('429 rate limited'));
        const { generateImage } = await import('./imageService');
        const { PartialSuccessError } = await import('./usageService');

        try {
            await generateImage('prompt');
            expect.unreachable('should have thrown');
        } catch (err) {
            expect(err).toBeInstanceOf(PartialSuccessError);
            expect((err as InstanceType<typeof PartialSuccessError>).successRatio).toBeCloseTo(0.5);
        }
    });

    it('2件中1件のみ画像データを含む（安全フィルタ等でもう1件が空）→ PartialSuccessError(successRatio=0.5)（境界値: 最小成功数）', async () => {
        generateContentMock
            .mockResolvedValueOnce(fulfilledImageResponse())
            .mockResolvedValueOnce(fulfilledNoImageResponse());
        const { generateImage } = await import('./imageService');
        const { PartialSuccessError } = await import('./usageService');

        try {
            await generateImage('prompt');
            expect.unreachable('should have thrown');
        } catch (err) {
            expect(err).toBeInstanceOf(PartialSuccessError);
            expect((err as InstanceType<typeof PartialSuccessError>).successRatio).toBeCloseTo(0.5);
        }
    });

    it('2件とも失敗（画像データ0枚）→ PartialSuccessError ではなく通常の Error を throw する（異常系: 全滅）', async () => {
        generateContentMock.mockResolvedValue(fulfilledNoImageResponse());
        const { generateImage } = await import('./imageService');
        const { PartialSuccessError } = await import('./usageService');

        try {
            await generateImage('prompt');
            expect.unreachable('should have thrown');
        } catch (err) {
            expect(err).not.toBeInstanceOf(PartialSuccessError);
            expect(err).toBeInstanceOf(Error);
        }
    });

    it('2件全て reject（実際の SDK エラー）→ ラップせず元のエラーをそのまま伝播する（code review 指摘: quota/認証/timeout 分類の維持）', async () => {
        const quotaError = Object.assign(new Error('RESOURCE_EXHAUSTED: quota exceeded'), { code: 8 });
        generateContentMock.mockRejectedValue(quotaError);
        const { generateImage } = await import('./imageService');

        await expect(generateImage('prompt')).rejects.toBe(quotaError);
    });

    it('2件中1件が reject し1件成功 → PartialSuccessError のメッセージに元のエラー内容を含める（分類器がsubstringを拾えるように）', async () => {
        generateContentMock
            .mockResolvedValueOnce(fulfilledImageResponse())
            .mockRejectedValueOnce(new Error('UNAUTHENTICATED: invalid credentials'));
        const { generateImage } = await import('./imageService');
        const { PartialSuccessError } = await import('./usageService');

        try {
            await generateImage('prompt');
            expect.unreachable('should have thrown');
        } catch (err) {
            expect(err).toBeInstanceOf(PartialSuccessError);
            expect((err as Error).message).toContain('UNAUTHENTICATED');
        }
    });

    it('personGeneration: ALLOW_ADULT を明示指定する（人物キャラクター画像がデフォルト拒否されるのを防ぐ）', async () => {
        generateContentMock.mockResolvedValue(fulfilledImageResponse());
        const { generateImage } = await import('./imageService');

        await generateImage('prompt');

        expect(generateContentMock).toHaveBeenCalledWith(
            expect.objectContaining({
                model: 'gemini-3.1-flash-lite-image',
                config: expect.objectContaining({
                    imageConfig: expect.objectContaining({ personGeneration: 'ALLOW_ADULT' }),
                }),
            }),
        );
    });
});

describe('aiClient.ts - モデル名 / global エンドポイント (static pin)', () => {
    it('TEXT_MODEL / IMAGE_MODEL が新モデル名に更新されている', () => {
        expect(aiClientSource).toContain("TEXT_MODEL = 'gemini-3.1-flash-lite'");
        expect(aiClientSource).toContain("IMAGE_MODEL = 'gemini-3.1-flash-lite-image'");
    });

    it('getAiClient は Vertex モードで location: global を使う（asia-northeast1 では両モデルとも404のため、2026-07-05実機検証で確定）', () => {
        expect(aiClientSource).toContain("location: 'global'");
    });

    it('GCP_LOCATION env var の分岐に依存しない（region 分岐が復活すると global 固定の意図が壊れるため明示的に禁止する。コメントでの言及は許容）', () => {
        expect(aiClientSource).not.toMatch(/process\.env\.GCP_LOCATION/);
    });
});
