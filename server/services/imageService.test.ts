import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { logger } from '../utils/logger';

// aiClient 全体 (@google/genai の GoogleGenAI インスタンス構築) はモック整備コストが高いため、
// wrapper である getAiClient のみを差し替える。これにより generateImage() 内の
// allSettled 集計・PartialSuccessError の成功比率計算を実際に実行して検証できる
// (SDK 自体の mock 整備は不要)。
const generateContentMock = vi.fn();
let vertexAiModeMock = true;
vi.mock('../aiClient', () => ({
    getAiClient: () => ({ models: { generateContent: generateContentMock } }),
    IMAGE_MODEL: 'gemini-3.1-flash-lite-image',
    isVertexAiMode: () => vertexAiModeMock,
}));

const AI_CLIENT_PATH = resolve(__dirname, '../aiClient.ts');
const aiClientSource = readFileSync(AI_CLIENT_PATH, 'utf8');

const fulfilledImageResponse = (data = 'aaa', mimeType = 'image/png') => ({
    candidates: [{ content: { parts: [{ inlineData: { data, mimeType } }] } }],
});

const fulfilledNoImageResponse = () => ({
    candidates: [{ content: { parts: [{ text: 'safety block' }] } }],
});

// Issue #243: 安全フィルタ拒否等で画像データが欠落したケースの finishReason 捕捉検証用。
const fulfilledNoImageResponseWithFinishReason = (finishReason = 'SAFETY') => ({
    candidates: [{
        content: { parts: [{ text: 'safety block' }] },
        finishReason,
        finishMessage: 'Blocked due to safety guidelines.',
    }],
    promptFeedback: { blockReason: finishReason },
});

