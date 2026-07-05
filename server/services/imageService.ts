import { GenerateContentResponse, Modality } from '@google/genai';
import { getAiClient, IMAGE_MODEL, isVertexAiMode } from '../aiClient';
import { PartialSuccessError } from './usageService';
import { IMAGE_GENERATION_BATCH_SIZE } from '../../shared/imageGenerationConfig';

// 並列数は quota 上限 (shared/imageGenerationConfig.ts 参照) に合わせる。4枚欲しい場合は
// 呼び出し元 (ImageGenerationModal) の「追加生成」ボタンで本関数を再度呼び出す段階生成方式とする。
const NUM_IMAGES = IMAGE_GENERATION_BATCH_SIZE;

const extractImageDataUri = (response: GenerateContentResponse): string | null => {
    const parts = response.candidates?.[0]?.content?.parts ?? [];
    const imagePart = parts.find(part => part.inlineData?.data);
    if (!imagePart?.inlineData?.data) {
        return null;
    }
    const mimeType = imagePart.inlineData.mimeType || 'image/png';
    return `data:${mimeType};base64,${imagePart.inlineData.data}`;
};

export const generateImage = async (prompt: string): Promise<string[]> => {
    const client = getAiClient();

    // Nano Banana 系 (Gemini image-generation family) は 1 呼び出し 1 枚のみ対応
    // (candidateCount > 1 は非サポート)。NUM_IMAGES 分だけ並列呼び出す。
    // allSettled で各呼び出しの成否を個別に把握し、Google 側に実際に課金が発生した
    // 成功件数分だけ withUsageQuota で usedCost に計上する (PartialSuccessError 経由)。
    // NUM_IMAGES 枚揃わない場合は UX 上これまで通り全体を失敗として扱う (部分画像は返さない)。
    const settled = await Promise.allSettled(
        Array.from({ length: NUM_IMAGES }, () =>
            client.models.generateContent({
                model: IMAGE_MODEL,
                contents: prompt,
                config: {
                    responseModalities: [Modality.TEXT, Modality.IMAGE],
                    imageConfig: {
                        aspectRatio: '3:4',
                        imageSize: '1K',
                        // personGeneration は Vertex AI 専用パラメータ。Gemini Developer API
                        // (APIキーモード) では SDK が client-side で reject するため、
                        // Vertex AI モード時のみ含める (Codex review 2026-07-05 P1 指摘)。
                        ...(isVertexAiMode() ? { personGeneration: 'ALLOW_ADULT' as const } : {}),
                    },
                },
            })
        )
    );

    const images: string[] = [];
    const rejections: unknown[] = [];
    for (const result of settled) {
        if (result.status === 'rejected') {
            rejections.push(result.reason);
            continue;
        }
        const uri = extractImageDataUri(result.value);
        if (uri !== null) images.push(uri);
    }

    if (images.length === NUM_IMAGES) {
        return images;
    }

    // 呼び出し自体が全滅した場合は元の SDK エラーをそのまま伝播する。
    // ラップして握りつぶすと quota (429) / 認証 (401) / timeout (504) を判定する
    // handleApiError の message ベース分類が効かなくなり、実際は一時的なレート
    // 制限でも常に汎用 500 になってしまう (code review 指摘)。
    if (images.length === 0 && rejections.length === NUM_IMAGES) {
        throw rejections[0];
    }

    const successRatio = images.length / NUM_IMAGES;
    const failureDetail = rejections.length > 0
        ? ` (${rejections[0] instanceof Error ? rejections[0].message : String(rejections[0])})`
        : '';
    const message = `画像生成に失敗しました: ${NUM_IMAGES}枚中${images.length}枚のみ成功しました。${failureDetail}`;

    if (successRatio > 0) {
        throw new PartialSuccessError(message, successRatio);
    }
    throw new Error(message);
};
