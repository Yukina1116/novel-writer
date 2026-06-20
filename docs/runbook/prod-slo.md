# Runbook: SLO + incident response (Phase 4 initial draft)

- Status: 🚧 **Initial draft**. SLO targets defined here are to be **recalibrated after Phase 5 (public launch) yields real traffic data**. Single-tenant private testing data is insufficient to set authoritative targets.
- Last Updated: 2026-06-20
- Owner: yasushi-honda
- Related ADR: [ADR-0003](../adr/0003-public-launch-operations.md) §Decision 3 (本書の判断基準を裏付ける規範)
- Related: [Phase 4 spec](../spec/prod-migration/phase4-tasks.md), [runbook prod-monitoring.md](./prod-monitoring.md) (alerting 閾値と本書 SLO 指標を整合)

> **本書の位置付け**: SLO 指標 (可用性 / エラー率 / AI 応答失敗率) と incident response (P0/P1/P2) の **initial draft**。Phase 5 公開後の real traffic データに基づき再校正する前提。最終的な SLO 採用 (Accepted 化) は **decision-maker = owner (本田様)** レビュー後に AI が status 更新 PR で反映する。

## 用途

- SLO 指標の initial draft 定義 (3 軸: 可用性 / 5xx エラー率 / AI 応答失敗率)
- incident response の重要度分類 (P0 / P1 / P2) と対応手順
- 通知 channel の重要度別マッピング
- Phase 5 public launch 後の SLO 再校正の判断基準

## 前提

- prod = `novel-writer-prod` (Cloud Run + Firestore + Vertex AI @ asia-northeast1)
- alerting policy は `prod-monitoring.md` 参照 (本書と閾値を整合)
- single-tenant 段階の現状では SLO 違反が起こる場面は限定的
- Phase 5 公開後の real traffic で initial draft 数値を上下調整する前提

## SLO 指標

### 3 軸 initial draft

| 指標 | initial draft target | 測定窓 | 出典 metric | 違反検知 trigger |
|---|---|---|---|---|
| 可用性 (uptime) | **99.5% monthly** (= 約 3.65 時間 downtime/月) | 月次 | Cloud Run uptime check (5 分粒度) | 月次集計で 99.5% 下回り |
| 5xx エラー率 | **< 1%** | 24 時間 rolling | `/api/*` request log filter `httpRequest.status >= 500` | 24h 平均 ≥ 1% |
| AI 応答失敗率 (Vertex AI 429/503/504) | **< 5%** | 24 時間 rolling | server log filter `severity=ERROR AND jsonPayload.statusCode IN (429,503,504)` | 24h 平均 ≥ 5% |

### 数値の根拠と注記

- **99.5%**: SaaS 業界一般的な initial target (Google Cloud のような大規模インフラは 99.95%+ だが、single-developer SaaS では 99.5% が現実的初期値)
- **5xx < 1%**: Cloud Run + Express の安定性指標、Phase 2 smoke test では 0% を維持
- **Vertex AI < 5%**: Vertex AI の quota / region 障害頻度を考慮、Phase 2 smoke では 0% だが公開後は quota 接近で増加する想定

### 再校正 (recalibration) 条件

| trigger | 対応 |
|---|---|
| Phase 5 公開後 **1 ヶ月** の real traffic 取得完了 | 初回再校正、SLO Accepted 化候補 |
| 公開後 SLO 違反が **3 ヶ月連続** で発生 | 数値を緩める or インフラ強化判断 |
| 公開後 SLO 違反が **3 ヶ月ゼロ** で推移 | 数値を厳しくする候補 (99.5% → 99.8% 等) |
| Vertex AI region 障害が **想定外頻度** で発生 | AI 失敗率閾値を緩める or リトライ機構強化 |

## incident response

### 重要度分類 (P0 / P1 / P2)

| 重要度 | 状況 | 例 | 対応 SLA |
|---|---|---|---|
| **P0** | 公開即遮断 trigger | 情報漏洩 / 認証バイパス / 課金暴走 / 規約違反データ流出 | 即時 (検知から 15 分以内に段階 1 rollback 発火) |
| **P1** | SLO 閾値違反継続 | 5xx > 5% が 30 分以上 / auth fail > 50% が 30 分以上 / Vertex AI 429/503/504 > 10% が 30 分以上 / instance saturation 5 分以上 | 1 時間以内 (原因調査 + 段階 2 rollback 判断) |
| **P2** | 単発エラー / 短時間異常 | Firestore ERROR レベル log 単発 / 5xx スパイク (短時間) | 24 時間以内 (分析 → fix PR) |

### incident response の手順 (重要度別)

#### P0 対応 (15 分以内)

