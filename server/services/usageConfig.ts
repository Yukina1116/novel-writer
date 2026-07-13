// AI 月間利用量クォータの設定値。
//
// 単位は 1/100 円 = sen（整数）。Firestore に整数で保管し浮動小数点誤差を排除する。
// 実コストは Vertex AI / Imagen の応答 metadata から計算するのが理想だが、現状は
// route ごとに固定の estimatedCost を予約する簡略実装とする。actual metadata 取得は
// observability として将来追加する。
//
// 根拠と Tier 構造の議論は `docs/spec/m3/usage-cost-config.md` を参照。

// Tier。現状 'free' のみ実装。Tier 2 (paid) は Stripe 連携時に追加予定。
export type Tier = 'free';

// 月間上限（sen 単位）。Tier 1 = 100 円。
// gemini-3.1-flash-lite テキスト生成 30 回相当（実コスト数十 sen）に十分なマージンを確保。
// 画像生成（Nano Banana 2 Lite、1 回 = 2 枚並列生成、quota 制約により段階生成方式）は
// 1200 sen (12 円) 相当に設定。Google Cloud 公式料金 ($0.034/枚、1K 解像度、2026-07-05
// cloud.google.com/vertex-ai/generative-ai/pricing で確認) から実コスト ≈11円 (161円/USD)
// に約9%マージンを載せた値。上限100円なら実質最大8回 (16枚) 程度に制限される。
export const MONTHLY_LIMIT_SEN: Record<Tier, number> = {
    free: 10000,
};

// 開発者アカウント（DEVELOPER_UIDS）向けの月間上限。課金プラン (Tier) とは
// 意図的に分離した運用上の例外として管理する（将来 users.plan から Tier を
// 取得する経路に切り替わった際、この例外が課金プランの一種として誤って扱われる
// 事故を防ぐため、developerOverride.ts / withUsageQuota.ts 参照）。
// 完全な無制限 (undefined) ではなく、Tier 1 の 10 倍 = 1000 円相当の有限値とする
// ことで、テストがブロックされない十分な余裕を確保しつつ、リトライバグや誤操作
// による暴走時のコスト上限を残す（2026-07-13 code review 指摘反映）。
export const DEVELOPER_OVERRIDE_LIMIT_SEN = 100_000;

// AI route ごとの予約コスト（sen 単位）。
// 控えめに見積もり、実コストが上回った場合は commit で精算する設計。
export const ROUTE_COST_SEN = {
    'novel/generate': 200,
    'character/update': 100,
    'character/reply': 100,
    'character/image-prompt': 100,
    'world/update': 100,
    'world/reply': 100,
    'image/generate': 1200,
    'utility/names': 50,
    'utility/knowledge-name': 50,
    'utility/extract-character': 100,
    'analysis/import': 200,
} as const satisfies Record<string, number>;

export type AiRouteKey = keyof typeof ROUTE_COST_SEN;

// 同月内に冪等チェックする requestId の保持件数。古いものから drop して
// usage doc サイズを抑える。1 ユーザーが月内にこの数を超えるリクエストを
// 出した場合、それ以前の requestId は再送可能になる（実害は二重課金分のみ）。
export const MAX_PROCESSED_IDS = 200;
