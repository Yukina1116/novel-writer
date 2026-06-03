# Handoff: Issue #137 #2 残り collection-level guard 実装完了 + PR 作成準備

- Session Date: 2026-06-03 (4 セッション目)
- Owner: yasushi-honda
- Status: 🟢 T1-T6 完了、T7 (commit + push + PR) 着手中
- Previous handoff: [2026-06-03e-collection-level-guard-design-handoff.md](./2026-06-03e-collection-level-guard-design-handoff.md)
- 設計文書: [docs/spec/promptSafety/2026-06-03-collection-level-guard-design.md](../spec/promptSafety/2026-06-03-collection-level-guard-design.md)

## 本セッション成果

| Phase | 内容 | 状態 |
|---|---|---|
| T1+T2 | AC-1〜14 テスト + 実装 (TDD Red を commit せず 1 セット) | ✅ |
| T3 | `npm test` 616/616 PASS + `npm run lint` clean | ✅ |
| T4 | `/safe-refactor` LOW 1 件のみ (規律継承で保持推奨、修正不要) | ✅ |
| T5 | `/code-review low` `(none)` | ✅ |
| T6 | 本 handoff doc 追加 | ✅ |
| T7 | commit + push + PR 作成 | 🟢 着手中 |
| T7.5 | post-pr-review hook 判定 → `/review-pr` (large tier 該当時) | ⏸ |
| T8-T10 | 指摘反映 → CI → 番号単位明示認可 → merge | ⏸ |

## 実装内容

### 変更ファイル

| ファイル | 変更行数 |
|---|---|
| `server/utils/promptSafety.ts` | +91 / -10 |
| `server/utils/promptSafety.test.ts` | +258 / -1 |

### 追加 export / 新規 helper

| 識別子 | 種別 | 値 |
|---|---|---|
| `COLLECTION_OVERFLOW_MARKER` | export const | `'[collection-overflow: subsequent items omitted to fit token budget]'` |
| `MAX_COLLECTION_BYTES` | private const | `200_000` |
| `estimateElementBytes(value: unknown): number` | private function | JSON.stringify + try-catch + `?? 'null'` の二重 defensive |

### `stripPromptHeavyFields` 改修箇所

- `collectionAggregator` を `createWarnAggregator('collection-overflow', ...)` で 1 instance 生成
- array recurse loop を `value.map((item, idx) => ...)` から `for (let idx ...) { ... }` に変更
  - 閾値超え検出時: `cumulativeBytes > MAX_COLLECTION_BYTES` で短絡 → marker push + `tick(lazy builder, path)`
  - 通常時: recurse → push → `cumulativeBytes += estimateElementBytes(replaced)` + `keptCount++`
- 関数末尾に `collectionAggregator.flush()` を image/non-image/depth と並列で追加

### AC pin 14 件 (新規 describe block)

| # | テスト | 焦点 |
|---|---|---|
| AC-1 | 199KB array → 全 element 保持 | 閾値内全保持の境界 |
| AC-2 | ~1MB array (500 件 × 2000B) → 閾値超で marker | 攻撃 payload pin |
| AC-3a/3b | 200 件 × 999B / 250 件 × 1000B | 境界 semantics (`> 200,000` の prose 規律) |
| AC-4 | nested object in array | per-element JSON.stringify 累積 |
| AC-5 | image dataURI と co-existence | marker 化済 element は cumulative 圧迫しない |
| AC-6 | warn payload 6 フィールド | path / arrayLength / cumulativeBytes / droppedIndex / maxCollectionBytes / keptCount |
| AC-7 | sibling array 独立 (batch.pathPrefixes 経由) | 個別 warn 50 件打ち止め後の観測 |
| AC-8 | nested array 内側 closure 独立 (外側 1 件構成) | 外側 array に counter が持ち越されない |
| AC-9 | non-array 影響なし | object/scalar 既存挙動維持 |
| AC-11 | batch event `collection-overflow-batch` 発火 + pathPrefixes 継承 | PR #144 規律継承 |
| AC-12 | image-omitted との cross-event independence | 別 histogram / 別 counter |
| AC-13 | `[undefined, ...]` defensive | throw せず処理完了 |
| AC-14 | `[1n, ...]` (BigInt) defensive | try-catch fallback で 4 byte 扱い |

AC-10 (regression なし) は `npm test` 616/616 PASS で代替。

## 設計文書との差分 (本セッション発見・記録すべき事項)

### 1. AC-3 table の誤植発見 (prose 優先)

設計文書 §8 AC-3 table:
> | 201 件 × 1,000B | cumulative 1,000 → 200,000 → 201,000 | 200 件保持、201 件目 marker |

設計文書 §5 prose / pseudo-code:
> `cumulativeBytes > MAX_COLLECTION_BYTES`、`200,000` ちょうどは保持

prose / pseudo-code が正本 (実装と整合)。201 件 × 1000B の実機挙動は **201 件全保持** (idx=200 入口で cumulative=200,000 → 保持 → 201,000、終了)。「200 件保持 + 1 件 marker」を実現する境界は **202 件 × 1000B** (1002B/件で cumulative 199,398 → 200,400 → idx=200 入口で 200,400>200,000 で fire)。

