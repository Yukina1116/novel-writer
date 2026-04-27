# M3 PR-F: usage クォータ コスト設定の根拠

`server/services/usageConfig.ts` で定義した値の意思決定記録。
将来 `MONTHLY_LIMIT_SEN` / `ROUTE_COST_SEN` を変更する場合、本文書の前提を再評価したうえで更新する。

## 単位: sen (1/100 円)

整数 storage で浮動小数点誤差を排除する。Firestore は number を double で保管するが、
sen 単位なら 1 円単位の課金集計で精度問題が起きない。

JPY を選択した理由:
- ユーザーの可視化単位が円であり、変換が直感的
- USD storage だと exchange rate を service 内に持つ必要があり、レート変動で
  上限の意味が日次でブレる

## MONTHLY_LIMIT_SEN.free = 10000 (= 100 円)

ADR-0001 で定義した Tier 1 (free) の月間上限。

根拠:
- gemini-2.5-flash テキスト生成 1 回 = ~5-20 sen 想定 (input 数千 tokens × 0.075 USD/1M tokens、
  output 数百 tokens × 0.3 USD/1M tokens、137 JPY/USD で換算した目安)
- ADR-0001 の "AI 月 30 回テキストのみ" を満たすマージン込み (30 回 × 20 sen = 600 sen に
  10 倍のバッファ)
- Imagen 1 回 = ~1000 sen (10 円) なので、Tier 1 では実質最大 10 回までに制限される
  （明示的な Imagen 拒否ではなく、コスト上限による自然な制限）

## ROUTE_COST_SEN

route ごとに固定の予約コスト (sen)。実コストが下回る場合は commit 時の actualCost で精算可能
だが、PR-F では actualCost = estimatedCost で運用する（応答 metadata 経由の精算は将来課題）。

| route | sen | 円換算 | 根拠 |
|---|---|---|---|
| novel/generate | 200 | 2 | テキスト最長経路。input + output 大きめ |
| character/{update,reply,image-prompt} | 100 | 1 | 中程度のテキスト |
| world/{update,reply} | 100 | 1 | 同上 |
| image/generate | 1000 | 10 | Imagen 1 リクエスト = 4 画像生成、最も高コスト |
| utility/{names,knowledge-name} | 50 | 0.5 | 短文生成 |
| utility/extract-character | 100 | 1 | 中程度 |
| analysis/import | 200 | 2 | 大量テキスト分析 |

## MAX_PROCESSED_IDS = 200

usage doc の processedIds 配列上限。古い requestId は drop。
Firestore の 1 ドキュメント上限は 1MB。requestId が UUID v4 (36 chars) としても
200 件で ~7KB に収まり、FieldValue.arrayUnion 系の 100 要素制限にも触れない範囲で
冪等チェックの実用性を担保する。

## 上限変更の手順

1. `server/services/usageConfig.ts` の値を変更
2. 本文書の根拠表を更新（変更日と理由を追記）
3. `server/services/usageService.test.ts` の上限境界テストを追従
4. ADR-0001 と整合性チェック（Tier 構造の前提が変わる場合は ADR 改訂）

## PR-G 以降の拡張ポイント

- Tier 2 (paid) の上限値追加: M5 で Stripe 連携時に決定
- per-route の Tier 別上限 (例: Tier 1 では Imagen 拒否を厳格化): 必要に応じて
  `withUsageQuota` 内で `tier === 'free' && routeKey.startsWith('image/')` 等のガード追加
- actual metadata 精算: Vertex AI の応答 usage_metadata から token 数を取得し、
  commit の actualCost を補正
