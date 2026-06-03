# observability metric counter 設計 (Issue #137 #7)

- **作成日**: 2026-06-04
- **関連 Issue**: [#137](https://github.com/Yukina1116/novel-writer/issues/137) #7 (Statsig/metric counter による observability enhancement)
- **関連 PR (祖先)**: #136 (Issue #134 part 1)、#138-#141 / #143-#145 (Issue #137 #1-#5 一連)
- **対象モジュール**: `server/utils/promptSafety.ts` / `server/utils/promptSafetyEvents.ts` (新規) / `scripts/setup-safety-event-metrics.sh` (新規) / `docs/runbook/` (新規ディレクトリ)
- **ステータス**: Design (Phase 6, brainstorm Skill)
- **緊急性**: LOW (backstop 機能中、surge 未観測。「多くのユーザー」想定への規模拡大を見越した保守性整備)

---

## 1. 概要 / 動機

PR #143 の review-pr (silent-failure-hunter agent) で Medium 指摘として浮上した残課題。`safetyEvent` (`image-omitted` / `non-image-data-uri-omitted` / `oversized-truncated` / `recursion-depth-exceeded` / `collection-overflow` / `histogram-overflow`) は `logger.warn` で構造化ログを emit するが、**Cloud Logging 上の集約観測手段が個別 / batch warn の 2 種類のみ**で、時系列メトリック (「単位時間あたり何件発火したか」) が欠落している。

本設計は **Cloud Logging log-based metric + Cloud Monitoring alert policy** を gcloud script (`scripts/setup-safety-event-metrics.sh`) で idempotent setup し、コード側は `safetyEvent` 文字列リテラルを enum 化することで drift を抑える。

### 本タスクの位置付け (重要)

**安定性向上ではなく、観測性 / 保守性の向上**:
- 既存 backstop (size guard / collection guard / paired signal) で実害発生中ではない
- 「将来 surge が起きた時 / 担当が変わった時 / 数ヶ月後に思い出す時」に助かる整備
- 「今後、多くのユーザーに使ってもらう予定のシステム」(2026-06-04 本田様判断) で早めの保守性整備として着手

### Issue #137 理念との位置付け

- Issue #134 / #137 一連 = register-or-forget 軸の構造的閉鎖 (content-based detection / collection-level guard / paired signal)
- 本設計 (#7) = **観測層の paired signal 強化** ([feedback_silent_fail_paired_signal.md](https://github.com/Yukina1116/novel-writer/blob/main/docs/handoff/) 適用)
  - silent fallback (marker 置換) に対する一対の早期検知シグナル (log-based metric + alert)
  - 公式 "Hooks Reference" exit 2 規律 / "Harness Design" Evaluator 分離規律と整合

---

## 2. 要件

### 機能要件

- **FR-1**: `server/utils/promptSafetyEvents.ts` に `SAFETY_EVENTS` const-as-typed-strings (6 値) と `SafetyEventName` union 型を export する
- **FR-2**: `SAFETY_EVENT_BATCH_SUFFIX = '-batch'` と `SafetyEventBatchName` template literal 型を export する
- **FR-3**: `ALL_SAFETY_EVENT_NAMES` (readonly array) を export し、runbook / script から iteration できるようにする
- **FR-4**: `server/utils/promptSafety.ts` の `createWarnAggregator` 呼出 4 箇所を文字列リテラルから `SAFETY_EVENTS.*` 参照に切り替える (logic 不変)
- **FR-5**: `scripts/setup-safety-event-metrics.sh` で 6 metric (`prompt_safety_<event-with-underscores>_count`) を `gcloud logging metrics create/update` で idempotent setup する
- **FR-6**: 同 script で 6 alert policy を scaffold (5 件 disabled, `histogram-overflow` 1 件 enabled)
- **FR-7**: `--dry-run` / `--project` 引数をサポート、`--project` 未指定で exit 1
- **FR-8**: `docs/runbook/cloud-logging-safety-event-metrics.md` で setup / 通常運用 grep / 閾値調整 / 異常時トリアージ / enum 同期規律を文書化
- **FR-9**: `docs/runbook/README.md` で runbook index を整備

### 非機能要件

- **NFR-1**: 既存 619 件テスト全 PASS (regression なし)
- **NFR-2**: 既存 `safetyEvent` 値・log structure・warn 文言を変更しない (Cloud Logging 既存 query との後方互換)
- **NFR-3**: tsc --noEmit エラーゼロ
- **NFR-4**: script は再実行 safe (describe → create/update 分岐で副作用なし)
- **NFR-5**: enum (TS) と script (bash) の SAFETY_EVENTS は手動同期だが、テスト (T3) で集合一致を強制
- **NFR-6**: 新規依存ライブラリゼロ (現スタック gcloud + bash + vitest のみ)
- **NFR-7**: alert notification channel ID をハードコードしない (環境依存項目は runbook に手順記載のみ)

---

## 3. アーキテクチャ

### ファイル配置

```
server/utils/
  promptSafetyEvents.ts        [新規]  SAFETY_EVENTS + SafetyEventName + BATCH_SUFFIX + ALL_SAFETY_EVENT_NAMES
  promptSafetyEvents.test.ts   [新規]  enum literal pin (T1)
  promptSafety.ts              [変更]  createWarnAggregator 呼出 4 箇所を enum 参照に切替 (T2)

scripts/
  setup-safety-event-metrics.sh   [新規]  gcloud logging metrics + alert policy の idempotent setup

tests/static/
  safety-events-lockstep.test.ts  [新規]  TS enum と sh script の SAFETY_EVENTS 集合一致を grep ベース検証 (T3)
  safety-events-bash-syntax.test.ts [新規]  bash -n syntax check (T4)

docs/runbook/                    [新規ディレクトリ]
  README.md                              [新規]  runbook index
  cloud-logging-safety-event-metrics.md  [新規]  本 runbook
```

### 変更しないもの

- `server/utils/logger.ts` (altitude 持ち上げは Issue #137 #6 別 milestone のため範囲外)
- `package.json` (新規依存なし、現スタックのみ)
- `.github/workflows/deploy.yml` (script は手動実行、CI は触らない)

### 依存関係 (1 方向)

```
promptSafetyEvents.ts (定数定義)
       ↓ import
promptSafety.ts (createWarnAggregator 呼出 4 箇所で参照)
       ↓ runtime emit
logger.warn ({ safetyEvent: SAFETY_EVENTS.* })
       ↓ Cloud Logging
log-based metric (gcloud script で setup) → Cloud Monitoring alert
```

script ↔ TS enum は **手動同期 + テスト (T3) で集合一致 pin**。drift は CI で機械検出。

---

## 4. データモデル

### `server/utils/promptSafetyEvents.ts` (新規)

```typescript
export const SAFETY_EVENTS = {
  IMAGE_OMITTED: 'image-omitted',
  NON_IMAGE_DATA_URI_OMITTED: 'non-image-data-uri-omitted',
  OVERSIZED_TRUNCATED: 'oversized-truncated',
  RECURSION_DEPTH_EXCEEDED: 'recursion-depth-exceeded',
  COLLECTION_OVERFLOW: 'collection-overflow',
  HISTOGRAM_OVERFLOW: 'histogram-overflow',
} as const;

export type SafetyEventName = typeof SAFETY_EVENTS[keyof typeof SAFETY_EVENTS];

export const SAFETY_EVENT_BATCH_SUFFIX = '-batch' as const;

export type SafetyEventBatchName = `${SafetyEventName}${typeof SAFETY_EVENT_BATCH_SUFFIX}`;

export const ALL_SAFETY_EVENT_NAMES: readonly SafetyEventName[] =
  Object.values(SAFETY_EVENTS) as readonly SafetyEventName[];
```

### metric 命名規約 (GCP 側)

| event 名 (logger 側) | metric 名 (GCP 側) | metric kind | filter |
|---|---|---|---|
| `image-omitted` | `prompt_safety_image_omitted_count` | DELTA / INT64 | `jsonPayload.safetyEvent=~"^image-omitted(-batch)?$"` |
| `non-image-data-uri-omitted` | `prompt_safety_non_image_data_uri_omitted_count` | DELTA / INT64 | 同上パターン |
| `oversized-truncated` | `prompt_safety_oversized_truncated_count` | DELTA / INT64 | 同上 |
| `recursion-depth-exceeded` | `prompt_safety_recursion_depth_exceeded_count` | DELTA / INT64 | 同上 |
| `collection-overflow` | `prompt_safety_collection_overflow_count` | DELTA / INT64 | 同上 |
| `histogram-overflow` | `prompt_safety_histogram_overflow_count` | DELTA / INT64 | 同上 |

- 規約: `prompt_safety_<event-with-underscores>_count`
- 個別 (warn) + batch (集約 warn) を **1 metric に合算**して count
- metric label は最小 (event は metric 名で分離済、cardinality 爆発を防ぐ)

### alert policy scaffold (6 件、初期は `histogram-overflow` のみ enabled)

| event | 初期状態 | 提案閾値 | 検知意図 |
|---|---|---|---|
| `image-omitted` | disabled | `delta count > 100 / 1 min` | 大量画像ペースト or 攻撃的入力 |
| `non-image-data-uri-omitted` | disabled | `delta count > 10 / 1 min` | PDF/audio dataURI 異常入力 |
| `oversized-truncated` | disabled | `delta count > 50 / 1 min` | 大量テキストペースト or token-bomb |
| `recursion-depth-exceeded` | disabled | `delta count > 1 / 1 min` | 深いネスト or 攻撃的構造 |
| `collection-overflow` | disabled | `delta count > 5 / 1 min` | array 累積 byte 異常 |
| `histogram-overflow` | **enabled** | `delta count >= 1` | aggregator OOM 防御の paired signal (発火即異常) |

`histogram-overflow` は cardinality 爆発の早期兆候で **閾値が「1 回」で自明**、最小驚き原則により最初から enabled。他 5 件は実 baseline 観察後に閾値決定 → 本田様判断で enable。

---

## 5. インターフェース

### `server/utils/promptSafetyEvents.ts` (新規 API)

```typescript
// export const SAFETY_EVENTS: Readonly<{...}>
// export type SafetyEventName = ...
// export const SAFETY_EVENT_BATCH_SUFFIX: '-batch'
// export type SafetyEventBatchName = `${SafetyEventName}-batch`
// export const ALL_SAFETY_EVENT_NAMES: readonly SafetyEventName[]
```

### `server/utils/promptSafety.ts` の変更 (4 callsite)

before:
```typescript
const imageAggregator = createWarnAggregator('image-omitted', 'promptSafety: image dataURI stripped');
const nonImageAggregator = createWarnAggregator('non-image-data-uri-omitted', '...');
const collectionAggregator = createWarnAggregator('collection-overflow', '...');
const oversizedAggregator = createWarnAggregator('oversized-truncated', '...');
```

after:
```typescript
import { SAFETY_EVENTS } from './promptSafetyEvents';

const imageAggregator = createWarnAggregator(SAFETY_EVENTS.IMAGE_OMITTED, 'promptSafety: image dataURI stripped');
const nonImageAggregator = createWarnAggregator(SAFETY_EVENTS.NON_IMAGE_DATA_URI_OMITTED, '...');
const collectionAggregator = createWarnAggregator(SAFETY_EVENTS.COLLECTION_OVERFLOW, '...');
const oversizedAggregator = createWarnAggregator(SAFETY_EVENTS.OVERSIZED_TRUNCATED, '...');
```

`recursion-depth-exceeded` は `createDepthAggregator()` helper 内に 1 箇所、`histogram-overflow` は `createWarnAggregator` factory 内に 1 箇所、これも enum 経由に書き換える (合計 6 箇所 → 4 callsite + 2 内部 = 6 参照)。

### `scripts/setup-safety-event-metrics.sh` インターフェース

```
Usage:
  ./setup-safety-event-metrics.sh --project <PROJECT_ID> [--dry-run]

Exit codes:
  0  success (apply or dry-run)
  1  argument error / missing --project
  2  gcloud command failure
```

### `docs/runbook/cloud-logging-safety-event-metrics.md` 構成

```
## 1. 概要 + 前提条件
## 2. setup script 使い方
## 3. 6 metric の意味 (event ごと: 何を捕まえるか / 正常時 / 異常境界)
## 4. 通常運用での Cloud Logging grep query 集
## 5. alert policy 閾値調整手順 (baseline 観察 → 閾値決定 → enable)
## 6. 異常時トリアージ (event ごと: 原因 / 確認手順 / 対処)
## 7. enum / script 同期規律
```

---

## 6. エラー処理

### script 側

- `--project` 未指定 → stderr に Usage 表示 + exit 1
- gcloud CLI 未インストール → stderr に「gcloud CLI required」表示 + exit 1
- `gcloud logging metrics create` 失敗 → set -e で stop、exit 2
- `gcloud monitoring policies create` 失敗 → 同上
- alert policy が既に存在 (重複作成エラー) → describe で事前検知して update 経路に分岐 (idempotent)
- `--dry-run` 時は実際の gcloud API 呼出を skip、stdout に「would create/update」のみ出力

### TS 側

- `promptSafetyEvents.ts` は純粋な定数定義のみ、runtime error path なし
- `promptSafety.ts` の変更は文字列リテラル → enum 参照のみで logic 不変、既存 error handling に変更なし

### テスト側

- T3 (lockstep) で sh と TS の集合不一致を検出 → CI fail
- T4 (bash syntax) で sh 構文エラーを検出 → CI fail
- T1 (enum literal pin) で値の drift を検出 → CI fail

---

## 7. テスト戦略

### Acceptance Criteria

```
AC-1: server/utils/promptSafetyEvents.ts に SAFETY_EVENTS / SafetyEventName /
      SAFETY_EVENT_BATCH_SUFFIX / SafetyEventBatchName / ALL_SAFETY_EVENT_NAMES
      が export されている

AC-2: SAFETY_EVENTS の 6 値が以下と byte-for-byte 一致 (Object.values 順序不問):
        image-omitted
        non-image-data-uri-omitted
        oversized-truncated
        recursion-depth-exceeded
        collection-overflow
        histogram-overflow

AC-3: server/utils/promptSafety.ts の createWarnAggregator 呼出 (4 callsite +
      内部 2 箇所、計 6 参照) が文字列リテラルではなく SAFETY_EVENTS.* 経由に
      なっている (grep で検証)

AC-4: scripts/setup-safety-event-metrics.sh が以下を満たす:
      (a) `bash -n` で syntax error なし
      (b) --dry-run --project xxx で 6 metric 分の "would create/update" を出力
      (c) SAFETY_EVENTS bash array の値が TS SAFETY_EVENTS と集合一致 (T3 test)
      (d) --project 引数未指定で exit 1
      (e) 再実行で副作用なし (idempotent)

AC-5: docs/runbook/cloud-logging-safety-event-metrics.md に 7 章すべて存在
      (## 1. 概要 / ## 2. setup script 使い方 / ## 3. 6 metric の意味 /
       ## 4. 通常運用での grep query 集 / ## 5. alert 閾値調整手順 /
       ## 6. 異常時トリアージ / ## 7. enum 同期規律)

AC-6: docs/runbook/README.md が runbook index として存在し、本 runbook への
      link を含む

AC-7: 既存 promptSafety.test.ts 全件 + 新規 4 test が PASS (619 → 623 件)

AC-8: tsc --noEmit エラーゼロ

AC-9: enum 同期規律のテスト (T3) が failing path で正しく fail することを
      手動確認 (sh script の 1 行を削って test 実行 → fail → 復元)
```

### テスト構成

| # | ファイル | 種別 | 目的 |
|---|---|---|---|
| T1 | `server/utils/promptSafetyEvents.test.ts` | unit | enum literal 値の pin (AC-2) |
| T2 | 既存 `server/utils/promptSafety.test.ts` | regression | 既存 619 件 PASS のまま (NFR-1) |
| T3 | `tests/static/safety-events-lockstep.test.ts` | static | TS enum と sh script SAFETY_EVENTS の集合一致 (AC-4c) |
| T4 | `tests/static/safety-events-bash-syntax.test.ts` | static | `bash -n scripts/setup-safety-event-metrics.sh` (AC-4a) |

---

## 8. スコープ外 / 将来課題

本 PR で扱わないもの:

- 実際の Cloud Logging metric / alert policy の本番作成 (本田様が runbook 通り手動 / script 実行)
- alert notification channel ID の設定 (環境依存、runbook に手順記載のみ)
- baseline 観察後の閾値確定 (実トラフィック observation 後の別作業)
- Issue #137 #6 (logger.warnSampled altitude、別 milestone、blast radius 大)
- 既存 warn 文言・log structure の変更 (compat 維持)
- terraform 等の本格 IaC 導入 (現規模に over-engineering)
- per-request 累積 marker 数を sanitize 後の response header に乗せる案 (#7 候補 c、scope 外)

---

## 9. Open Questions

本 PR 後の運用判断項目 (本田様の決定領域):

- **OQ-1**: alert notification channel として使う email アドレス / Slack webhook
  - 候補: `sanwaminamihonda@gmail.com` 等、本田様運用想定によって決定
- **OQ-2**: 6 metric の baseline 観察期間
  - 候補: 1 週間 / 1 ヶ月、実トラフィック発生規模に応じて決定
- **OQ-3**: 本番 `novel-writer-prod` への script 実行タイミング
  - 候補: dev 検証後 / 課金クォータ確認後、運用判断
- **OQ-4**: alert policy の enable タイミング (5 件 disabled の解除条件)
  - 「多くのユーザー」想定の規模感が固まったら baseline 観察 → 閾値確定 → enable

---

## 10. 参照

- Issue #137 ([https://github.com/Yukina1116/novel-writer/issues/137](https://github.com/Yukina1116/novel-writer/issues/137)) 全コメント
- PR #143 review-pr (silent-failure-hunter agent) の Medium 指摘
- `feedback_silent_fail_paired_signal.md` (silent fail に対する paired signal の規律)
- 公式 "Hooks Reference" exit code 規律 / "Harness Design for Long-Running Apps" Generator-Evaluator 分離
- 既存 `server/utils/promptSafety.ts` の `createWarnAggregator` factory 構造 (Issue #137 #4 で確立)
- 同 `tests/static/no-export-key.test.ts` (M6 PR-D で確立した static test pattern)
- 既存 spec [`2026-06-03-non-image-data-uri-detection-design.md`](./2026-06-03-non-image-data-uri-detection-design.md) / [`2026-06-03-collection-level-guard-design.md`](./2026-06-03-collection-level-guard-design.md)