describe('generateImage - Nano Banana 2 Lite (Gemini 3.1 Flash-Lite Image) 並列2回呼び出し（quota制約による段階生成方式）', () => {
    let warnSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        generateContentMock.mockReset();
        vertexAiModeMock = true;
        warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    });

    function imageOmittedCalls(): unknown[][] {
        return warnSpy.mock.calls.filter(
            (c) => (c[0] as { imageGenerationEvent?: string }).imageGenerationEvent === 'no-image-data'
        );
    }

    it('Issue #243: finishReason: SAFETY で画像データ無し → logger.warn に finishReason / finishMessage / blockReason を記録する', async () => {
        generateContentMock
            .mockResolvedValueOnce(fulfilledImageResponse())
            .mockResolvedValueOnce(fulfilledNoImageResponseWithFinishReason());
        const { generateImage } = await import('./imageService');
        const { PartialSuccessError } = await import('./usageService');

        try {
            await generateImage('prompt');
            expect.unreachable('should have thrown');
        } catch (err) {
            expect(err).toBeInstanceOf(PartialSuccessError);
        }

        const calls = imageOmittedCalls();
        expect(calls).toHaveLength(1);
        const payload = calls[0]![0] as Record<string, unknown>;
        expect(payload.finishReason).toBe('SAFETY');
        expect(payload.finishMessage).toBe('Blocked due to safety guidelines.');
        expect(payload.blockReason).toBe('SAFETY');
    });

    it('Issue #243: 画像データありの成功時は no-image-data ログを発火しない（false positive ゼロ）', async () => {
        generateContentMock.mockResolvedValue(fulfilledImageResponse());
        const { generateImage } = await import('./imageService');

        await generateImage('prompt');

        expect(imageOmittedCalls()).toHaveLength(0);
    });

    it('Issue #243: finishReason が undefined の応答でも例外を投げず、null として記録する（防御的ケース）', async () => {
        generateContentMock.mockResolvedValue(fulfilledNoImageResponse());
        const { generateImage } = await import('./imageService');

        try {
            await generateImage('prompt');
            expect.unreachable('should have thrown');
        } catch {
            // 全滅ケースなので Error が throw される (別テストで既に検証済み)。ここでは
            // logger.warn 呼出の有無のみ検証する。
        }

        const calls = imageOmittedCalls();
        expect(calls).toHaveLength(2);
        for (const call of calls) {
            const payload = call[0] as Record<string, unknown>;
            expect(payload.finishReason).toBeNull();
            expect(payload.finishMessage).toBeNull();
            expect(payload.blockReason).toBeNull();
        }
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

    it('2件とも finishReason: IMAGE_SAFETY で全滅 → 安全フィルタ専用メッセージを throw する（実際に prod で発生したケース、2026-07-12）', async () => {
        generateContentMock.mockResolvedValue(fulfilledNoImageResponseWithFinishReason('IMAGE_SAFETY'));
        const { generateImage } = await import('./imageService');

        try {
            await generateImage('prompt');
            expect.unreachable('should have thrown');
        } catch (err) {
            expect((err as Error).message).toBe('キャラクターの外見が生成ポリシーに抵触した可能性があります。プロンプトを調整して再試行してください。');
        }
    });

    it('2件中1件のみ画像データを含み、もう1件が finishReason: SAFETY（混在ケース）→ PartialSuccessError だが message は安全フィルタ専用文言になる', async () => {
        generateContentMock
            .mockResolvedValueOnce(fulfilledImageResponse())
            .mockResolvedValueOnce(fulfilledNoImageResponseWithFinishReason('SAFETY'));
        const { generateImage } = await import('./imageService');
        const { PartialSuccessError } = await import('./usageService');

        try {
            await generateImage('prompt');
            expect.unreachable('should have thrown');
        } catch (err) {
            expect(err).toBeInstanceOf(PartialSuccessError);
            expect((err as Error).message).toBe('キャラクターの外見が生成ポリシーに抵触した可能性があります。プロンプトを調整して再試行してください。');
        }
    });

    it('2件とも画像データ無しだが finishReason が安全フィルタ系でない（例: undefined）場合、専用メッセージにならず従来の汎用メッセージのままになる', async () => {
        generateContentMock.mockResolvedValue(fulfilledNoImageResponse());
        const { generateImage } = await import('./imageService');

        try {
            await generateImage('prompt');
            expect.unreachable('should have thrown');
        } catch (err) {
            expect((err as Error).message).not.toContain('生成ポリシー');
            expect((err as Error).message).toContain('画像生成に失敗しました');
        }
    });

    it('2件中1件が reject・1件が画像データ無しで成功（混在ケース）→ rejections.length !== NUM_IMAGES のため通常 Error になり、元エラー文言は failureDetail 経由でのみ残る（pr-test-analyzer 指摘: 全滅への到達経路が2通りあることの網羅）', async () => {
        const authError = new Error('UNAUTHENTICATED: invalid credentials');
        generateContentMock
            .mockRejectedValueOnce(authError)
            .mockResolvedValueOnce(fulfilledNoImageResponse());
        const { generateImage } = await import('./imageService');
        const { PartialSuccessError } = await import('./usageService');

        try {
            await generateImage('prompt');
            expect.unreachable('should have thrown');
        } catch (err) {
            // images.length===0 だが rejections.length===1 (!== NUM_IMAGES=2) のため
            // 「全滅=元エラーをそのまま伝播」分岐(L61-63)ではなく、通常の Error 生成分岐を通る。
            expect(err).not.toBeInstanceOf(PartialSuccessError);
            expect(err).not.toBe(authError);
            expect(err).toBeInstanceOf(Error);
            expect((err as Error).message).toContain('UNAUTHENTICATED');
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

    it('Vertex AI モードでは personGeneration: ALLOW_ALL を明示指定する（子供キャラクターを含む立ち絵が ALLOW_ADULT で一律拒否されるのを防ぐ、2026-07-12変更）', async () => {
        generateContentMock.mockResolvedValue(fulfilledImageResponse());
        const { generateImage } = await import('./imageService');

        await generateImage('prompt');

        expect(generateContentMock).toHaveBeenCalledWith(
            expect.objectContaining({
                model: 'gemini-3.1-flash-lite-image',
                config: expect.objectContaining({
                    imageConfig: expect.objectContaining({ personGeneration: 'ALLOW_ALL' }),
                }),
            }),
        );
    });

    it('APIキーモード（Vertex以外）では personGeneration を含めない（Gemini Developer API は本パラメータ非対応で SDK が client-side reject するため、Codex review 2026-07-05 P1 指摘）', async () => {
        vertexAiModeMock = false;
        generateContentMock.mockResolvedValue(fulfilledImageResponse());
        const { generateImage } = await import('./imageService');

        await generateImage('prompt');

        const callArgs = generateContentMock.mock.calls[0][0];
        expect(callArgs.config.imageConfig).not.toHaveProperty('personGeneration');
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
