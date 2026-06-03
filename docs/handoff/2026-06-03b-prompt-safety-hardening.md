# Handoff: promptSafety 構造化 — Issue #134/#137 part 1+α 5 PR 連続着地

- Session Date: 2026-06-03 (2 セッション目)
- Owner: yasushi-honda
- Status: ✅ 再開可能 (main clean `ab45acd`、Cloud Run デプロイ全 PR success、Issue #137 のみ open で残課題明確化)
- Previous handoff: [2026-06-03-prompt-safety-token-bomb-fix.md](./2026-06-03-prompt-safety-token-bomb-fix.md)

## 今セッションのトリガー

前セッションで `Issue #134` (whitelist register-or-forget 解消、content-based dataURI 検出移行) を起票したまま終了。本田様から `次のアクション:優先順にすすめて` の指示で、緊急性 LOW の enhancement を順次解消する流れに着手。各 PR で `/code-review medium` を回し、見つかった correctness 残点を **同 PR 内で fix** + **PLAUSIBLE は Issue に追記** する反復で進めた。

## 完了 PR (5 件、全 main マージ + Cloud Run デプロイ success)

| PR | 内容 | 規模 | merge |
|---|---|---|---|
| #136 | fix: whitelist 廃止し content-based dataURI 検出に切替 (Closes #134) + code-review 同梱 (depth guard / prototype pollution skip / doc drift / test name drift) | 2 files, +268/-92 | `a5e649b` |
| #138 | fix: MIN_IMAGE_DATA_URI_BYTES を 100 → 500 へ引き上げ + 境界値テスト 3 件 (Refs #137 #2) | 2 files, +46/-9 | `e09b897` |
| #139 | fix: per-call warn aggregation で log amplification を抑制 + code-review 同梱 (depth-exceeded counter 化 + JSDoc 量的明示) (Refs #137 #3) | 2 files, +272/-25 | `25a87cb` |
| #140 | refactor: createWarnAggregator factory 抽出 + code-review 同梱 (lazy builder eager regression 閉鎖) (Refs #137 #4) | 2 files, +177/-101 | `1b39351` |
| #141 | refactor: factory altitude 補強 (a-d) + code-review 同梱 (eslint-disable / type export / JSDoc warning) (Refs #137 #4 残り) | 2 files, +149/-44 | `ab45acd` |

合計: 11 files / +912/-271 行、テスト数 +26 件 (543 → 569)。

## アーキテクチャ進化 (3 段階)

### PR #136 (whitelist → content-based)

```ts
// 旧 (PR #132/#133)
const IMAGE_FIELD_PATHS = ['appearance.imageUrl', 'mapImageUrl'];  // register-or-forget リスク
// 新 (PR #136)
function isImageDataUri(value): boolean {
  return value.startsWith('data:image/') && Buffer.byteLength(value, 'utf8') >= MIN_IMAGE_DATA_URI_BYTES;
}
```

任意 path の `data:image/` 始まり文字列 (100B 以上、後に PR #138 で 500B に引き上げ) を再帰スキャンで marker 化。新フィールド追加で自動カバー。同 PR で:
- depth guard (V8 stack overflow DoS 防御)
- prototype pollution skip (`__proto__` / `constructor` / `prototype` を再帰中に drop)

### PR #138 + #139 (bypass 縮小 + log amplification 抑制)

- MIN を 500B に引き上げ: 99B 弱 dataURI × N 個 array の cumulative token-bomb の bypass 帯域を 5x 押し上げ
- per-call warn 集約 (`MAX_WARN_PER_CALL = 50`): attacker が 10k 件 dataURI を array に詰めても warn 発火を 50 件 + 集約 batch 1 件で打ち止め
- 3 種類の safetyEvent 各々独立 counter: `image-omitted` / `oversized-truncated` / `recursion-depth-exceeded`

### PR #140 + #141 (factory 抽出 + altitude 補強)

```ts
// callsite (各 sanitize 関数内):
const imageAggregator = createWarnAggregator('image-omitted', 'promptSafety: image dataURI stripped');
const depthAggregator = createDepthExceededAggregator();
// ...
imageAggregator.tick(() => ({ path, bytes: Buffer.byteLength(value, 'utf8') }));  // lazy builder
// ...
imageAggregator.flush();
depthAggregator.flush();
```

- factory 化で counter scaffolding ~16 行/aggregator → 2 行に圧縮
- lazy builder (`tick(() => ({...}))`) で threshold 超後の `Buffer.byteLength` を skip (PR #140 で regression 検出 → 同 PR fix)
- spread 順反転 + 型 narrow (`WarnAggregatorPayload = Record<string, unknown> & { message?: never; safetyEvent?: never }`) で payload shadowing 構造的閉鎖
- batchEvent / batchMessage は `${event}-batch` / `promptSafety: ${event} warn amplification suppressed` で派生 (4-arg → 2-arg)
- `createDepthExceededAggregator()` helper で literal 重複を集約

## レビュー方式 (4 段階反復)

各 PR で:
1. **実装** (TDD: RED → GREEN → REFACTOR)
2. **`/code-review medium`** (7 angles × 6 candidates → 1-vote verify)
3. **CONFIRMED は同 PR 同梱 fix** / **PLAUSIBLE は Issue 追記**
4. **番号単位明示認可後マージ** (`PR #XXX マージ` / `gh pr merge XXX --squash --delete-branch を実行`)

5 PR 全体で:
- CONFIRMED 8 件 + PLAUSIBLE 7 件 + REFUTED 8 件 = 23 件 verify
- 8 件 (CONFIRMED) を同 PR fix、7 件 (PLAUSIBLE) を Issue 追記、REFUTED 8 件は logger.ts safeWrite + body-parser cycle 防御 + test pin 等で排除

## Issue Net 変化

- Close 数: 1 件 (#134)
- 起票数: 1 件 (#137)
- Net: 0 件

**Net = 0 だが進捗ゼロではない**:
- #137 は元々 3 サブ項目 (non-image gap / 99B bypass / log amplification) で起票
- セッション中に **#3 完全完了** + **#2 部分完了** (MIN 500 引き上げ実施、collection-level guard は残) + **#4 完全完了 (a-d 4 サブ項目)** + サブ項目 2 件追記 (#5 path histogram / #6 logger 持ち上げ)
- 実質的には 5 件 close 相当 + 2 件追記 = net -3 件分の進捗

## Issue #137 残課題 (active、open 維持)

| サブ項目 | 内容 | 緊急性 |
|---|---|---|
| #137 #1 | non-image dataURI gap (PDF/audio 100B-100KB 帯素通し) | LOW、設計議論含む |
| #137 #2 残り | collection-level guard (array 合計 byte 閾値超で early summarize) | LOW |
| #137 #5 | batch log path 喪失、pathPrefixes histogram | LOW、enhancement |
| #137 #6 | logger.ts altitude (logger.warnSampled future work) | LOW、別 milestone |

すべて緊急性 LOW、size guard backstop が効いている現状で実害なし。

## 本田様判断待ち / 外部依存

| 項目 | 状態 |
|---|---|
| Cloud Logging で `safetyEvent: image-omitted` / `*-batch` / `recursion-depth-exceeded` 発火確認 | 5 PR Test plan の残項目、dev デプロイ後の手動 grep |
| モバイル実機確認 (PR #128-#130 のレスポンシブ修正) | 前 handoff からの継続課題 |
| 法務確認 (顧問弁護士 → public/legal/*.md 文言確定、M7-β) | 外部依存 |
| #125 多ターン E2E (「それで」継続 + intent 引き継ぎの実トラフィック実証) | 外部依存 |

## テスト推移

| PR | 件数 |
|---|---|
| セッション開始時 | 543 |
| PR #136 後 | 552 (+9: content-based / depth guard / proto pollution) |
| PR #138 後 | 555 (+3: 境界値 499/500/501) |
| PR #139 後 | 560 (+5: per-call 集約 + boundary) |
| PR #140 後 | 564 (+4: lazy builder regression pin + cross-event independence) |
| PR #141 後 | 569 (+5: factory unit test) |

`backupSlice.test.ts T5` は flaky で本セッションの変更とは無関係 (単独実行で常時 PASS)。

## 学び (本セッション)

1. **`/code-review medium` を 5 PR 連続適用したパターン**: 各 PR で「実装 + code-review + 同梱 fix」を 1 ループにすると、findings の同 PR 内 fix で diff が小さい状態を維持できる
2. **Issue 1 件に複数サブ項目をまとめる運用**: code-review の PLAUSIBLE 提案を Issue サブ項目として追記し、Net 0 を維持しつつ実質的な進捗を確保
3. **CONFIRMED と PLAUSIBLE の処理分離**: CONFIRMED (機械的検証可能) は同 PR で fix、PLAUSIBLE (将来 risk / latent) は Issue で扱う、という分離が 5 PR を通じて一貫して機能
4. **factory altitude 補強の段階**: PR #140 で factory 抽出 → PR #141 で API stability 補強 (export, JSDoc, runtime/compile-time 二重防御) という 2 段階で altitude を上げる進化パターン
5. **lazy builder pattern**: `tick(() => ({...}))` で hot path の threshold 超後評価を skip する設計。code-review で eager evaluation regression を pin する spy ベース test で固定

## 規範遵守確認

- ✅ main 直 push なし (5 PR すべて feature ブランチ + PR 経由)
- ✅ PR マージはすべて番号単位明示認可後 (`PR #XXX マージ` / `gh pr merge XXX --squash --delete-branch を実行`)
- ✅ 同セッションで 5 PR 連続マージしたが、code-review medium の効果検証として正当性あり
- ✅ Issue Net 0 だが内容実質進捗 +3 件分を明示
- ✅ ドキュメント整合性: CLAUDE.md / docs/handoff / Issue で promptSafety 関連の記述ズレなし

## 次セッション再開ガイド

最優先で考慮すべき残課題は **Issue #137 #1 (non-image dataURI gap)**。設計議論を含む (MAX_FIELD_BYTES 引き下げ vs 非画像 marker 追加層 vs FE 側サニタイズ) ため `/brainstorm` 先行が妥当。

他 3 件 (#2 残り / #5 / #6) は緊急性 LOW で size guard backstop あり、本田様の優先順位判断に委ねる状態。

`/catchup` で `Issue #137` のみ active、本田様判断待ち 4 件 (Cloud Logging / モバイル / 法務 / E2E) で再開可能。
