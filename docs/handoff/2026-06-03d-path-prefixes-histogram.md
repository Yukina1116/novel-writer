# Handoff: Issue #137 #5 pathPrefixes histogram 追加

- Session Date: 2026-06-03 (3 セッション目 - 続き)
- Owner: yasushi-honda
- Status: 🟡 PR 作成待ち (feature/path-prefixes-histogram、ローカル commit 済)
- Previous handoff: [2026-06-03c-non-image-data-uri-detection.md](./2026-06-03c-non-image-data-uri-detection.md)

## 今セッションのトリガー

PR #143 マージ完了 (Issue #137 #1 構造的閉鎖) を受け、本田様の判断で Issue #137 残課題のうち **#137 #5 (batch log の pathPrefixes histogram)** を「設計判断軽い enhancement」として次に着手。

## 設計プロセス

| Phase | 内容 |
|---|---|
| /impl-plan Phase 1 (OQ 1 回目) | top-N、prefix 切り詰め戦略、aggregator API の 3 件を AskUserQuestion で確定 (N=5 / array index normalize のみ / tick payload 自動検出) |
| /impl-plan Phase 1 (OQ 2 回目) | **落とし穴判明**: 「tick payload 自動検出」は PR #140 lazy builder と両立しない (threshold 超後の buildPayload() 呼出 = Buffer.byteLength regression)。3 案 (F: tick 第 2 引数 / G: lazy 犠牲 / H: 別 helper) 提示し、**案 F (tick(builder, path?: string))** 確定 |
| 実装 U1-U3 | TDD + safe-refactor + code-review low 全 PASS |

## 変更内容

### `server/utils/promptSafety.ts` (+50 行)

新規:
- `PATH_PREFIX_TOP_N = 5` (Cloud Logging payload size と observability の妥協点)
- `ARRAY_INDEX_PATTERN = /\[\d+\]/g` (array index normalize 用 regex)
- `NO_PATH_BUCKET = '(no-path)'` (path 未渡しの集約 bucket)
- `normalizePathForHistogram(path?: string)`: undefined → `(no-path)`、`[N]` → `[*]` 置換
- `WarnAggregator.tick` signature 拡張: `(buildPayload, path?: string) => void`
- `createWarnAggregator` 内 `pathHistogram: Map<string, number>` 追加、tick で常時 inc
- `flush` で histogram の **top-5 を count 降順で抽出**して batch payload に `pathPrefixes` 同梱

`stripPromptHeavyFields` の 3 callsite に path 引数追加:
- `imageAggregator.tick(builder, path)`
- `nonImageAggregator.tick(builder, path)`
- `depthAggregator.tick(builder, path)` (depth-exceeded marker 経路)

`truncateOversizedStrings` の 2 callsite は**変更なし** (path 追跡未実装、`(no-path)` bucket に集約)。

### `server/utils/promptSafety.test.ts` (+~165 行、+9 件 PASS)

`createWarnAggregator path histogram (Issue #137 #5)` describe で AC-1〜9:

| # | テスト |
|---|---|
| AC-1 | 単一 path 多発 (gallery[0].url × 100) → pathPrefixes: [['gallery[*]', 100]] |
| AC-2 | 異種 path 混在 → 各 prefix が count とともに記録 |
| AC-3 | top-5 超 → 上位 5 prefix のみ、低頻度 path は drop |
| AC-4 | array index normalize: `gallery[0]` `gallery[1]` `gallery[2]` が `gallery[*]` に集約 |
| AC-5 | path 未渡し (truncateOversizedStrings 経由) → `(no-path)` bucket |
| AC-6 | 50 件以下では batch event 自体 emit されない (pathPrefixes も出ない) |
| AC-7 | cross-aggregator independence: image / non-image batch が別 histogram |
| AC-8 | non-image-data-uri-omitted-batch でも pathPrefixes 載る (PR #143 経路) |
| AC-9 | recursion-depth-exceeded-batch でも pathPrefixes 載る |

## 検証結果

| 項目 | 結果 |
|---|---|
| `npm test -- promptSafety` | 79 件 PASS (70 + 9) |
| `npm test` (全件) | 599 件 PASS (590 + 9) |
| `npm run lint` (tsc --noEmit) | 0 errors |
| `/safe-refactor` Phase 1 | HIGH/MEDIUM/LOW 0 件 |
| `/code-review low` | (none) — correctness bug 検出ゼロ |

## Lazy builder altitude の維持 (重要)

PR #140 で「`tick(() => payload)` の builder は threshold 超後は呼ばない (Buffer.byteLength の重い計算 skip)」規律を確立済。本 PR で histogram 集計を入れる際、buildPayload() 経由で path を取り出すと **threshold 超後も builder を呼ぶ必要があり lazy 利点が消失**する落とし穴があった。

案 F (tick signature 拡張) で「path のみ軽量別経路で渡す」ことで、PR #140 altitude を維持しつつ histogram を実装した。trade-off:
- callsite 変更: 3 箇所で path 引数追加 (+1 トークン/箇所)
- 自動検出は半分: aggregator は path を histogram に集計するが、callsite から明示的に path を渡す必要あり

## Issue #137 状態

- **#137 #1** ✅ PR #143 で完了
- **#137 #5** 🟡 本 PR で完了予定 (close せず Issue は open 維持)
- **#137 #2 残り** collection-level guard — 未着手
- **#137 #6** logger.warnSampled altitude — 別 milestone
- **#137 #7** Statsig/metric counter — 起票済 (https://github.com/Yukina1116/novel-writer/issues/137#issuecomment-4610248160)
- **#137 #8 (新規候補)** `truncateOversizedStrings` の path 追跡 — 本 PR で `(no-path)` bucket になる経路。enhancement レベル

## 次のアクション

1. **U4**: `git push -u origin feature/path-prefixes-histogram` + `gh pr create`
2. **U5**: CI Success 確認 → 本田様の番号単位明示認可待ち → `gh pr merge --squash`

### マージ後の手動確認

- 本番 dev Cloud Logging で `*-batch` event の `pathPrefixes` フィールド出現確認 (実トラフィック発生時、本田様判断)

## 学び / 規律

- **Phase 4-5 で落とし穴発見**: 設計判断時点 (OQ 1 回目) では見えなかった「lazy builder vs histogram の両立」問題が impl-plan Phase 中の細部詰めで顕在化。OQ 2 回目で軌道修正できた
- **`/brainstorm` スキップ判断の境界線**: 「設計判断軽い enhancement」を本田様が評価したため /brainstorm スキップで /impl-plan 直行したが、設計の細部に重要な trade-off が潜むケースは impl-plan 内で AskUserQuestion 追加で吸収可能
