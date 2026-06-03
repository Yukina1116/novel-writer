# Handoff: promptSafety 構造化 — Issue #137 サブタスク #1/#2残り/#5 完了 (PR #143/#144/#145)

- Session Date: 2026-06-03 (3-4 セッション目通算)
- Owner: yasushi-honda
- Status: ✅ 再開可能 (main clean `58f3c35`、PR #145 Cloud Run main デプロイ in_progress、Issue #137 のみ open でサブ残課題明確化)
- Previous handoff: [2026-06-03b-prompt-safety-hardening.md](./2026-06-03b-prompt-safety-hardening.md) (2 セッション目までの 5 PR まとめ)

## 本セッション (3-4 セッション目) のトリガー

前セッション (2 セッション目) で `Issue #137` を起票し 4 サブ項目を残してハンドオフ。本田様から `次のアクション:優先順にすすめて` の指示で、緊急性 LOW の enhancement を順次解消。各 PR で `/code-review low` + 大規模時は `/review-pr` 5 並列 (type-design-analyzer 除外) を回し、見つかった correctness 残点・brittle test を **同 PR 内で fix** する反復で進めた。

## 完了 PR (3 件、全 main マージ + Cloud Run デプロイ success)

| PR | 内容 | 規模 | merge |
|---|---|---|---|
| #143 | feat: 非画像 dataURI 検出層追加 + isImageDataUri を case insensitive 化 (Refs #137 #1) | 4 files, +641/-? | `9bca971` |
| #144 | feat: batch log に pathPrefixes histogram を追加 + cardinality cap + paired signal (Refs #137 #5) | 3 files, +495/-? | `7f5e571` |
| #145 | feat: array 単位の累積 byte threshold guard + defensive coding (Refs #137 #2) | 5 files, +986/-10 | `58f3c35` |

合計: 12 files / +2122 行、テスト数 +50 件 (569 → 619)。

## アーキテクチャ進化 (3 段階、Issue #134 register-or-forget 解消の継続)

### PR #143 (非画像 dataURI 検出層)

- `NON_IMAGE_DATA_URI_MARKER` 追加、`isNonImageDataUri(value)` で `data:` 始まり / `data:image/` 不始まり / `MIN_NON_IMAGE_DATA_URI_BYTES=500` 以上を検出
- `isImageDataUri` を `normalizeForDataUriDetection(s) = s.trimStart().toLowerCase()` 経由で case insensitive 化 (RFC 2397 整合)
- 判定順 image → non-image を `recurse` 内で固定

### PR #144 (path histogram + cardinality cap + paired signal)

- batch log payload に `pathPrefixes` (top-5 path 分布) / `truncatedBucketCount` 追加
- `MAX_HISTOGRAM_BUCKETS=256` で aggregator OOM 防御 (silent fail を paired signal 規律で構造的に閉鎖)
- `(overflow)` bucket + `histogram-overflow` warn (per aggregator 1 度だけ、`parentEvent` 付き) で saturation を early-detection 通知
- `ARRAY_INDEX_PATTERN` で `gallery[0].url` → `gallery[*].url` に normalize、`(no-path)` bucket で path 未渡し caller を観測可能化

### PR #145 (collection-level cumulative byte guard)

- `MAX_COLLECTION_BYTES = 200_000` (private) + `COLLECTION_OVERFLOW_MARKER` (export) を追加
- `stripPromptHeavyFields` array recurse に independent な cumulative byte counter (`> MAX_COLLECTION_BYTES` で閾値超、ちょうどは保持)
- `estimateElementBytes(value)` helper で `JSON.stringify(v) ?? 'null'` + try-catch 二重 defensive (BigInt / 循環参照 / undefined / function / symbol で throw しない)
- `collectionAggregator` を image/non-image/depth と並列に flush (codex セカンドオピニオン Medium 5 「flush 忘れ防止」)
- sibling/nested array は closure local 変数で counter 独立 (AC-7/AC-8 で pin)

## レビュー方式 (本セッションで強化)

- **PR #143**: brainstorm 2 回 (OQ → codex セカンドオピニオン) → impl-plan T1-T10 → /safe-refactor + /code-review low + /review-pr 6 並列
- **PR #144**: 同パターン + lazy builder vs histogram trade-off の OQ 2 回目で軌道修正
- **PR #145**: brainstorm + 設計文書 314 行 + codex セカンドオピニオン 11 件 (High 3 / Medium 3 / Low 5) 反映 → /review-pr 5 並列 (type-design-analyzer 除外) → Critical 1 + Important 7 を同 PR 反映

5 review エージェント並列の指摘集約 → 同 PR fix の流れが安定。

## Issue Net 変化 (本セッション通算)

- Close 数: 0 件 (Issue #137 は umbrella で残)
- 起票数: 0 件
- Net: **0 件**

**Net = 0 だが umbrella Issue サブ進捗で許容**:
- Issue #137 のサブタスク #1 / #2 残り / #5 を **3 件完了** (コード上)
- 残サブタスク: #6 (logger.warnSampled altitude、別 milestone) / #7 (Statsig counter、起票済) / #8 候補 (truncateOversizedStrings path 追跡)
- Issue #137 全体 close は #6/#7/#8 決着後 (規律 D 継承: [`docs/handoff/2026-06-03e-...`](./2026-06-03e-collection-level-guard-design-handoff.md))

CLAUDE.md GitHub Issues 規律「Net ≤ 0 は進捗ゼロ扱い」だが、umbrella Issue 内のサブ進捗としては前回 handoff と同じ判断 (PR #143/#144 と整合)。

## Issue #137 残課題 (active、open 維持)

| サブ項目 | 内容 | 状態 |
|---|---|---|
| #137 #1 | non-image dataURI gap | ✅ PR #143 完了 |
| #137 #2 残り | collection-level guard | ✅ PR #145 完了 |
| #137 #5 | pathPrefixes histogram | ✅ PR #144 完了 |
| #137 #6 | logger.warnSampled altitude | ⏸ 別 milestone (未着手) |
| #137 #7 | Statsig/metric counter | ⏸ 起票済、未着手 |
| #137 #8 候補 | `truncateOversizedStrings` の path 追跡 | ⏸ `(no-path)` bucket 経由で観測可能化済、本格 path 追跡は別 enhancement |

完了 = 4/7 (#3 含む前セッション完了分)、未着手 = 3/7。緊急性 LOW、size guard / collection guard / paired signal 全て backstop が機能。

## 本田様判断待ち / 外部依存 (継続、AI 側でできることなし)

| 項目 | 状態 |
|---|---|
| Cloud Logging で `safetyEvent: 'image-omitted'` / `'non-image-data-uri-omitted'` / `'collection-overflow'` / `*-batch` / `'recursion-depth-exceeded'` / `'histogram-overflow'` の実トラフィック発火確認 | dev デプロイ後の手動 grep |
| `pathPrefixes` / `truncatedBucketCount` histogram の payload 観察 (PR #144) | 同上 |
| モバイル実機確認 (PR #128-#130 のレスポンシブ修正) | 前 handoff からの継続課題 |
| 法務確認 (顧問弁護士 → public/legal/*.md 文言確定、M7-β) | 外部依存 |
| #125 多ターン E2E (「それで」継続 + intent 引き継ぎの実トラフィック実証) | 外部依存 |

## テスト推移

| PR | 件数 |
|---|---|
| セッション開始時 (前 handoff b- 終了時) | 569 |
| PR #143 後 | 583 (+14: 非画像 dataURI / case insensitive / cross-event) |
| PR #144 後 | 602 (+19: pathPrefixes / cardinality cap / overflow bucket / paired signal) |
| PR #145 後 | 619 (+17: AC-1〜15 + AC-9b/14b 含む、循環参照 / empty array / histogram-overflow × collection 等) |

## 学び (本セッション 3 PR + 設計文書 1 件)

1. **brainstorm Phase 中の OQ 追加で軌道修正可能**: PR #144 の lazy builder vs histogram の trade-off 落とし穴を OQ 2 回目で吸収
2. **codex セカンドオピニオン (plan モード)** は brainstorm Phase 6 直前が最適。PR #145 は 11 件指摘を全件反映してから設計文書化
3. **/review-pr 5 並列 → 同 PR fix の context 消費**: PR #143/#144/#145 ともに 30-40K tokens 消費。Phase 9 着手前のセッションは ctx 余裕 (50% 以上) を確保
4. **設計文書の prose vs AC table 誤植**: PR #145 で AC-3 table (`201 件 × 1000B → 200 件保持`) が pseudo-code (`>` 演算子) と矛盾を発見。TDD で実機検証 → prose を正本として table を訂正、handoff doc に記録
5. **paired signal 規律の橫展開**: PR #144 の histogram-overflow paired signal が aggregator factory 共通実装で PR #145 の collection-overflow にも自動継承 (AC-15 で pin)
6. **defensive coding の 2 層化**: `JSON.stringify(v) ?? 'null'` + try-catch で undefined/function/symbol vs BigInt/循環参照/throwing toJSON の 5 失敗パターンを構造的に潰す。AC-13/14/14b で pin

## 規範遵守確認

- ✅ main 直 push なし (3 PR すべて feature ブランチ + PR 経由)
- ✅ PR マージは番号単位明示認可後 (`PR #145 をマージしてよい` 受領 → squash merge)
- ✅ review-pr 5 並列の Critical/Important 指摘を同 PR 内で全件反映
- ✅ Issue Net 0 だが umbrella サブタスク 3 件完了で実質進捗あり (前 handoff 規律 D 継承)
- ✅ ドキュメント整合性: CLAUDE.md / docs/handoff / 設計文書 / Issue で promptSafety 関連の記述ズレなし
- ✅ 残留 Node プロセスなし

## 次セッション再開ガイド

`/catchup` で `Issue #137` のみ active、本田様判断待ち 5 件 (Cloud Logging 6 種類 / モバイル / 法務 / E2E / pathPrefixes 観察) で再開可能。

優先度の高い未着手サブタスクは:
- **Issue #137 #6** logger.warnSampled altitude — 別 milestone (未着手、ROI 評価で延期判断)
- **Issue #137 #7** Statsig/metric counter — 起票済 (Issue #137 コメント参照)
- **Issue #137 #8 候補** `truncateOversizedStrings` の path 追跡 — `(no-path)` bucket 経由で観測可能化済、本格対応は緊急性 LOW

すべて緊急性 LOW で本田様の優先順位判断に委ねる状態。`/catchup` 後に「優先順にすすめて」指示があれば #6/#7/#8 のいずれかから brainstorm or codex セカンドオピニオン先行が妥当。
