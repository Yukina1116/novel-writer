// FE / BE 双方が参照する画像生成バッチサイズの共通定数。
// Vertex AI の generate_content_image_gen_per_project_per_base_model_global quota が
// 2 req/分/プロジェクト/モデル (2026-07-05 実測) のため、1 回の呼び出しで生成する
// 枚数を quota 上限に固定する。server/services/imageService.ts (並列呼び出し数) と
// components/ImageGenerationModal.tsx (ローダー表示枚数・「追加生成」ボタン文言) が
// 同じ値を参照することで、quota 変更時の枚数変更を 1 箇所に閉じる。
export const IMAGE_GENERATION_BATCH_SIZE = 2 as const;

// 直前の生成 (IMAGE_GENERATION_BATCH_SIZE 分の quota を消費) から次の生成までに
// 空けるべき最低間隔。2026-07-12 prod 実測で、429 (RESOURCE_EXHAUSTED) 発生後に
// リトライ (合計70秒) を使い切ってもなお回復しないケースが確認され、リトライ自体が
// 同じ quota window 内の追加消費となり回復を遅らせている疑いも濃厚だったため、
// リトライは撤去し FE 側の生成前クールダウンで連続生成そのものを防ぐ方針に変更した。
// quota window が fixed か sliding かは未確定 (Google 非公開)。429 直後に次の成功
// まで要した実測間隔 (最短169秒、リトライ試行を含む値のため撤去後の正確な回復時間
// ではない点に留意) を踏まえ、120 秒に設定。
export const IMAGE_GENERATION_COOLDOWN_MS = 120_000 as const;
