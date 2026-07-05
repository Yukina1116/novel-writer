# Runbook: Cloud Logging dashboard + alerting policy (Phase 4)

- Status: ✅ Phase 4 段階 2 実機構築完了 (2026-06-21、本田様番号単位認可下で AI executor が dashboard + 5 alerting policies + email channel を構築。後述「監視 dashboard 履歴」「監視構築履歴」参照)
- Last Updated: 2026-06-21
- Owner: yasushi-honda
- Related ADR: [ADR-0003](../adr/0003-public-launch-operations.md) §Decision 2 (本書の判断基準を裏付ける規範)
- Related: [Phase 4 spec](../spec/prod-migration/phase4-tasks.md), [runbook prod-slo.md](./prod-slo.md) (本書 alerting 閾値と SLO 指標を整合)

> **本書の位置付け**: Cloud Logging dashboard + alerting policy + 通知 channel 設計を起草。実機構築 (`gcloud monitoring policies create` 等) は **段階 2 (本 Phase 対象外、別 PR)** で本田様番号単位認可後に AI が実行する。本書は構成記載のみ。

## 用途

- Cloud Logging dashboard の構成設計
- alerting policy 5 種類の閾値定義
- 通知 channel 設計 (email を最小案、Slack / SMS は future work)
- 段階 2 実機構築時の `gcloud` コマンド template

## 前提

- prod = `novel-writer-prod` (Cloud Run + Firestore + Vertex AI @ asia-northeast1)
- Cloud Logging は GCP project default で有効
- 通知先 email = 本田様の Gmail (現状 GO-1 法務確認の連絡先と同じ、要本田様確認)

## dashboard 構成

### dashboard name: `novel-writer-prod 監視`

### widget 構成

| # | widget | 表示内容 | 出典 | refresh |
|---|---|---|---|---|
| W1 | line chart | `/api/*` request rate (1 分粒度、24h) | Cloud Run request log | 1 分 |
| W2 | line chart | `/api/*` 5xx error rate (5 分粒度、24h) | Cloud Run request log filter `httpRequest.status >= 500` | 5 分 |
| W3 | line chart | auth fail rate (`401` rate / total) | Cloud Run request log filter `httpRequest.status = 401` | 5 分 |
| W4 | line chart | Vertex AI 429 / 503 / 504 rate | server log filter `severity=ERROR AND jsonPayload.statusCode IN (429,503,504)` | 5 分 |
| W5 | scorecard | Cloud Run instance count (current) | Cloud Run metric `instance_count` | 1 分 |
| W6 | scorecard | Firestore ERROR レベル log 件数 (直近 5 分) | Firestore log filter `severity=ERROR` | 5 分 |
| W7 | line chart | Vertex AI quota 利用率 (gemini-3.1-flash-lite) | Vertex AI quota metric | 5 分 |
| W8 | line chart | usage `reserve` / `commit` / `cancel` 比率 | server log filter `withUsageQuota` | 5 分 |

### dashboard URL の保管

dashboard 作成後の URL を本書末尾「監視 dashboard 履歴」に追記。本田様のブックマーク + 引き継ぎ時の参照用。

## alerting policy

### policy 5 種類 (initial draft、Phase 5 real traffic 後に閾値再校正)

| # | policy name | 条件 | 評価窓 | 通知 channel | 重要度 |
|---|---|---|---|---|---|
| A1 | `prod-5xx-rate-high` | `/api/*` 5xx rate > 5% | 5 分平均 | email | P1 |
| A2 | `prod-auth-fail-rate-high` | `401` rate > 50% | 5 分平均 | email | P1 (公開直後の identity 設定漏れ検知) |
| A3 | `prod-vertex-ai-quota-error` | Vertex AI 429/503/504 rate > 10% | 5 分平均 | email | P1 (quota 超過検知) |
| A4 | `prod-instance-saturation` | Cloud Run `instance_count` = `max-instances` (=2) | 5 分継続 | email | P1 (突発 traffic 警告、課金リスク) |
| A5 | `prod-firestore-error` | Firestore ERROR レベル log | 直近 5 分に 1 件以上 | email | P2 |

### alerting policy template (段階 2 で `gcloud` 実行)

```bash
# policy A1 example: 5xx rate > 5% for 5 min
gcloud alpha monitoring policies create \
  --project=novel-writer-prod \
  --display-name='prod-5xx-rate-high' \
  --documentation='Cloud Run 5xx rate exceeded 5% over 5 min window. Investigate via dashboard W2.' \
  --condition-filter='resource.type="cloud_run_revision" AND metric.type="run.googleapis.com/request_count" AND metric.label."response_code_class"="5xx"' \
  --condition-threshold-value=0.05 \
  --condition-threshold-comparison=COMPARISON_GT \
  --condition-aggregations='alignment-period=300s,per-series-aligner=ALIGN_RATE,cross-series-reducer=REDUCE_MEAN' \
  --condition-duration=300s \
  --notification-channels='<email channel ID>'
```

