// FE / BE 双方が参照する画像生成バッチサイズの共通定数。
// Vertex AI の generate_content_image_gen_per_project_per_base_model_global quota が
// 2 req/分/プロジェクト/モデル (2026-07-05 実測) のため、1 回の呼び出しで生成する
// 枚数を quota 上限に固定する。server/services/imageService.ts (並列呼び出し数) と
// components/ImageGenerationModal.tsx (ローダー表示枚数・「追加生成」ボタン文言) が
// 同じ値を参照することで、quota 変更時の枚数変更を 1 箇所に閉じる。
export const IMAGE_GENERATION_BATCH_SIZE = 2 as const;
