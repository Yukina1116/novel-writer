import { GenerateContentResponse, Modality } from '@google/genai';
import { getAiClient, IMAGE_MODEL, isVertexAiMode } from '../aiClient';
import { PartialSuccessError } from './usageService';
import { IMAGE_GENERATION_BATCH_SIZE } from '../../shared/imageGenerationConfig';
import { logger } from '../utils/logger';

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

// Issue #243: 「呼出は成功したが画像データが無い」現象 (GCP実測 n=14 中 13 件が関与) の原因を
// 事後判別可能にするため、安全フィルタ拒否等で使われる finishReason 系フィールドのみを記録する
// (プロンプト本文・生成テキストは含めない、PII/機密混入を避けるため promptSafety.ts と同じ方針)。
// 戻り値の finishReason は呼び出し元 (generateImage) が安全フィルタ由来の専用エラー文言に
// 分岐するために使う (2026-07-12: 画像生成失敗理由をユーザーに伝える改善)。
const logImageOmittedNoData = (response: GenerateContentResponse): string | null => {
    const candidate = response.candidates?.[0];
    const finishReason = candidate?.finishReason ?? null;
    logger.warn({
        message: 'imageService: generateContent は成功したが画像データが含まれていない（安全フィルタ拒否の可能性）',
        imageGenerationEvent: 'no-image-data',
        finishReason,
        finishMessage: candidate?.finishMessage ?? null,
        blockReason: response.promptFeedback?.blockReason ?? null,
    });
    return finishReason ?? null;
};

// @google/genai の FinishReason enum のうち、安全フィルタ・ポリシー拒否に該当する値のみ
// (SDK 型定義 node_modules/@google/genai/dist/node/node.d.ts 準拠)。MAX_TOKENS/OTHER/
// NO_IMAGE 等の非決定的な生成放棄は含めない (誤った専用メッセージで混乱させないため)。
const SAFETY_FINISH_REASONS = new Set<string>([
    'SAFETY',
    'PROHIBITED_CONTENT',
    'IMAGE_SAFETY',
    'IMAGE_PROHIBITED_CONTENT',
    'BLOCKLIST',
]);

const SAFETY_BLOCKED_MESSAGE = 'キャラクターの外見が生成ポリシーに抵触した可能性があります。プロンプトを調整して再試行してください。';

// 2026-07-12: 直前の生成成功から短間隔で再度生成すると RESOURCE_EXHAUSTED (429) になる
// 現象が prod で複数回再現した。GCP のクォータ定義を確認したところ
// generate_content_image_gen_per_project_per_base_model_global が 1分あたり2リクエスト
// (= NUM_IMAGES 並列呼出1回分) しかなく、そもそも短間隔の連続生成を成立させる余地がない
// ことが判明した。リトライ（3秒→8秒→2026-07-12に10秒→20秒→40秒へ延長）を一度実装したが、
// リトライ呼出自体が同じ 1分ウィンドウ内の追加消費となり、かえって回復を遅らせている
// 疑いが実測ログから濃厚だったため撤去。連続生成の防止は呼び出し元 UI 側の
// クールダウン表示に委ねる方針とした。
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
                        // ALLOW_ALL: 未成年を含む人物生成を許可 (小説キャラクターの立ち絵に
                        // 子供が含まれる正当なケースが ALLOW_ADULT で一律ブロックされていた
                        // ため 2026-07-12 に変更。児童の性的搾取関連コンテンツの生成は
                        // Google の Prohibited Use Policy により本設定に関わらず禁止される)。
                        ...(isVertexAiMode() ? { personGeneration: 'ALLOW_ALL' as const } : {}),
                    },
                },
            })
        )
    );

    const images: string[] = [];
    const rejections: unknown[] = [];
    const omittedFinishReasons: string[] = [];
    for (const result of settled) {
        if (result.status === 'rejected') {
            rejections.push(result.reason);
            continue;
        }
        const uri = extractImageDataUri(result.value);
        if (uri !== null) {
            images.push(uri);
        } else {
            const finishReason = logImageOmittedNoData(result.value);
            if (finishReason !== null) {
                omittedFinishReasons.push(finishReason);
            }
        }
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
    // 安全フィルタ由来と判定できた場合はユーザーに理由が伝わる専用文言を優先する
    // (Issue #243 対応候補(b)、2026-07-12)。API エラー (rejections) が同時に混在
    // していても、安全フィルタ拒否の情報の方がユーザーにとって actionable なため優先する。
    const isSafetyBlocked = omittedFinishReasons.some(reason => SAFETY_FINISH_REASONS.has(reason));
    const failureDetail = rejections.length > 0
        ? ` (${rejections[0] instanceof Error ? rejections[0].message : String(rejections[0])})`
        : '';
    const message = isSafetyBlocked
        ? SAFETY_BLOCKED_MESSAGE
        : `画像生成に失敗しました: ${NUM_IMAGES}枚中${images.length}枚のみ成功しました。${failureDetail}`;

    if (successRatio > 0) {
        throw new PartialSuccessError(message, successRatio);
    }
    throw new Error(message);
};
