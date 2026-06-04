# bytes-estimation-failed paired signal 設計 (Issue #149 残-B)

- **作成日**: 2026-06-04
- **関連 Issue**: [#149](https://github.com/Yukina1116/novel-writer/issues/149) 残-B
- **関連 PR (祖先)**: PR #148 (Issue #137 #7)、PR #150 (Issue #149 残-C)、PR #151 (Issue #149 残-A)
- **対象モジュール**: `server/utils/promptSafety.ts` + `server/utils/promptSafetyEvents.ts` + 既存 lockstep / runbook / setup script (6 ファイル)
- **ステータス**: Implemented (PR #153)
- **緊急性**: LOW (collection-overflow / size guard で実害発生中ではない、規模拡大時の保守性整備)

---

## 1. 概要 / 動機

PR #148 review-pr silent-failure-hunter agent #5 (HIGH severity) として指摘された残課題。

`server/utils/promptSafety.ts:144-150` の `estimateElementBytes()`:

```typescript
function estimateElementBytes(value: unknown): number {
  try {
    return Buffer.byteLength(JSON.stringify(value) ?? 'null', 'utf8');
  } catch {
    return 4; // 'null' 相当
  }
}
```

bare `catch {}` で JSON.stringify failure (BigInt / 循環参照 / Proxy throwing `get` / throwing `toJSON`) を全て swallow し 4 bytes fallback。`collection-overflow` aggregator (`MAX_COLLECTION_BYTES=200KB`) が `200KB / 4 = 50,000 element` まで bypass される token-bomb 経路。

**paired signal 規律違反** (`feedback_silent_fail_paired_signal.md`): silent fail を許容する設計には別系統の早期検知シグナルを一対で用意する規律。現状 `estimateElementBytes` の bare catch には paired signal なし、JSDoc で「BigInt や循環参照で stringify が throw する場合は 4 byte fallback で防御」と意図は明示されているが、検知シグナルが欠落。

### 本タスクの位置付け

- **観測性 / 保守性向上 (安定性向上ではない)**: 既存 backstop (size guard / collection guard) で token-bomb 攻撃自体は防御済、本 PR は「攻撃 / データ破損が起きた時に Cloud Logging で早期検知できる」観測層整備
- 「多くのユーザー」想定 (2026-06-04 本田様判断) への規模拡大時に、BigInt / Proxy / 循環参照を含む payload (攻撃 or データ破損) の早期検知価値が高まる前段で構造的に閉鎖
- PR #148 で確立した SAFETY_EVENTS enum + lockstep test pattern の **実証** (新 safetyEvent 追加 = 6 ファイル同時更新の drift 検知能力テスト)

### Issue #149 close 条件

本 PR merge 後の Issue #149 残課題:
- 残-A (create path) ✅ PR #151 マージ済
- 残-B (estimate-byte-fallback paired signal) ✅ **本 PR**
- 残-C (histogram-overflow path) ✅ PR #150 マージ済

→ Issue #149 全 3 件完了で **umbrella close 可能**。

---

## 2. 要件

### 機能要件

- **FR-1**: `SAFETY_EVENTS` に `BYTES_ESTIMATION_FAILED = 'bytes-estimation-failed'` を追加 (7 件目)
- **FR-2**: `estimateElementBytes` signature を `(value: unknown, onStringifyFailure?: () => void) => number` に変更 (optional callback)、未指定時は既存挙動 (silent 4 bytes fallback) を維持 (backward compat)
- **FR-3**: `stripPromptHeavyFields` 内に `bytesEstimationAggregator` を追加 (image / non-image / depth / collection と並列、5 件目の aggregator)
- **FR-4**: callsite (`stripPromptHeavyFields` 内 array recurse ループ末尾、cumulative byte 加算箇所) で `estimateElementBytes(replaced, () => bytesEstimationAggregator.tick(...))` の callback 経由 tick
- **FR-5**: 関数末尾の flush 呼出に `bytesEstimationAggregator.flush()` を追加 (既存 4 aggregator 並列)
- **FR-6**: warn payload に `path` (string、`itemPath`) + `fallbackBytes: 4` を含む
- **FR-7**: 全 4 ファイル (lockstep test / setup script / runbook / promptSafetyEvents.test.ts) を新 safetyEvent 7 件目に同期更新

### 非機能要件

- **NFR-1**: 既存 636 + 新規 4 = 640 tests PASS (regression なし)
- **NFR-2**: 既存 4 aggregator (image / non-image / depth / collection) の挙動を変更しない
- **NFR-3**: `estimateElementBytes` の fallback 値 (4 bytes) を変更しない (silent → paired signal 化のみ)
- **NFR-4**: `estimateElementBytes` の callback 未指定経路で既存呼出が全て backward compat (truncateOversizedStrings 等で間接的に使用される可能性、ただし現状は 1 callsite のみ)
- **NFR-5**: tsc --noEmit エラーゼロ
- **NFR-6**: bash -n syntax OK
- **NFR-7**: 新規依存ライブラリゼロ
- **NFR-8**: 通常 JSON-safe data で false positive ゼロ (T4 で pin)

---

## 3. アーキテクチャ

### ファイル配置

```
server/utils/
  promptSafetyEvents.ts             [変更] SAFETY_EVENTS に BYTES_ESTIMATION_FAILED 追加 (7 件目)
  promptSafetyEvents.test.ts        [変更] expected set 6 → 7 件 (AC-2 pin 更新)
  promptSafety.ts                   [変更] estimateElementBytes signature + bytesEstimationAggregator
  promptSafety.test.ts              [変更] regression test + paired signal test 3 件追加

scripts/
  setup-safety-event-metrics.sh     [変更] SAFETY_EVENTS bash array に "bytes-estimation-failed" 追加

tests/static/
  safety-events-lockstep.test.ts    [変更] expected 6 → 7 件 (AC-4c pin 更新)
  safety-events-bash-syntax.test.ts [自動追従] ALL_SAFETY_EVENT_NAMES.length 動的化済 (PR #148 M-3)

docs/runbook/
  cloud-logging-safety-event-metrics.md [変更] §1 metric 表 + §3.7 解説 + §5 alert 閾値 + §6.6 トリアージ
```

### aggregator scope

- `bytesEstimationAggregator` を `stripPromptHeavyFields` 関数の closure 内に 1 instance (既存 image / non-image / depth / collection と並列)
- per-recurse-call scope (= 1 sanitize 呼出で 1 instance、call 終了で破棄)
- 既存 `createWarnAggregator` factory を再利用 (PR #137 #4 で確立)
- 新 helper 関数なし

### 依存関係 (1 方向)

```
SAFETY_EVENTS.BYTES_ESTIMATION_FAILED (定数定義)
       ↓ import
promptSafety.ts: bytesEstimationAggregator (per-call instance)
       ↓ callback DI
estimateElementBytes(value, () => aggregator.tick(...))
       ↓ runtime emit
logger.warn ({ safetyEvent: 'bytes-estimation-failed', path, fallbackBytes })
       ↓ Cloud Logging
prompt_safety_bytes_estimation_failed_count metric (setup script で create)
```

### 変更しないもの

- `truncateOversizedStrings` 関数 (estimateElementBytes 使用なし)
- 既存 4 aggregator (image / non-image / depth / collection) の挙動
- estimateElementBytes 内の fallback 値 (4 bytes 維持)
- estimateElementBytes の JSDoc 内容 (callback 引数追加分のみ補足)
- 本番 Cloud Run runtime の挙動全体 (新 warn が増えるのみ、既存挙動不変)

---

## 4. データモデル

### SAFETY_EVENTS 7 件目 (新規)

```typescript
export const SAFETY_EVENTS = {
  IMAGE_OMITTED: 'image-omitted',
  NON_IMAGE_DATA_URI_OMITTED: 'non-image-data-uri-omitted',
  OVERSIZED_TRUNCATED: 'oversized-truncated',
  RECURSION_DEPTH_EXCEEDED: 'recursion-depth-exceeded',
  COLLECTION_OVERFLOW: 'collection-overflow',
  HISTOGRAM_OVERFLOW: 'histogram-overflow',
  BYTES_ESTIMATION_FAILED: 'bytes-estimation-failed',  // 新規
} as const;
```

`SafetyEventName` / `SafetyEventBatchName` 型は `typeof + keyof` で自動派生、型レベル更新不要。

### metric 命名規約 (PR #148 規約踏襲)

| event 名 | metric 名 | filter |
|---|---|---|
| `bytes-estimation-failed` | `prompt_safety_bytes_estimation_failed_count` | `jsonPayload.safetyEvent=~"^bytes-estimation-failed(-batch)?$"` |

### warn payload structure

**個別 warn** (per-call 50 件まで、`createWarnAggregator` factory 経由):

```typescript
{
  message: 'promptSafety: byte estimation failed (JSON.stringify threw)',
  safetyEvent: 'bytes-estimation-failed',
  path: 'gallery[*].metadata.attacker-key',  // estimateElementBytes 呼出時の array element path
  fallbackBytes: 4,                          // 使用された fallback 値
}
```

**batch warn** (51 件目以降、aggregator factory が自動生成、PR #144 pathPrefixes 含む):

```typescript
{
  message: 'promptSafety: bytes-estimation-failed warn amplification suppressed',
  safetyEvent: 'bytes-estimation-failed-batch',
  totalCount: 1500,
  loggedCount: 50,
  omittedCount: 1450,
  pathPrefixes: [
    { path: 'gallery[*].metadata.*', count: 900 },
    { path: 'lore[*].*', count: 400 },
    ...
  ],
  truncatedBucketCount: 0,
}
```

### alert policy scaffold (setup script)

| event | 初期状態 | 提案閾値 | 検知意図 |
|---|---|---|---|
| `bytes-estimation-failed` | **disabled** | 例 > 1 / 1 min (baseline 観察後決定) | BigInt / Proxy / 循環参照を含む payload の急増検知 |

理由: 通常データ (JSON-safe input) では発火しないはず、発火頻度 baseline 観察後に enable。

---

## 5. インターフェース

### estimateElementBytes signature 変更

```typescript
// after (Issue #149 残-B)
function estimateElementBytes(value: unknown, onStringifyFailure?: () => void): number {
  try {
    return Buffer.byteLength(JSON.stringify(value) ?? 'null', 'utf8');
  } catch {
    onStringifyFailure?.();
    return 4; // 'null' 相当 (paired signal は onStringifyFailure callback で別系統 emit)
  }
}
```

- 第 2 引数 optional callback (DI)
- callback 未指定で既存挙動 (silent 4 bytes fallback) を維持 (backward compat、NFR-4)

### stripPromptHeavyFields 内 callsite

```typescript
export function stripPromptHeavyFields(data: unknown): unknown {
  const imageAggregator = createWarnAggregator(...);
  const nonImageAggregator = createWarnAggregator(...);
  const depthAggregator = createDepthExceededAggregator();
  const collectionAggregator = createWarnAggregator(...);

  // 新規 (FR-3): 5 件目 aggregator
  const bytesEstimationAggregator = createWarnAggregator(
    SAFETY_EVENTS.BYTES_ESTIMATION_FAILED,
    'promptSafety: byte estimation failed (JSON.stringify threw)'
  );

  function recurse(value, path, depth) {
    // ... 既存ロジック ...
    if (Array.isArray(value)) {
      // ... 既存ループ ...
      for (let idx = 0; idx < value.length; idx++) {
        // ... existing recurse ...
        const itemPath = path === '' ? `[${idx}]` : `${path}[${idx}]`;
        const replaced = recurse(value[idx], itemPath, depth + 1);
        next.push(replaced);
        if (replaced !== value[idx]) changed = true;
        // FR-4: callback 経由 tick (per-element)
        cumulativeBytes += estimateElementBytes(replaced, () =>
          bytesEstimationAggregator.tick(
            () => ({ path: itemPath, fallbackBytes: 4 }),
            itemPath
          )
        );
        keptCount++;
      }
    }
    // ...
  }

  const result = recurse(data, '', 0);

  imageAggregator.flush();
  nonImageAggregator.flush();
  depthAggregator.flush();
  collectionAggregator.flush();
  bytesEstimationAggregator.flush();  // FR-5: 新規 flush

  return result;
}
```

### runbook §6.6 トリアージ (新規追加)

```markdown
### 6.6 bytes-estimation-failed 発火

| 確認項目 | 内容 |
|---|---|
| **症状** | JSON.stringify failure (BigInt / 循環参照 / Proxy throw / toJSON throw) で 4 bytes fallback |
| **原因候補** | (a) 攻撃的 payload (token-bomb 試行) / (b) データ破損 (循環参照を含む user data) / (c) 外部 API 経由で BigInt 流入 |
| **確認手順** | §4 query で path field を確認 → 攻撃か正当かを path 構造で判定 → batch log の pathPrefixes で path family 特定 |
| **対処** | 攻撃なら quota / WAF 強化、データ破損なら upstream 修正、BigInt 流入なら API client 側で sanitize |
```

---

## 6. エラー処理

### estimateElementBytes 側

- `JSON.stringify` throw → `onStringifyFailure?.()` 呼出 → 4 bytes fallback
- callback 未指定 (`undefined`) → silent fallback (既存挙動、backward compat)
- callback 内部で throw (例: aggregator.tick が誤って throw) → outer catch で再 swallow されない (caller 側で適切に handle される想定)

### bytesEstimationAggregator 側

- `createWarnAggregator` factory の既存規律を継承 (PR #137 #4 / PR #144 / PR #150)
- 50 件目までは個別 warn、51 件目以降は batch 集約
- per-aggregator-instance で `overflowEmitted` flag (histogram-overflow paired signal、PR #150 firstOverflowPath 拡張済)

### テスト側

- T2 (BigInt) で aggregator.tick が 1 回呼ばれることを spy で pin
- T3 (循環参照) で同様
- T4 (通常 data) で aggregator.tick が呼ばれないことを pin (false positive ゼロ)

---

## 7. テスト戦略

### Acceptance Criteria

```
AC-1: server/utils/promptSafetyEvents.ts に SAFETY_EVENTS.BYTES_ESTIMATION_FAILED
      ('bytes-estimation-failed') が追加され、ALL_SAFETY_EVENT_NAMES.length が
      6 → 7 になる

AC-2: server/utils/promptSafetyEvents.test.ts の expected set が 6 → 7 件、
      'bytes-estimation-failed' を含む

AC-3: server/utils/promptSafety.ts の estimateElementBytes signature が
      `(value: unknown, onStringifyFailure?: () => void) => number` に変更され、
      callback 未指定でも既存挙動 (silent 4 bytes fallback) を維持

AC-4: stripPromptHeavyFields 内に bytesEstimationAggregator が追加され、
      callsite (array recurse ループ末尾、cumulative byte 加算箇所) で
      callback 経由 tick + 関数末尾で flush

AC-5: server/utils/promptSafety.test.ts に新規 paired signal 発火 test (3 件):
      - AC-5a: BigInt を含む array element で aggregator.tick が 1 回 emit
      - AC-5b: toJSON throw element で aggregator.tick が 1 回 emit
              (循環参照は depth guard 上位で先処理されるため、JSON.stringify throw の
               代替経路として toJSON throw を使用)
      - AC-5c: 通常 JSON-safe data では aggregator.tick が 0 回 (false positive ゼロ)

AC-6: tests/static/safety-events-lockstep.test.ts の expected set 6 → 7 件、
      'bytes-estimation-failed' を含む (TS↔sh 集合一致)

AC-7: tests/static/safety-events-bash-syntax.test.ts は ALL_SAFETY_EVENT_NAMES.length
      で動的化済、追加修正なしで自動追従 (PR #148 M-3 の検証)

AC-8: scripts/setup-safety-event-metrics.sh の SAFETY_EVENTS bash array に
      "bytes-estimation-failed" 追加、--dry-run で 7 件目の "command:" 行が出力される

AC-9: docs/runbook/cloud-logging-safety-event-metrics.md §1 metric 表に 7 件目、
      §3 解説 §3.7 追加、§5 alert 閾値表に 7 件目 (disabled 初期)、
      §6 異常時トリアージ §6.6 追加

AC-10: 既存 636 + 新規 4 = 640 tests PASS + tsc --noEmit エラーゼロ

AC-11: 既存 promptSafety.test.ts の全 regression PASS
       (collection-overflow / image-omitted 等の 4 aggregator 既存挙動不変)

AC-12: lockstep manual failing path 手動確認 (TS enum から BYTES_ESTIMATION_FAILED を
       一時削除 → safety-events-lockstep.test.ts の 3 件 (TS↔sh 件数 / 集合一致 /
       canonical entries) が fail → 復元で全 PASS)
```

### テスト構成

| # | ファイル | 種別 | 目的 |
|---|---|---|---|
| 既存 | `promptSafetyEvents.test.ts` | unit | enum literal pin 更新 (AC-2) |
| 既存 | `promptSafety.test.ts` 全件 | regression | 既存 aggregator 挙動不変 (AC-11) |
| 新 T2 | `promptSafety.test.ts` 新 describe | unit | BigInt array で aggregator.tick × 1 件 (AC-5a) |
| 新 T3 | 同上 | unit | toJSON throw array で aggregator.tick × 1 件 (AC-5b、循環参照は depth guard 上位) |
| 新 T4 | 同上 | unit | 通常 array で aggregator.tick × 0 件 (AC-5c、false positive 検証) |
| 既存 | `safety-events-lockstep.test.ts` | static | 集合 6 → 7 件 (AC-6) |
| 既存 | `safety-events-bash-syntax.test.ts` | static | 動的追従 (AC-7、変更不要) |

---

## 8. スコープ外 / 将来課題

本 PR で扱わない:

- estimateElementBytes の fallback 値の変更 (4 bytes 維持)
- truncateOversizedStrings 内で estimateElementBytes を使う設計変更 (現状未使用、将来別 Issue)
- error.message / error.name の payload 含有 (OQ-1、追加実装は別 Issue)
- alert policy の実 enable (本田様 baseline 観察後の運用判断)
- 本番 Cloud Logging で `safetyEvent: 'bytes-estimation-failed'` 発火確認 (本田様運用作業)
- Issue #152 (update path paired signal、別 PR で追跡)
- Issue #147 (PII path leak)
- Issue #137 #6 (logger.warnSampled altitude)

---

## 9. Open Questions

本 PR 後の運用判断項目:

- **OQ-1**: warn payload に `error.name` / `error.message` を含めるか? (現状 BigInt vs 循環参照 vs Proxy throw の区別が path だけからは不明、運用上のトリアージで必要性が出てきたら追加)
- **OQ-2**: BigInt は実 production で起きうるか? (現状 ts 型システムで `unknown` 受け入れ、ユーザー入力には来ないが API 経由で混入の可能性は要観察。baseline 観察 1 週間後に評価)
- **OQ-3**: 将来 estimateElementBytes を string / object 全体の byte estimation にも汎用化する場合、aggregator 名規約は維持か rename か (汎用化が必要になった時点で議論)

---

## 10. 参照

- Issue #149 ([https://github.com/Yukina1116/novel-writer/issues/149](https://github.com/Yukina1116/novel-writer/issues/149)) 残-B (本設計の対象)
- PR #148 (Issue #137 #7、SAFETY_EVENTS enum + lockstep test pattern 確立)
- PR #150 (Issue #149 残-C、histogram-overflow firstOverflowPath、本 PR の paired signal pattern 模範)
- PR #151 (Issue #149 残-A、dry-run gcloud paired signal、本 PR の AC-7 動的追従検証根拠)
- `feedback_silent_fail_paired_signal.md` (paired signal 規律、本設計の根拠)
- 既存 spec [`2026-06-04-observability-metric-counter-design.md`](./2026-06-04-observability-metric-counter-design.md) (上位設計、SAFETY_EVENTS 規約)
- 既存 spec [`2026-06-03-collection-level-guard-design.md`](./2026-06-03-collection-level-guard-design.md) (estimateElementBytes 導入元)
