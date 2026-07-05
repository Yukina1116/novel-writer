import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// aiClient 全体 (@google/genai の GoogleGenAI インスタンス構築) はモック整備コストが高いため、
// wrapper である getImageAiClient のみを差し替える。これにより generateImage() 内の
// allSettled 集計・PartialSuccessError の成功比率計算を実際に実行して検証できる
// (SDK 自体の mock 整備は不要)。
const generateContentMock = vi.fn();
vi.mock('../aiClient', () => ({
    getImageAiClient: () => ({ models: { generateContent: generateContentMock } }),
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

describe('generateImage - Nano Banana 2 Lite (Gemini 3.1 Flash-Lite Image) 並列4回呼び出し', () => {
    beforeEach(() => {
        generateContentMock.mockReset();
    });

    it('4件とも画像を返す場合、4枚の data URI 配列を返す', async () => {
        generateContentMock.mockResolvedValue(fulfilledImageResponse());
        const { generateImage } = await import('./imageService');

        const images = await generateImage('prompt');

        expect(images).toHaveLength(4);
        expect(images[0]).toBe('data:image/png;base64,aaa');
        expect(generateContentMock).toHaveBeenCalledTimes(4);
    });

    it('レスポンスの mimeType を動的に使う（PNG 固定ではない）', async () => {
        generateContentMock.mockResolvedValue(fulfilledImageResponse('bbb', 'image/webp'));
        const { generateImage } = await import('./imageService');

        const images = await generateImage('prompt');

        expect(images[0]).toBe('data:image/webp;base64,bbb');
    });

    it('4件中1件が reject（rate limit 等）→ PartialSuccessError(successRatio=0.75) を throw する', async () => {
        generateContentMock
            .mockResolvedValueOnce(fulfilledImageResponse())
            .mockResolvedValueOnce(fulfilledImageResponse())
            .mockResolvedValueOnce(fulfilledImageResponse())
            .mockRejectedValueOnce(new Error('429 rate limited'));
        const { generateImage } = await import('./imageService');
        const { PartialSuccessError } = await import('./usageService');

        try {
            await generateImage('prompt');
            expect.unreachable('should have thrown');
        } catch (err) {
            expect(err).toBeInstanceOf(PartialSuccessError);
            expect((err as InstanceType<typeof PartialSuccessError>).successRatio).toBeCloseTo(0.75);
        }
    });

    it('4件中1件のみ画像データを含む（安全フィルタ等で残り3件が空）→ PartialSuccessError(successRatio=0.25)（境界値: 最小成功数）', async () => {
        generateContentMock
            .mockResolvedValueOnce(fulfilledImageResponse())
            .mockResolvedValueOnce(fulfilledNoImageResponse())
            .mockResolvedValueOnce(fulfilledNoImageResponse())
            .mockResolvedValueOnce(fulfilledNoImageResponse());
        const { generateImage } = await import('./imageService');
        const { PartialSuccessError } = await import('./usageService');

        try {
            await generateImage('prompt');
            expect.unreachable('should have thrown');
        } catch (err) {
            expect(err).toBeInstanceOf(PartialSuccessError);
            expect((err as InstanceType<typeof PartialSuccessError>).successRatio).toBeCloseTo(0.25);
        }
    });

    it('4件とも失敗（画像データ0枚）→ PartialSuccessError ではなく通常の Error を throw する（異常系: 全滅）', async () => {
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

    it('getImageAiClient は Vertex モードで location: global を使う', () => {
        expect(aiClientSource).toContain("location: 'global'");
    });
});
