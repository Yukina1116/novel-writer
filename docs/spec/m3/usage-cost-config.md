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

根拠 (M3 設計時点、当時のモデルは gemini-2.5-flash):
- gemini-2.5-flash テキスト生成 1 回 = ~5-20 sen 想定 (input 数千 tokens × 0.075 USD/1M tokens、
  output 数百 tokens × 0.3 USD/1M tokens、137 JPY/USD で換算した目安)
- ADR-0001 の "AI 月 30 回テキストのみ" を満たすマージン込み (30 回 × 20 sen = 600 sen に
  10 倍のバッファ)
- Imagen 1 回 = ~1000 sen (10 円) なので、Tier 1 では実質最大 10 回までに制限される
  （明示的な Imagen 拒否ではなく、コスト上限による自然な制限）

> **2026-07-05 追記**: テキストモデルは `gemini-3.1-flash-lite`（入力 $0.25/1M・出力 $1.50/1M、
> 旧モデルより安価）、画像モデルは `gemini-3.1-flash-lite-image`（Nano Banana 2 Lite）へ移行済み。
> Vertex AI の `generate_content_image_gen_per_project_per_base_model_global` quota が
> 2 req/分/プロジェクト/モデル（`gcloud alpha services quota list` で実測）のため、画像生成は
> 「1 回 = 2 枚並列生成、追加生成ボタンで段階的に追記」方式に変更。
>
> `image/generate` の sen は Google Cloud 公式料金ページ（$0.034/枚、1K 解像度、
> cloud.google.com/vertex-ai/generative-ai/pricing で確認）を基に実コストへ追従させ、
> 1000 sen → **1200 sen** に修正（下表参照）。なお、旧 Imagen 4 ($0.04/枚) より
> Nano Banana 2 Lite ($0.034/枚) の方が単価は約15%安い。旧 1000 sen の値は、そもそも
> 旧 Imagen 4 の実コスト（4枚 = $0.16 ≈ 22〜26円）に対して過小だった見積もり誤差であり、
> 今回のモデル切替が原因ではない。
>
> コンバージョン最適化（無料枠でのユーザー体験と有料転換の設計）の観点は
> [novel-writer#232](https://github.com/Yukina1116/novel-writer/issues/232) で別途検討する。

## ROUTE_COST_SEN

route ごとに固定の予約コスト (sen)。実コストが下回る場合は commit 時の actualCost で精算可能
だが、PR-F では actualCost = estimatedCost で運用する（応答 metadata 経由の精算は将来課題）。

| route | sen | 円換算 | 根拠 |
|---|---|---|---|
| novel/generate | 200 | 2 | テキスト最長経路。input + output 大きめ |
| character/{update,reply,image-prompt} | 100 | 1 | 中程度のテキスト |
| world/{update,reply} | 100 | 1 | 同上 |
| image/generate | 1200 | 12 | Nano Banana 2 Lite 2 並列リクエスト = 2 画像生成（quota制約により段階生成）。実コスト $0.034/枚 × 2 ≈ 11円 (161円/USD, 2026-07-05時点) に約9%マージン |
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
- per-route の Tier 別上限 (例: Tier 1 では画像生成拒否を厳格化): 必要に応じて
  `withUsageQuota` 内で `tier === 'free' && routeKey.startsWith('image/')` 等のガード追加
- actual metadata 精算: Vertex AI の応答 usage_metadata から token 数を取得し、
  commit の actualCost を補正