テストは prose を採用し、AC-3a (200 件 × 999B 全保持) / AC-3b (250 件 × 1000B 部分 marker, droppedIndex=200) で書いた。

### 2. AC-7/AC-8 修正の経緯 (TDD で発見)

- **AC-7 (sibling array 独立)**: 個別 warn は `MAX_WARN_PER_CALL=50` で打ち止まるため、sibling `b[`path が個別 warn に出ない。`collection-overflow-batch.pathPrefixes` で `a[*]` / `b[*]` 両方確認する規律 (PR #144 で確立) に変更
- **AC-8 (nested array)**: 外側 array に複数 inner を入れると inner recurse 結果 (~200KB) が外側 cumulative を圧迫して外側も overflow する。「外側 1 件構成」(`matrix: [inner]`) に変更し「内側 closure 独立性」のみ pin

### 3. 既存 lazy-builder regression test の期待値更新

`server/utils/promptSafety.test.ts:507-511` の `byteLengthCalls < 200 / >= 150` は、`estimateElementBytes` 追加で +100 増えるため `< 350 / >= 250` に更新。lazy 化の本質 (threshold 超後の tick builder skip) は維持されており、collection-overflow guard 分の独立計算分が baseline に加算される旨をコメントで明記。

## /safe-refactor 結果

HIGH/MEDIUM 0 件、LOW 1 件 (`observedKeptCount` / `observedCumulativeBytes` の local snapshot は overkill だが PR #143/#144 で確立した lazy builder 規律と整合性保持のため保持推奨)。修正不要。

## /code-review low 結果

`(none)` — runtime-correctness bug 検出ゼロ。

## 引き継ぎ事項

### T7 commit message 案

```
feat(prompt-safety): array 単位の累積 byte threshold guard (Refs #137 #2)

- 追加: COLLECTION_OVERFLOW_MARKER (export), MAX_COLLECTION_BYTES=200_000,
  estimateElementBytes helper (try-catch + ?? 'null' で BigInt/循環参照 defensive)
- 改修: stripPromptHeavyFields array recurse に独立 cumulative counter を追加。
  閾値超 (cumulativeBytes > 200_000) で短絡 marker 置換 + tick で collection-overflow
  集約。sibling/nested array は closure local で counter 独立。
- テスト: AC-1〜14 (基本 + 境界値 + 観測性 + cross-event + defensive)。設計文書 §8
  AC-3 table の誤植 (201 件→200 件保持と書かれているが prose は 201 件全保持) を prose
  / pseudo-code 採用で修正、handoff doc に記録。
- 既存 lazy-builder regression test の byteLengthCalls baseline を 150-200 →
  250-350 に更新 (estimateElementBytes 分の +100)。

設計: docs/spec/promptSafety/2026-06-03-collection-level-guard-design.md
Refs #137
```

### post-pr-review hook の large tier 判定

PR #143 (641 行 / 4 ファイル) / PR #144 (495 行 / 3 ファイル) はともに large tier で `/review-pr` 5 並列発火した。本 PR は **+349 / -11 (2 ファイル)** なので large tier 判定 (>=200 行 or >=3 ファイル) に該当 → `/review-pr` 5 並列 (type-design-analyzer は新規 type 追加なしのため除外) を準備しておく。

### マージ認可フォーマット (本田様向け)

```
PR #<番号> — feat(prompt-safety): array 単位の累積 byte threshold guard (2 files, +349/-11)
```

## 本田様判断待ち事項 (継続、AI 側でできることなし)

- 本番 dev Cloud Logging で発火確認 (実トラフィック発生時、PR #145 で追加される `safetyEvent: 'collection-overflow'` / `'collection-overflow-batch'` 含む)
- モバイル実機確認 (PR #128-#130 レスポンシブ修正)
- 法務確認 (顧問弁護士 → public/legal/*.md 文言確定、M7-β)
- #125 多ターン E2E

## Issue #137 の状態 (Update 候補)

- **#137 #1** ✅ PR #143 完了
- **#137 #2 残り** 🟢 本 PR で実装完了、merge 待ち
- **#137 #5** ✅ PR #144 完了
- **#137 #6** logger.warnSampled altitude — 別 milestone (未着手)
- **#137 #7** Statsig/metric counter — 起票済
- **#137 #8 候補** `truncateOversizedStrings` の path 追跡 — `(no-path)` bucket 経由で観測可能化済

merge 後の状態: 完了 = 3/7 → 4/7 (collection-level guard 完成で Issue #134 の cumulative bypass 軸が構造的に閉鎖)。

## 学び (本セッション)

- **設計文書 prose vs table の不整合**: AC table を機械的に転記すると正しい semantics を取り違える。pseudo-code / prose を正本としてテストを書く規律を徹底
- **TDD 規律で nested array の overflow chain を発見**: AC-8 設計時の「nested 構造で内側独立」想定は、外側 array でも cumulative guard が走るため複数 inner を入れると外側 overflow する。1 件構成への修正で本質 (closure 独立性) を残しつつ観測可能に
- **個別 warn vs batch event の使い分け**: sibling/multi-source の独立性は **個別 warn では 50 件打ち止めにより観測不能**。`batch.pathPrefixes` (PR #144 規律) で初めて pin 可能
