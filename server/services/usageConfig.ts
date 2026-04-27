// AI 月間利用量クォータの設定値（PR-F）。
//
// 単位は 1/100 円 = sen（整数）。Firestore に整数で保管し浮動小数点誤差を排除する。
// 実コストは Vertex AI / Imagen の応答 metadata から計算するのが理想だが、PR-F では
// route ごとに固定の estimatedCost を予約する簡略実装とする。actual metadata 取得は
// observability として将来追加する。
//
// 根拠と Tier 構造の議論は `docs/spec/m3/usage-cost-config.md` を参照。

// Tier。M3 では 'free' のみ実装。Tier 2 (paid) は M5 で追加。
export type Tier = 'free';

// 月間上限（sen 単位）。Tier 1 = 100 円。
// gemini-2.5-flash テキスト生成 30 回相当（実コスト数十 sen）に十分なマージンを確保。
// Imagen は 1 回 = 1000 sen (10 円) 相当に設定し、上限 100 円なら自動で最大 10 回に制限される。
export const MONTHLY_LIMIT_SEN: Record<Tier, number> = {
    free: 10000,
};

// AI route ごとの予約コスト（sen 単位）。
// 控えめに見積もり、実コストが上回った場合は commit で精算する設計。
export const ROUTE_COST_SEN = {
    'novel/generate': 200,
    'character/update': 100,
    'character/reply': 100,
    'character/image-prompt': 100,
    'world/update': 100,
    'world/reply': 100,
    'image/generate': 1000,
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
