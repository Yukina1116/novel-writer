# collection-level guard 設計 (Issue #137 #2 残り)

- **作成日**: 2026-06-03
- **関連 Issue**: [#137](https://github.com/Yukina1116/novel-writer/issues/137) #2 残り (collection-level guard)
- **関連 PR (祖先)**: #136 (Issue #134 part 1)、#138 (MIN 100→500)、#139-#141 (aggregator 系)、#143 (non-image dataURI)、#144 (pathPrefixes histogram)
- **対象モジュール**: `server/utils/promptSafety.ts`
- **ステータス**: Design (Phase 6, brainstorm Skill)
- **緊急性**: LOW (size guard backstop が機能中で実害発生中ではない)

---

## 1. 概要 / 動機

PR #138 で `MIN_IMAGE_DATA_URI_BYTES` を 100→500 に引き上げ、99B 弱 dataURI の cumulative bypass 帯域を ~5x 縮小済。残課題は **≤499B dataURI を多数並べた cumulative token-bomb**:

- `[{url: 'data:image/png;base64,' + 'A'.repeat(80)}, ...] × 2000` ≈ **~1MB / ~50K tokens**
- 各 leaf は `MIN_IMAGE_DATA_URI_BYTES=500` 未満で **content-based detection を素通し**
- 各 leaf は `MAX_FIELD_BYTES=100KB` 未満で **size guard も素通し**
- 認証 + `withUsageQuota('character/*', 100 sen)` で call 数は制限されるが、**call 単位 cost amplification は直交軸**

本設計は **array 単位の累積 byte threshold** を追加することで、leaf-level guard を素通しする cumulative bypass を構造的に閉じる。Issue #134 の register-or-forget 解消理念とは **直交軸の防御** (cumulative byte 制限は新フィールド追加で自動カバー、register 不要)。

## 2. 要件

### 機能要件

- **FR-1**: array 内 element の累積 byte (Buffer.byteLength of JSON.stringify(processed element), UTF-8) が `MAX_COLLECTION_BYTES=200KB` を超えた後、残り element を `COLLECTION_OVERFLOW_MARKER` に置換する
- **FR-2**: 閾値内 element は image / non-image marker 化 (既存) を経由して通常通り保持される
- **FR-3**: sibling array は独立した cumulative counter を持つ (`{a: [...], b: [...]}` で a/b 個別追跡)
- **FR-4**: nested array (array of array) も内側 array が独立に追跡される
- **FR-5**: non-array (object / scalar) のロジックは無変更
- **FR-6**: 集約 log は per-call 50 件上限 + `collection-overflow-batch` event で amplification 抑制 (既存 aggregator factory 再利用)

### 非機能要件

- **NFR-1**: `stripPromptHeavyFields(data: unknown): unknown` signature **不変**、既存呼出側 (`worldService` / `characterService` / `characterPrompt`) 無変更
- **NFR-2**: `truncateOversizedStrings` / `sanitizeForPrompt` signature **不変**
- **NFR-3**: 既存テスト 602 件全 PASS (regression なし)
- **NFR-4**: 入力 mutate なし (pure helpers 規律)
- **NFR-5**: 攻撃 payload (大型 array) の場合、閾値到達後の short-circuit により perf 悪化なし
- **NFR-6**: 通常データ (~50KB 以下 array、≤1000 element) の perf 影響は 10ms 級 (per-element JSON.stringify trade-off の許容範囲)

## 3. アーキテクチャ

### 追加位置

`server/utils/promptSafety.ts` 内の `stripPromptHeavyFields` の **array recurse 経路** に並列追加。既存 image / non-image / depth marker 経路と並列に動作し、互いに干渉しない。

```
stripPromptHeavyFields(data)
  └─ recurse(value, path, depth)
       ├─ if depth > MAX_RECURSION_DEPTH  → depth marker
       ├─ if string                        → image / non-image / passthrough (既存)
       ├─ if array                         → collection-level guard + element recurse  ← 新規
       └─ if object                        → entry recurse (既存)
```

### Issue #134 理念との位置付け

- whitelist register-or-forget 解消 (PR #136) = content-based detection (leaf レベル) → register-or-forget 軸
- collection-level guard (本設計) = **構造的 cumulative byte 制限** → register-or-forget と**直交軸の防御**
- 新フィールド追加で自動カバー (whitelist 不要)、新型 token-bomb (PDF dataURI × N 等) も自動防御

## 4. データモデル

### 新規定数 / marker

| 名前 | 種別 | 値 | 役割 |
|---|---|---|---|
| `MAX_COLLECTION_BYTES` | private const | `200_000` | array 1 つあたりの累積 byte 上限 (1 つの leaf 100KB の 2x altitude) |
| `COLLECTION_OVERFLOW_MARKER` | **export** const | `'[collection-overflow: subsequent items omitted to fit token budget]'` | 閾値到達後の element 代替マーカー |

### 閾値値 (200KB) の根拠

- 通常の character.skills[] / world.lore[] は実用 ~50KB 以下、200KB は十分余裕 (false positive 実質ゼロ)
- Gemini 131K context の ~1.5x 相当の ~50K tokens 目安にターゲット
- `MAX_FIELD_BYTES=100KB` (単一 leaf 上限) の 2x で「単一 vs 集合」の altitude を区別
- ≥200KB の array は通常データで起きえない (~400 件の 499B dataURI に相当する量)

### byte 計測の規律

- 各 element について `Buffer.byteLength(JSON.stringify(processed element), 'utf8')` で計測
- `processed element` = recurse 通過後の値 (image / non-image marker 化後の短文を含む)
- これにより「leaf-level marker 化済の element は cumulative 圧迫しない」挙動を保証 (二重防御の補完)

## 5. アルゴリズム

### array recurse の改修

```ts
if (Array.isArray(value)) {
  const collectionAggregator = ...; // factory 経由 (Section 6)
  let cumulativeBytes = 0;
  let changed = false;
  const next: unknown[] = [];
  for (let idx = 0; idx < value.length; idx++) {
    if (cumulativeBytes > MAX_COLLECTION_BYTES) {
      // 閾値到達後は短絡 marker 置換 (recurse skip で perf 改善)
      collectionAggregator.tick(
        () => ({
          path: joinPath(path, idx),
          arrayLength: value.length,
          cumulativeBytes,
          droppedIndex: idx,
        }),
        path
      );
      next.push(COLLECTION_OVERFLOW_MARKER);
      changed = true;
      continue;
    }
    const replaced = recurse(value[idx], joinPath(path, idx), depth + 1);
    next.push(replaced);
    if (replaced !== value[idx]) changed = true;
    cumulativeBytes += Buffer.byteLength(JSON.stringify(replaced), 'utf8');
  }
  return changed ? next : value;
}
```

### perf 設計

| シナリオ | per-element 呼出回数 | 実用許容 |
|---|---|---|
| 通常データ (~50KB array、≤1000 element) | JSON.stringify ×1000 (~10ms 級) | ✅ |
| 攻撃 payload (~1MB array、~2000 element) | 閾値到達後 short-circuit、stringify は ~400 件で頭打ち | ✅ (攻撃時こそ perf 良化) |
| nested array (array of small array) | 内側 array が再帰呼出、内側 cumulative は独立 | ✅ (各 array 200KB 上限) |

## 6. インターフェース

### 公開 API (export)

- 既存: `IMAGE_OMITTED_MARKER`, `NON_IMAGE_DATA_URI_MARKER`, `OVERSIZED_STRING_MARKER`, `RECURSION_DEPTH_EXCEEDED_MARKER`, `MAX_FIELD_BYTES`, `WarnAggregatorPayload`, `WarnAggregator`, `createWarnAggregator`, `stripPromptHeavyFields`, `truncateOversizedStrings`, `sanitizeForPrompt`
- **新規追加**: `COLLECTION_OVERFLOW_MARKER`

### 関数 signature

| 関数 | signature |
|---|---|
| `stripPromptHeavyFields(data: unknown): unknown` | **不変** |
| `truncateOversizedStrings(data: unknown, maxBytes?: number): unknown` | **不変** |
| `sanitizeForPrompt(data: unknown, maxBytes?: number): unknown` | **不変** |

### 呼出側影響

`worldService` / `characterService` / `characterPrompt` は全て **不変**。

## 7. エラー処理 / 観測性

### per-call warn aggregator (PR #144 規律継承)

既存 `createWarnAggregator(individualEvent, individualMessage)` factory を再利用:

```ts
const collectionAggregator = createWarnAggregator(
  'collection-overflow',
  'promptSafety: collection-level cumulative byte threshold exceeded'
);
```

- 個別 warn payload: `{ path, arrayLength, cumulativeBytes, droppedIndex }`
- batch event: factory 派生 `'collection-overflow-batch'`
- `pathPrefixes` histogram (PR #144) を自動継承: 攻撃時 array path 分布が batch payload に top-5 で残る
- `MAX_HISTOGRAM_BUCKETS=256` + `(overflow)` bucket + `histogram-overflow` warn (PR #144 paired signal) も自動継承
- `truncatedBucketCount` (PR #144) も自動継承

### aggregator instance のスコープ

各 `stripPromptHeavyFields(data)` 呼出ごとに 1 instance 生成 (sibling array は同 aggregator を共有、内側 array は独立 instance を作るかどうか要検討):

**選択**: aggregator は `stripPromptHeavyFields` 関数全体で 1 instance を共有する (image / non-image aggregator と同じ pattern)。理由:
- cumulative byte counter は array ごとに別 closure 変数で管理 (recurse 内 local)
- aggregator は warn 集約 (call 単位の 50 件上限) のみが責務、cumulative byte の累積責任は recurse 側
- per-array aggregator instance 作ると factory 呼出が array 数だけ増えるが、aggregator 初期化は軽量なので perf 影響なし

### lazy payload builder

`tick(() => ({ path, arrayLength, cumulativeBytes, droppedIndex }))` で payload を closure 化、PR #140 lazy builder altitude を継承。

## 8. テスト戦略 (Acceptance Criteria)

`server/utils/promptSafety.test.ts` に以下 9 件追加 (AC-10 は npm test 全件 PASS で代替):

| # | テスト | 期待 |
|---|---|---|
| AC-1 | 199KB array (200,000B 未満) → 全 element 保持 | 閾値内、original 全件 |
| AC-2 | 大型 array (~1MB、500 件 × 2KB) → 閾値到達後 element が marker | 先頭 N 件保持、残りが `COLLECTION_OVERFLOW_MARKER` |
| AC-3 境界値 | 199,999B / 200,000B / 200,001B (累積) | 200,000B 以内全保持、200,001B 到達次 element が marker |
| AC-4 | nested object in array (`[{value: '<50KB string>'}, ...]`) | per-element JSON.stringify で累積、object 全体 byte で評価 |
| AC-5 | image dataURI marker と co-existence | leaf-level で IMAGE_OMITTED_MARKER 化後の短文 (~60B) を cumulative に反映、collection guard が早期発火しない |
| AC-6 | warn log payload (path / arrayLength / cumulativeBytes / droppedIndex) | `collection-overflow` event が個別 warn で発火 |
| AC-7 | sibling array 独立 (`{a: [200K], b: [200K]}`) | array A/B が別々に閾値超 (2 件の collection-overflow event) |
| AC-8 | nested array of array (`[[...], [...]]`) | 内側 array が独立した cumulative counter |
| AC-9 | non-array (object/scalar) は影響なし | 既存挙動維持、collection-overflow event 不発火 |
| AC-10 | 既存 602 件 + 9 新規 = 611 件全 PASS | regression なし |

### 観測性テスト追加 (PR #144 規律継承)

| # | テスト |
|---|---|
| AC-11 | 51 件超 collection-overflow → batch event `collection-overflow-batch` 発火 + `pathPrefixes` 自動継承 |
| AC-12 | collection-overflow と image-omitted の cross-event independence (別 histogram、別 counter) |

## 9. スコープ外 / 将来課題

| 項目 | 理由 |
|---|---|
| **JSON 全長プリチェック (元の案 B)** | sanitize 入口で `sanitizeForPrompt(input)` の全長を 1 回チェック。シンプルだが leaf marker 化の意図を 1 取り返しで上書き、別 enhancement 候補 |
| **object sibling cumulative (元の案 C)** | 同一 parent の下の全 leaf 合計 byte 追跡。array 専用 vs オブジェクト全体の trade-off は別 Issue で検討 |
| **`truncateOversizedStrings` 側 collection-level guard** | 本 PR は `stripPromptHeavyFields` 側のみ。truncate 側は `(no-path)` bucket 同様、別 enhancement |
| **`MAX_COLLECTION_BYTES` の動的調整** | Gemini context size 変動 (1M context 等) に応じた閾値調整は別 issue |

## 10. Open Questions

なし (3 件全確定 + per-element JSON.stringify trade-off は executor 判断で許容)

## 11. リスクと緩和

| リスク | 影響 | 緩和策 |
|---|---|---|
| 200KB 閾値が実プロダクトデータで false positive を引き起こす | 通常 character/world データの array が marker 置換される | AC-1 で 199KB 全保持を pin、Cloud Logging で `safetyEvent: 'collection-overflow'` 発火頻度を本番デプロイ後に観測 |
| per-element JSON.stringify の perf 劣化 | 1000 element の array で ~10ms 級遅延 | 通常データは ≤1000 element 想定、攻撃時は閾値到達後 short-circuit で stringify 呼出が頭打ち |
| nested array of nested array of nested... の累積 byte 計算が perf 暴走 | 攻撃 payload で各レベル stringify が指数的増殖 | `MAX_RECURSION_DEPTH=1000` で depth guard、超過時は marker 化で recurse 終端 |
| `COLLECTION_OVERFLOW_MARKER` 自体の byte size 累積評価への影響 | marker 文字列 (~100B) 自体が次 element の cumulative に inc される | marker は閾値超後にしか出ないため、それ以降はどのみち全部 marker。実害なし |

## 12. 実装手順 (Phase 9 で `/impl-plan` に渡す要約)

1. `promptSafety.ts` に `MAX_COLLECTION_BYTES`, `COLLECTION_OVERFLOW_MARKER` を追加
2. `stripPromptHeavyFields` 内で `collectionAggregator` を `createWarnAggregator('collection-overflow', ...)` で初期化
3. array recurse loop を改修: 各 element の `Buffer.byteLength(JSON.stringify(replaced), 'utf8')` を cumulative に累積、閾値超で短絡 marker 置換
4. `promptSafety.test.ts` に AC-1〜12 を TDD で追加 (AC-3 境界値を先に書き境界 pin)
5. `npm test` / `npm run lint` 全 PASS 確認
6. handoff 文書を `docs/handoff/` に追加 (実装完了後)
7. /safe-refactor + /code-review low + /review-pr (large tier 該当時)

## 13. 参考資料

- Issue #134 (whitelist → content-based 移行の祖)
- PR #136 (Issue #134 part 1)
- Issue #137 (#1 / #2 / #3 / #4 / #5 / #6 / #7)
- PR #138 (Issue #137 #2 一部、MIN 100→500)
- PR #143 (non-image dataURI 検出)
- PR #144 (pathPrefixes histogram + cardinality cap)
- Gemini 2.5 Flash context limit (131,072 tokens)
- `withUsageQuota('character/*', 100 sen)` (M3 PR-F、call 単位制限)