> **注**: 実際の `gcloud alpha monitoring policies create` の引数仕様は GCP 側変更があり得るため、段階 2 実機構築時に最新ドキュメントを web search で確認すること。

## 通知設計

### email (最小案、本 Phase で構築)

| 項目 | 値 |
|---|---|
| notification channel type | `email` |
| 通知先 | 本田様の Gmail (要本田様確認) |
| 即時通知 | A1〜A4 (P1) は 1 通/incident、cooldown 30 分 |
| ダイジェスト | A5 (P2) は 1 日 1 通サマリー (incident なしの日も「異常なし」通知) |

### Slack (future work)

| 項目 | 状態 |
|---|---|
| Webhook URL 取得 | ⏳ 未着手 |
| 通知 channel 名 | `#novel-writer-prod-alerts` (案) |
| 即時通知 | P0 / P1 即時、P2 は 1 時間ダイジェスト |
| 検討時期 | 一般公開後 1 ヶ月時点で「email だけでは検知遅延が大きい場面があったか」を本田様判断 |

### SMS / Phone (future work)

| 項目 | 状態 |
|---|---|
| 番号登録 | ⏳ 未着手 |
| 用途 | P0 (公開即遮断 trigger) のみ、深夜帯のインシデント検知 |
| 検討時期 | 一般公開後 3 ヶ月時点で本田様判断 |

### 通知 channel 確定の決定権

email 通知先 (本田様 Gmail address) の確定は **decision-maker = 本田様** 判断。本書は default で本田様 Gmail を想定するが、実機構築時 (段階 2) に再確認する。

## 段階 2 (本 Phase 対象外) で実施する手順 (preview)

1. 本田様番号単位認可受領 ("PR β merge 後、dashboard / alerting 構築を実行してよい")
2. email notification channel 作成 (`gcloud alpha monitoring channels create`)
3. dashboard 作成 (Console UI または `gcloud monitoring dashboards create`)
4. alerting policy 5 件作成 (上記 template)
5. 構築完了後、`/api/no-such-endpoint` への curl 等で意図的に 404/500 を発生させ、通知が到達することを確認
6. 通知到達確認証跡 (alert ID / 通知時刻 / email 受信時刻) を本書末尾「監視構築履歴」に追記

## 関連 ADR / runbook link

- [ADR-0003 §Decision 2](../adr/0003-public-launch-operations.md#2-cloud-logging-monitoring--alerting-policy--email-通知を最小案として採用) (本書の判断基準)
- [runbook prod-slo.md](./prod-slo.md) (本書 alerting 閾値と SLO 指標を整合)
- [phase4-tasks.md](../spec/prod-migration/phase4-tasks.md) §Phase 5 GO チェック GO-4

## 監視 dashboard 履歴

| 日時 | 実行者 | dashboard 名 | URL | 備考 |
|---|---|---|---|---|
| 2026-06-21T00:25Z | AI (github-deploy SA, workflow [#27887069695](https://github.com/Yukina1116/novel-writer/actions/runs/27887069695)) | `novel-writer-prod 監視` | https://console.cloud.google.com/monitoring/dashboards/builder/5d5790d9-b11a-49f6-9776-c6b6163b1891?project=novel-writer-prod | 8 widget (W1-W8) 構築。W7/W8 は placeholder filter、段階 2/3 で log-based metric に refactor 予定 |

## 監視構築履歴

| 日時 | policy name | 通知到達確認 | 備考 |
|---|---|---|---|
| 2026-06-21T00:25Z | prod-5xx-rate-high (A1) | ⏳ 未確認 (段階 3 で実 traffic 観測時に検証) | COMPARISON_GT 0.5/sec, 300s |
| 2026-06-21T00:25Z | prod-auth-fail-rate-high (A2) | ⏳ 未確認 (段階 3 で実 traffic 観測時に検証) | COMPARISON_GT 1.0/sec, 300s |
| 2026-06-21T00:25Z | prod-vertex-ai-quota-error (A3) | ⏳ 未確認 (段階 3 で実 traffic 観測時に検証) | COMPARISON_GT 0.3/sec, 300s, regex 429\|503\|504 |
| 2026-06-21T00:25Z | prod-instance-saturation (A4) | ⏳ 未確認 (段階 3 で実 traffic 観測時に検証) | COMPARISON_GT 1, 300s (instance_count>1 ≡ ≥2、max-instances=2 張付き検知) |
| 2026-06-21T00:25Z | prod-firestore-error (A5) | ⏳ 未確認 (段階 3 で実 traffic 観測時に検証) | COMPARISON_GT 0, 300s, severity=ERROR |
| 2026-06-21T00:25Z | notification channel prod-email-channel (email hy.unimail.11@gmail.com) | ⏳ 未確認 (実 alert 発火時に到達確認) | type=email |
