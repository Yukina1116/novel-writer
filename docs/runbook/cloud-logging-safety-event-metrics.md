# Cloud Logging safetyEvent metrics 運用 runbook

- **関連 Issue**: [#137 #7](https://github.com/Yukina1116/novel-writer/issues/137)
- **関連 spec**: [`docs/spec/promptSafety/2026-06-04-observability-metric-counter-design.md`](../spec/promptSafety/2026-06-04-observability-metric-counter-design.md)
- **関連 script**: [`scripts/setup-safety-event-metrics.sh`](../../scripts/setup-safety-event-metrics.sh)
- **関連 enum**: [`server/utils/promptSafetyEvents.ts`](../../server/utils/promptSafetyEvents.ts)

`server/utils/promptSafety.ts` が emit する 6 種類の `safetyEvent` を Cloud Logging log-based metric と Cloud Monitoring alert policy で観測可能化する手順書。

---

## 1. 概要 + 前提条件

### 観測対象 6 metric

| safetyEvent | metric 名 | 意味 |
|---|---|---|
| `image-omitted` | `prompt_safety_image_omitted_count` | `data:image/...` dataURI を marker 置換した件数 |
| `non-image-data-uri-omitted` | `prompt_safety_non_image_data_uri_omitted_count` | PDF/audio 等の非画像 dataURI を marker 置換した件数 |
| `oversized-truncated` | `prompt_safety_oversized_truncated_count` | 100KB 超の string を切詰めた件数 |
| `recursion-depth-exceeded` | `prompt_safety_recursion_depth_exceeded_count` | 再帰深度 (1000) を超過した件数 |
| `collection-overflow` | `prompt_safety_collection_overflow_count` | array 累積 byte (200KB) を超過した件数 |
| `histogram-overflow` | `prompt_safety_histogram_overflow_count` | path histogram の cardinality (256 bucket) を超過した件数 (paired signal) |

各 metric は **個別 warn** (`safetyEvent: 'image-omitted'`) と **batch warn** (`safetyEvent: 'image-omitted-batch'`) を **1 metric に合算**する。filter regex: `jsonPayload.safetyEvent=~"^<event>(-batch)?$"`

### ⚠ metric の意味 (重要)

この metric が count するのは **matching log entry 数** (= surge signal) であって **実 event 発生数の絶対値ではない**。

`server/utils/promptSafety.ts` の `createWarnAggregator` factory は **per-call 上限 50 件の個別 warn + 1 件の batch warn** で log amplification を抑制する設計 (PR #139)。このため:

- 1 call で 1000 件発生 → metric count は **50 個別 + 1 batch = 51 件**
- 1 call で 30 件発生 → metric count は **30 個別 + 0 batch = 30 件** (batch 発火しない)
- 100 call で各 5 件発生 → metric count は **500 個別 + 0 batch = 500 件**

つまり **per-call で 51 件以上は観測できない**。これは surge 検知 (異常な call rate 検知) には十分だが、**「累積で N 件以上 1 call で起きた」を知りたい時は別経路**を使う。

### 実 event 数を知る方法 (補助手段)

`*-batch` log の payload にある `totalCount` / `omittedCount` / `pathPrefixes` field を Cloud Logging で別途 grep する (§4.3 / §4.4 参照)。例:

```
resource.type="cloud_run_revision"
jsonPayload.safetyEvent="image-omitted-batch"
jsonPayload.totalCount>1000
```

これで「1 call で 1000 件超の image-omitted が batch 集約された呼出」を時系列で見える。

### 前提条件

- **gcloud CLI** がインストール済み、本田様アカウントで `gcloud auth login` 済み
- **対象 project の API 有効化**:
  - Cloud Logging API (`logging.googleapis.com`)
  - Cloud Monitoring API (`monitoring.googleapis.com`)
- **IAM 権限**:
  - `roles/logging.configWriter` (log-based metric 作成)
  - `roles/monitoring.alertPolicyEditor` (alert policy 作成)
  - `roles/monitoring.notificationChannelEditor` (notification channel 作成)
- **対象 project**: `novel-writer-dev` (dev 検証先) → `novel-writer-prod` (本番、課金クォータ確認後)

---

## 2. setup script 使い方

### 2.1 初回 setup (dev)

```bash
# 1. dry-run で適用予定を確認 (副作用ゼロ)
./scripts/setup-safety-event-metrics.sh --project novel-writer-dev --dry-run

# 2. 出力で 6 metric scaffold + 6 alert scaffold を確認

# 3. 本適用
./scripts/setup-safety-event-metrics.sh --project novel-writer-dev

# 4. 再実行で idempotent 確認 (副作用なし、describe → update 経路)
./scripts/setup-safety-event-metrics.sh --project novel-writer-dev
```

### 2.2 本番への展開

```bash
# 1. dev で動作確認した後、prod へ
./scripts/setup-safety-event-metrics.sh --project novel-writer-prod --dry-run
./scripts/setup-safety-event-metrics.sh --project novel-writer-prod
```

### 2.3 confirm: 作成した metric を Console で確認

[https://console.cloud.google.com/logs/metrics](https://console.cloud.google.com/logs/metrics) → project 切替 → 6 件の `prompt_safety_*_count` を確認。

---

## 3. 6 metric の意味 (個別解説)

各 metric の「正常時に出る/出ない」「異常境界」を一覧化。

### 3.1 `prompt_safety_image_omitted_count`

- **何を捕まえる**: `data:image/png|jpeg|webp|...` 等の Imagen 生成画像 dataURI が prompt に乗りそうになった件数 (sanitize で marker 置換)
- **正常時**: キャラクター生成・編集時に `appearance.imageUrl` から散発的に出る。1 call につき 1-5 件程度
- **異常境界**: 1 分間に 100 件超 → 大量画像ペースト / 攻撃的入力の疑い

### 3.2 `prompt_safety_non_image_data_uri_omitted_count`

- **何を捕まえる**: `data:application/pdf;base64,...` / `data:audio/...` 等の非画像 dataURI
- **正常時**: ほぼ 0 件 (本アプリは画像以外の dataURI を使う UI が存在しない)
- **異常境界**: 1 分間に 10 件超 → PDF / audio ペースト / 攻撃ベクトルの可能性

### 3.3 `prompt_safety_oversized_truncated_count`

- **何を捕まえる**: 100KB 超の string field が truncate された件数
- **正常時**: 長文章執筆中に `currentChunk.text` 等で散発的に出る
- **異常境界**: 1 分間に 50 件超 → 大量テキストペースト / token-bomb 攻撃

### 3.4 `prompt_safety_recursion_depth_exceeded_count`

- **何を捕まえる**: 再帰深度 1000 を超過する deeply-nested object を sanitize した件数
- **正常時**: 0 件が普通 (通常データは深度 10 以下)
- **異常境界**: 1 分間に 1 件超 → 攻撃的構造 / 循環参照入力の疑い

### 3.5 `prompt_safety_collection_overflow_count`

- **何を捕まえる**: array 累積 byte 200KB 超過で残 element が marker 置換された件数
- **正常時**: gallery / lore / skills の大量列挙時に散発的に出る
- **異常境界**: 1 分間に 5 件超 → array 累積 byte 異常 (499B dataURI × 多数 等)

### 3.6 `prompt_safety_histogram_overflow_count` (paired signal)

- **何を捕まえる**: aggregator 内 path histogram の cardinality cap (256 bucket) 超過
- **正常時**: 0 件のはず (`MAX_HISTOGRAM_BUCKETS=256` は通常運用では到達しない)
- **異常境界**: **発火即異常**。aggregator OOM 防御の早期検知シグナル

---

## 4. 通常運用での Cloud Logging grep query 集

Cloud Logging Console ([https://console.cloud.google.com/logs](https://console.cloud.google.com/logs)) で直接叩く query。

### 4.1 全 safetyEvent を時系列で見る

```
resource.type="cloud_run_revision"
jsonPayload.safetyEvent=~"^(image-omitted|non-image-data-uri-omitted|oversized-truncated|recursion-depth-exceeded|collection-overflow|histogram-overflow)(-batch)?$"
```

### 4.2 特定 event だけを見る (例: histogram-overflow)

```
resource.type="cloud_run_revision"
jsonPayload.safetyEvent=~"^histogram-overflow(-batch)?$"
```

### 4.3 batch 集約 log だけを見る (51 件目以降のサマリー)

```
resource.type="cloud_run_revision"
jsonPayload.safetyEvent=~"-batch$"
```

### 4.4 batch log の pathPrefixes histogram を確認

```
resource.type="cloud_run_revision"
jsonPayload.safetyEvent=~"-batch$"
jsonPayload.pathPrefixes:*
```

### 4.5 特定 path で発火している件数を見る

```
resource.type="cloud_run_revision"
jsonPayload.safetyEvent="image-omitted"
jsonPayload.path=~"^appearance\."
```

---

## 5. alert policy 閾値調整手順

### ⚠ script の振る舞い (重要)

`setup-safety-event-metrics.sh` は **log-based metric (6 件) を実際に gcloud で create/update する**が、**alert policy は scaffold (stdout 出力のみ) であり、実際に作成しない**。これは notification channel ID が環境依存 (本田様 email / Slack 等) で script に hardcoded できないため。

したがって、`./scripts/setup-safety-event-metrics.sh --project xxx` 実行後の Cloud Monitoring policy 一覧 ([https://console.cloud.google.com/monitoring/alerting/policies](https://console.cloud.google.com/monitoring/alerting/policies)) には **何も増えていない**ことに注意。alert policy 作成は §5.2 以降の手順で Console から手動で実施する (channel 作成 §5.3 → 各 policy 作成時に attach する流れ)。

### 5.1 baseline 観察 (1〜4 週間)

`prompt_safety_*_count` metric が gcloud script で作成済なので、Metrics Explorer で観察する:

1. [https://console.cloud.google.com/monitoring/metrics-explorer](https://console.cloud.google.com/monitoring/metrics-explorer) を開く
2. METRIC 選択で `logging.googleapis.com/user/prompt_safety_image_omitted_count` (等) を選択
3. Time series chart で 1〜4 週間の rate を確認 (例: 平均 5 events/min)
4. 異常と判断したい rate を baseline の 3〜10x で仮決定

または Cloud Logging Console → Logs Explorer で §4.1 query を実行して目視で頻度確認も可。

### 5.2 alert policy 新規作成 (Console)

[https://console.cloud.google.com/monitoring/alerting/policies](https://console.cloud.google.com/monitoring/alerting/policies) で **CREATE POLICY** を押下し、metric ごとに以下の閾値で作成:

| event | 閾値設定の目安 (baseline × 3) |
|---|---|
| `image-omitted` | 例: > 100 / 1 min |
| `non-image-data-uri-omitted` | 例: > 10 / 1 min |
| `oversized-truncated` | 例: > 50 / 1 min |
| `recursion-depth-exceeded` | 例: > 1 / 1 min |
| `collection-overflow` | 例: > 5 / 1 min |
| `histogram-overflow` | **>= 1** (初期 enabled) |

⚠ **metric の上限値に注意**: §1 ⚠ で説明した「per-call 51 件上限」のため、上記閾値は metric count = matching log entry 数。「1 call で 1000 件」のような大規模 surge は §1 「実 event 数を知る方法」の batch totalCount 経路で観察する。

### 5.3 notification channel の設定

1. [https://console.cloud.google.com/monitoring/alerting/notifications](https://console.cloud.google.com/monitoring/alerting/notifications)
2. "ADD NEW" → Email を選択 → `sanwaminamihonda@gmail.com` 等を入力
3. 作成した channel ID をメモ
4. 各 alert policy の "Notifications" に channel を紐付け

### 5.4 disabled → enabled へ切替

baseline 確定 + 閾値設定 + channel 紐付け後、Cloud Monitoring Console の policy 一覧で各 policy の右上トグルで enable。

---

## 6. 異常時トリアージ

alert 発火時に何を確認するか。

### 6.1 histogram-overflow 発火 (paired signal、最優先)

| 確認項目 | 内容 |
|---|---|
| **症状** | aggregator が cardinality cap (256 bucket) を超過 |
| **原因候補** | (a) path が大量に異種混在 (unique 1000+ leaf) / (b) `(no-path)` bucket への大量集約 / (c) bug で path が generate されている |
| **確認手順** | §4 query で `parentEvent` field を確認 → どの個別 event 由来かを特定 → batch log の `pathPrefixes` を見る → **`firstOverflowPath` field で飽和を引き起こした path family を特定** |
| **対処** | path 多様性が正当なら `MAX_HISTOGRAM_BUCKETS` 引き上げ検討、bug なら通常修正 |

#### firstOverflowPath grep query 例

```
resource.type="cloud_run_revision"
jsonPayload.safetyEvent="histogram-overflow"
jsonPayload.firstOverflowPath:*
```

`firstOverflowPath` は 257 個目 (`MAX_HISTOGRAM_BUCKETS=256` 超過分) の unique path のうち最初に到達したもの (例: `appearance.gallery[*].metadata.<dynamic-key>.url` — 攻撃 payload の場合も、ユーザーが大量の動的 metadata key を含めた正当ケースも同じ形)。

**完全な path family 特定には組み合わせ運用**:
- `firstOverflowPath` (本 field): saturate 起点の 1 path
- `*-batch` log の `pathPrefixes` (top-5 path 分布、PR #144 追加)
- `*-batch` log の `truncatedBucketCount` (overflow 集約された総 path 数)
- 個別 warn の先頭 50 件 (`MAX_WARN_PER_CALL=50` 上限)

の 4 種類を組み合わせることで、257 個目以降が `(overflow)` bucket に集約されても、攻撃 payload / 大量入力の path 構造を再現可能。

### 6.2 image-omitted surge (1 分 > 100 件)

| 確認項目 | 内容 |
|---|---|
| **症状** | 1 分間に画像 marker 置換が急増 |
| **原因候補** | (a) 大量画像ペースト by user / (b) Imagen 生成画像が誤って prompt 経路に乗った / (c) 攻撃的入力 |
| **確認手順** | §4.5 query で path を絞り込み、特定 path に偏っているか確認 |
| **対処** | 偏りあり → 該当 path の source code 確認、なし → user 入力パターン調査 |

### 6.3 non-image-data-uri-omitted 発火 (1 分 > 10 件)

| 確認項目 | 内容 |
|---|---|
| **症状** | PDF / audio dataURI が大量入力された |
| **原因候補** | (a) user が PDF ペースト試行 / (b) 攻撃ベクトル探索 |
| **確認手順** | user-agent / uid (PII 配慮、`uid=...` の hash 程度) を確認、特定 user 偏在か |
| **対処** | 偏在 → FE 側 input validation 強化、分散 → 攻撃の可能性、quota 確認 |

### 6.4 recursion-depth-exceeded 発火

| 確認項目 | 内容 |
|---|---|
| **症状** | 深度 1000 超過の deeply-nested input |
| **原因候補** | (a) 循環参照 / (b) 攻撃的構造 (DoS 試行) / (c) bug でデータ構造が破損 |
| **確認手順** | path log を確認 (深度 1000 に到達した枝) |
| **対処** | bug の可能性を最優先で確認、攻撃なら quota / WAF 強化検討 |

### 6.5 collection-overflow / oversized-truncated surge

| 確認項目 | 内容 |
|---|---|
| **症状** | array 累積 byte / string 単発 byte の閾値超過 |
| **原因候補** | (a) 大量列挙 (gallery / lore 100+ item) / (b) 大量テキストペースト / (c) token-bomb |
| **確認手順** | §4.5 で path 絞り込み + `bytes` field 分布確認 |
| **対処** | 正当用途なら閾値 (`MAX_COLLECTION_BYTES` / `MAX_FIELD_BYTES`) 見直し、攻撃なら quota |

---

## 7. enum / script 同期規律

### 7.1 単一 source of truth

`server/utils/promptSafetyEvents.ts` の `SAFETY_EVENTS` を **正本**とし、以下を手動同期する:

| 同期先 | 同期内容 |
|---|---|
| `scripts/setup-safety-event-metrics.sh` | `SAFETY_EVENTS=( ... )` bash array (値のみ、順序は declaration 順) |
| `docs/runbook/cloud-logging-safety-event-metrics.md` | §1 metric 表、§3 解説、§4 grep query 集、§5 閾値表、§6 トリアージ |
| `docs/spec/promptSafety/2026-06-04-observability-metric-counter-design.md` | §4 metric 命名表、§7 AC-2 値 |

### 7.2 drift 検知 (機械化)

- `tests/static/safety-events-lockstep.test.ts` (T3): TS enum と sh script の SAFETY_EVENTS 集合が一致しないと CI 失敗
- `tests/static/safety-events-bash-syntax.test.ts` (T4): sh script の bash 構文エラー / dry-run 出力件数 / --project 必須を CI 失敗で検知
- `server/utils/promptSafetyEvents.test.ts` (T1): enum literal 6 値の byte-for-byte pin

### 7.3 新規 safetyEvent 追加手順

**命名規約 (必須)**: 新規 event 名は `^[a-z][a-z0-9-]*$` (英小文字始まり、英小文字 / 数字 / hyphen のみ) を満たすこと。`.` `*` 等の regex メタ文字を含めると `event_to_filter()` で生成される Cloud Logging filter regex が意図せず広がる risk あり (evaluator LOW 指摘、Issue #137 #7 評価)。`[A-Z]` も `event_to_metric_name()` の `tr '-' '_'` 変換と組合せで GCP metric 名規約 (英小文字) に違反するため不可。

1. `server/utils/promptSafetyEvents.ts` の `SAFETY_EVENTS` に 1 行追加 (命名規約を満たす値)
2. `scripts/setup-safety-event-metrics.sh` の `SAFETY_EVENTS=( ... )` array に 1 行追加 (順序を合わせる)
3. 本 runbook §1 metric 表 / §3 解説 / §6 トリアージに対応する row 追加
4. design-doc (`docs/spec/promptSafety/2026-06-04-observability-metric-counter-design.md`) を更新 (or 後継 spec を新規作成)
5. `server/utils/promptSafetyEvents.test.ts` の期待 6 値を 7 値に更新
6. `tests/static/safety-events-lockstep.test.ts` の `expected` set を更新
7. `./scripts/setup-safety-event-metrics.sh --project novel-writer-dev --dry-run` で出力確認 → 本適用

### 7.4 規律違反時のシグナル

- CI fail (lockstep / bash syntax test) → 同期漏れ
- Cloud Logging に metric があるが値が 0 で推移 → emit 側 (TS) の register 漏れ
- runtime warn は出ているが metric に乗らない → filter regex 誤り (`prompt_safety_<event-with-underscores>_count` 命名規約逸脱)

---

## 参照

- 設計文書: [`docs/spec/promptSafety/2026-06-04-observability-metric-counter-design.md`](../spec/promptSafety/2026-06-04-observability-metric-counter-design.md)
- 関連 PR: #143 (Issue #137 #1)、#144 (#5)、#145 (#2 残り)、#138-#141 (#2 / #3 / #4)
- silent fail paired signal 規律: `feedback_silent_fail_paired_signal.md` (グローバル memory)
- Cloud Logging structured logging: [https://cloud.google.com/logging/docs/structured-logging](https://cloud.google.com/logging/docs/structured-logging)
- Cloud Logging log-based metrics: [https://cloud.google.com/logging/docs/logs-based-metrics](https://cloud.google.com/logging/docs/logs-based-metrics)
- Cloud Monitoring alert policies: [https://cloud.google.com/monitoring/alerts](https://cloud.google.com/monitoring/alerts)