```bash
# Step 1: 段階 1 rollback (公開即遮断) を即時発火
gcloud run services update novel-writer \
  --no-allow-unauthenticated \
  --region=asia-northeast1 \
  --project=novel-writer-prod

# Step 2: incident 起票 (GitHub Issue or 本田様 note)
#   title: "[P0] <症状>"
#   body: 検知時刻 / 検知元 (alerting policy ID) / 影響範囲 / 暫定遮断完了時刻

# Step 3: 原因調査 → 修正 → 再 deploy → 段階 1 解除 (--allow-unauthenticated 復元)
#   詳細は runbook prod-deploy-flow.md §rollback 段階 1 参照
```

#### P1 対応 (1 時間以内)

```
1. alerting policy の通知 email を受領
2. dashboard (prod-monitoring.md §dashboard 構成) で原因 widget を確認
3. 原因によって判断:
   - 新 revision の欠陥 → 段階 2 rollback (revision 切替)
   - Vertex AI quota 接近 → quota 申請 trigger を本田様判断
   - データ整合性問題 → 段階 4 rollback (PITR restore) 検討
4. 修正完了後、incident note を本書末尾「incident 履歴」table に追記
```

#### P2 対応 (24 時間以内)

```
1. ダイジェスト email (1 日 1 通) で受領
2. dashboard で発生時刻 + 範囲を分析
3. 必要なら GitHub Issue 起票 (rating ≥ 7 の場合のみ、CLAUDE.md Issue triage rule)
4. fix PR (dev → prod 通常 fix path、ADR-0002 §1 deploy 判断に従う)
```

## 通知 channel

### initial draft mapping

| 重要度 | 通知方式 | 詳細 |
|---|---|---|
| P0 | email 即時 | 検知 → 1 分以内に alerting policy が email 送信、cooldown なし (incident 発生中は連投許容) |
| P1 | email 即時 | 検知 → 5 分以内に alerting policy が email 送信、cooldown 30 分 |
| P2 | email ダイジェスト | 1 日 1 通サマリー (incident なしの日も「異常なし」通知で「監視が止まっている」状態の検知) |

### future work (一般公開後 1 ヶ月時点で再評価)

| 通知方式 | trigger | 検討時期 |
|---|---|---|
| Slack | email だけでは検知遅延が大きい場面があったか | 公開後 1 ヶ月時点 |
| SMS / Phone | P0 の深夜帯検知 (email 未確認) で実害が出たか | 公開後 3 ヶ月時点 |
| PagerDuty / OpsGenie | チーム化 (複数オーナー / 当番制 incident response) 時 | 公開後 6 ヶ月時点 or チーム化時点 |

## SLO 採用 (Accepted 化) の手順

### Phase 4 段階 3 (SLO Accepted 化 PR)

1. **公開後 1 ヶ月** の real traffic データを Cloud Logging から集計
2. 本書の initial draft target と実値を比較、本田様レビュー
3. 本田様の判断で:
   - **そのまま採用** → 本書 Status を `Accepted` に更新 + alerting policy 閾値を本書と整合
   - **再校正** → 数値を上下調整、本書 + `prod-monitoring.md` alerting policy 両方を整合修正
4. SLO Accepted 化 PR を起票 → 本田様番号単位認可 → merge

### Phase 5 GO への影響

GO-5 (SLO Accepted) が Phase 5 公開後の運用 phase 移行 (= Phase 4 完全終了) の前提条件。本書が `Draft` のままだと Phase 4 完了とみなさない。

## 関連 ADR / runbook link

- [ADR-0003 §Decision 3](../adr/0003-public-launch-operations.md#3-slo-を-initial-draft-として採用しphase-5-real-traffic-で再校正) (本書の判断基準)
- [runbook prod-monitoring.md](./prod-monitoring.md) (alerting 閾値と本書 SLO 指標を整合)
- [runbook prod-pitr.md](./prod-pitr.md) §ADR-0002 rollback 4 段階拡張案 (P1/P0 で段階 4 採用検討時の参照)
- [runbook prod-deploy-flow.md](./prod-deploy-flow.md) §rollback (P0/P1 対応で段階 1/2/3 操作の手順)
- [phase4-tasks.md](../spec/prod-migration/phase4-tasks.md) §Phase 5 GO チェック GO-5

## incident 履歴

| 日時 | 重要度 | 症状 | 対応 | resolved 時刻 | 備考 |
|---|---|---|---|---|---|
| (一般公開後の実 incident で追記) | - | - | - | - | - |

## SLO 再校正履歴

| 日時 | 再校正前 target | 再校正後 target | 根拠 | 担当 |
|---|---|---|---|---|
| (Phase 4 段階 3 SLO Accepted 化 PR で追記) | - | - | - | - |
