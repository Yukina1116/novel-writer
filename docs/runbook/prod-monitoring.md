# Runbook: Cloud Logging dashboard + alerting policy (Phase 4)

- Status: ✅ Phase 4 段階 2 実機構築完了 (2026-06-21、本田様番号単位認可下で AI executor が dashboard + 5 alerting policies + email channel を構築。後述「監視 dashboard 履歴」「監視構築履歴」参照) / ✅ GO-4 通知到達確認クローズ (2026-07-06、A2 実発火 + email 到達確認、A1/A3-A5 は config read-only 確認、詳細は「GO-4 判断根拠」参照)
- Last Updated: 2026-07-06
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
| 2026-06-21T00:25Z | prod-5xx-rate-high (A1) | ⏳ config のみ確認 (`gcloud alpha monitoring policies list` で enabled=true・閾値本書通りを read-only 確認、2026-07-06) | ライブ発火は見送り。無料版限定公開のため Phase 5 実トラフィックで自然検証する方針 (根拠: 本田様判断 2026-07-06) |
| 2026-06-21T00:25Z | prod-auth-fail-rate-high (A2) | ✅ **実発火確認済み** (2026-07-06T12:2x JST) | 本田様端末から `/api/users/init` へ無認証 POST を 6 分間・約 686 回送信 (全件 401)、`prod-auth-fail-rate-high` アラートが 12:28 に email 到達したことを Gmail 画面で確認 |
| 2026-06-21T00:25Z | prod-vertex-ai-quota-error (A3) | ⏳ config のみ確認 (read-only、2026-07-06) | ライブ発火 (実際の Vertex AI 429/503/504 誘発) はリスク相応でないため見送り。Phase 5 実トラフィックで自然検証 |
| 2026-06-21T00:25Z | prod-instance-saturation (A4) | ⏳ config のみ確認 (read-only、2026-07-06) | ライブ発火には max-instances=2 到達までの実負荷が必要でリスク相応でないため見送り。Phase 5 実トラフィックで自然検証 |
| 2026-06-21T00:25Z | prod-firestore-error (A5) | ⏳ config のみ確認 (read-only、2026-07-06) | ライブ発火には実際の Firestore エラー誘発が必要でリスク相応でないため見送り。Phase 5 実トラフィックで自然検証 |
| 2026-06-21T00:25Z | notification channel prod-email-channel (email hy.unimail.11@gmail.com) | ✅ **到達確認済み** (2026-07-06T12:28 JST、A2 発火時) | type=email、labels.email_address が hy.unimail.11@gmail.com であることも `gcloud alpha monitoring channels describe` で read-only 確認済み |

### GO-4 判断根拠 (2026-07-06)

A1〜A5 全 5 policy をライブ発火させることも技術的には可能だが、A3 (Vertex AI エラー誘発)・A4 (インスタンス飽和までの実負荷)・A5 (Firestore エラー誘発) は本番相応のリスクを伴う一方、本アプリは無料版限定の低リスク公開であるため、費用対効果に見合わないと判断 (本田様承認 2026-07-06)。かわりに以下の 2 点でパイプライン全体の健全性を実証した:

1. **A2 の実発火 + email 到達確認** (上表) — アラートポリシー評価エンジン → notification channel → 実際の email 配送、という経路全体が機能することを実証
2. **A1/A3/A4/A5 の config read-only 確認** — `gcloud alpha monitoring policies list` で 5 policy 全て `enabled=true` かつ閾値が本書の設計通りであることを確認

A1/A3/A4/A5 の実発火確認は、Phase 5 公開後に実際に発生する 5xx / quota エラー / インスタンス飽和 / Firestore エラーで自然に検証される前提とする。
