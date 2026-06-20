# ADR-0003: 一般公開時の運用追補 (PITR / 監視 / SLO / incident response)

- Status: Draft (本書は AI 起草の **草案**。最終的な運用判断は **decision-maker = owner (本田様)** に委ねる)
- Date: 2026-06-20
- Decision Drivers: 一般公開 (Phase 5) に向けた可用性 / データ保護 / 監視 / incident response の基盤整備
- Related: [Phase 4 spec](../spec/prod-migration/phase4-tasks.md), [runbook prod-pitr.md](../runbook/prod-pitr.md), [runbook prod-monitoring.md](../runbook/prod-monitoring.md), [runbook prod-slo.md](../runbook/prod-slo.md)
- Related ADR: [ADR-0001](./0001-local-first-architecture.md) §Consequences (緊急対応 + max-instances=2 + 法務確認 MUST) / [ADR-0002](./0002-dev-prod-deploy-flow.md) (dev → prod 運用フロー)
- Supersedes: なし
- Superseded by: なし

> **ADR-0002 remains authoritative for dev → prod deploy flow (deploy 判断 / tag 戦略 / rollback / データ同期).
> ADR-0003 adds public-launch readiness controls (PITR / monitoring / SLO / incident response) without superseding ADR-0002.**

> **本書の位置付け**: 本 ADR は Phase 4 (一般公開準備フェーズ) において、AI (Claude Code) が起草した **公開準備の判断基準の草案** である。最終的な運用判断 (PITR 有効化実行、Logging dashboard 構築実行、SLO 採用、incident response 通知 channel 確定、公開実行 GO-6) は **decision-maker (owner = 本田様)** に委ねる。AI は executor として手順実行と起草を担当する (AI 駆動開発 4 原則 §1)。

## Context

### Phase 3 完了時点の状況 (2026-06-20)

- ADR-0002 で dev → prod 運用フローの 4 判断基準 (deploy 判断 / tag / rollback 3 段階 / データ同期) を文書化
- runbook prod-deploy-flow.md で実務手順を文書化
- prod は本田様 (owner) 自身の dev test 用稼働中、一般公開は未

### Phase 4 で答える未解決の問い

Phase 3 で **「Phase 4 GO チェック」** として残した 5 つの未決項目 (GO-1 法務 / GO-2 課金 / GO-3 PITR / GO-4 Logging / GO-5 SLO) のうち、本 ADR は GO-3 / GO-4 / GO-5 の **規範** を起草する。GO-1 / GO-2 は decision-maker 領分のため、本 ADR では扱わず phase4-tasks.md 内 status tracker に委ねる。

1. **データ rollback**: ADR-0002 §3 で rollback を 3 段階に縮約し「Firestore データ rollback は Phase 4 で PITR と一体再設計」と予告した宿題への回答
2. **監視**: 一般公開後に prod の異常を検知する仕組み (現状: 本田様自身が気付くしかない)
3. **SLO / incident response**: 「何を異常とみなし、どう対応するか」の明文化

### 制約

- prod は現状 owner 1 名のみ利用、一般公開後の DAU は不確実
- SLO / incident response を「正式採用」する前に real traffic データ (Phase 5 公開後) で再校正する前提
- 通知 channel (email / Slack / SMS) の確定は decision-maker 判断
- AI 単独で PITR 有効化 / Logging dashboard 構築 / SLO 採用を実行しない (番号単位明示認可必須)

## Decision

以下 3 つの規範を採用する。各規範は本 ADR (なぜ) と runbook (どう) で対になる。

### 1. Firestore PITR を Phase 4 段階 2 で有効化し、rollback 4 段階目を実装する

**規範**: Firestore Point-In-Time Recovery (PITR) を一般公開前に有効化し、ADR-0002 §3 の rollback 段階を **3 → 4 段階** に拡張する。

| 段階 | 状況 | 操作 | 復旧時間目安 |
|---|------|------|------------|
| 段階 1: 公開即遮断 | 既存 (ADR-0002) | `--no-allow-unauthenticated` | 数十秒 |
| 段階 2: revision 切替 | 既存 (ADR-0002) | `update-traffic --to-revisions` | 数十秒〜数分 |
| 段階 3: service delete | 既存 (ADR-0002) | `gcloud run services delete` | 数分 |
| **段階 4: Firestore PITR clone** | **新規 (本 ADR で起草、runbook prod-pitr.md §ADR-0002 rollback 4 段階拡張案 で手順、ADR-0002 本体反映は段階 2 PITR 有効化後 or 別 PR)** | `gcloud firestore databases clone --source-database --snapshot-time` (`restore` は Backup 専用、PITR 用ではない) | 数分〜数十分 (データ量依存) |

**理由**:
- ADR-0002 §3 で「Firestore データ rollback は Phase 4 で PITR と一体再設計」と予告した宿題への回答
- PITR は最大 7 日間の任意時点に restore 可能 (Firestore default)、データ汚染インシデントの恒久対応として有効
- ADR-0002 本体への反映は **段階 2 PITR 実機有効化後 or 別 PR** で行い、本 PR では prod-pitr.md に拡張案として記載 (Codex H 指摘 #3 反映、ADR-0002 をいきなり改変しない)

### 2. Cloud Logging monitoring + alerting policy + email 通知を最小案として採用

**規範**: 一般公開前に Cloud Logging dashboard + alerting policy を構築し、**email を最小通知 channel** として採用する。Slack / SMS は future work。

| 監視項目 | alerting 閾値 (initial draft) | 通知 channel |
|---|---|---|
| `/api/*` 5xx rate | 5 分平均 > 5% | email |
| auth fail rate (`verifyIdToken` 401) | 5 分平均 > 50% | email (公開直後の identity 設定漏れ検知) |
| Vertex AI 429/503/504 rate | 5 分平均 > 10% | email (quota 超過検知) |
| Cloud Run instance count | `max-instances` (=2) 到達 5 分継続 | email (突発的 traffic 警告) |
| Firestore ERROR レベル log | 直近 5 分に 1 件以上 | email |

**理由**:
- owner 1 名運用でも「気付く仕組み」は必要 (現状 = 本田様が UI 異常を見るしかない)
- email は構築コストが最も低く、Slack / SMS への拡張は通知 channel の追加実装で対応可能
- 閾値は initial draft、Phase 5 real traffic 取得後に再校正

### 3. SLO を initial draft として採用し、Phase 5 real traffic で再校正

**規範**: SLO 指標を **可用性 / エラー率 / AI 応答失敗率** の 3 軸で initial draft として起草、Phase 5 公開後の real traffic データに基づき再校正する。

| 指標 | initial draft target | 測定窓 | 出典 |
|---|---|---|---|
| 可用性 (uptime) | **99.5% monthly** (= 約 3.65 時間 downtime/月) | 月次 | Cloud Run uptime check |
| 5xx エラー率 | **< 1%** | 24 時間 rolling | `/api/*` request log |
| AI 応答失敗率 (Vertex AI 429/503/504) | **< 5%** | 24 時間 rolling | Cloud Logging |

**incident response (initial draft)**:

| 重要度 | 状況 | 対応 |
|---|---|---|
| P0 | 公開即遮断 trigger (情報漏洩 / 認証バイパス / 課金暴走) | 即時 段階 1 rollback |
| P1 | SLO 閾値違反継続 (5xx > 5% が 30 分以上等) | 1 時間以内に原因調査 + 段階 2 rollback 判断 |
| P2 | 単発エラー / 短時間異常 | 24 時間以内に分析 → fix PR |

通知 channel (initial draft): P0 / P1 = email、P2 = log のみ (notification なし)。

**理由**:
- 99.5% は SaaS 業界一般的な initial target、real traffic 後に上下調整
- 5xx / Vertex AI 429-504 / 401 fail rate は ADR-0001 §Consequences の課金リスク + Phase 2 で実発覚した bug 2 件と整合
- P0 / P1 / P2 の 3 段階は incident response の認知負荷を最小化

## Consequences

### 良い影響

- ADR-0002 で残した「Firestore データ rollback」の宿題が Phase 4 で解決路線に乗る (段階 2 で実機有効化、ADR-0002 本体反映は段階 2 後)
- 一般公開前に「異常検知の仕組み」が email 単一 channel で最低限実装される
- SLO 数値は initial draft として明示、real traffic 後に再校正する前提が共有される
- ADR-0002 を supersede せず補強する構造により、deploy 判断 / tag / rollback / データ同期の規範は Phase 4 でも継承される

### 受け入れる制約

- PITR retention は default 7 日 (一般公開後に retention 延長が必要なら別 ADR / 別 PR)
- 通知 channel が email のみ (公開直後の重大インシデントで本田様の email チェック遅延に依存)
- SLO 数値が real traffic 前は推測値 (99.5% / 1% / 5% はすべて推定、Phase 5 で再校正)
- AI 単独での PITR 有効化 / Logging 構築 / SLO 採用は禁止 (番号単位明示認可必須)

### Phase 5 / 一般公開後に再評価する項目 (本 ADR では扱わない)

| 項目 | 再評価時の論点 |
|---|---|
| Slack / SMS 通知 | email だけでは検知遅延が大きい場面 (深夜帯のインシデント等) で追加検討 |
| SLO 数値の本採用 | Phase 5 公開後 1-3 ヶ月の real traffic で再校正 |
| PITR retention 延長 | 7 日で足りない法務・コンプライアンス要件があれば再評価 |
| incident response の自動化 | P0 trigger の自動 rollback (`--no-allow-unauthenticated` 自動発火) など |
| 複数オーナー / 当番制 incident response | 一般公開後にチーム化したときに再設計 |

これら未決項目は [phase4-tasks.md §Phase 5 GO チェック](../spec/prod-migration/phase4-tasks.md#phase-5-go-チェック) で追跡する (本 ADR からは参照のみ、一次定義は phase4-tasks.md)。

## 参考

- [phase4-tasks.md](../spec/prod-migration/phase4-tasks.md) (本 ADR と対の Phase 4 タスク表)
- [runbook prod-pitr.md](../runbook/prod-pitr.md) (PITR 有効化 + 復旧手順 + ADR-0002 rollback 4 段階拡張案)
- [runbook prod-monitoring.md](../runbook/prod-monitoring.md) (Cloud Logging dashboard + alerting policy + email 通知)
- [runbook prod-slo.md](../runbook/prod-slo.md) (SLO initial draft + incident response)
- [ADR-0002](./0002-dev-prod-deploy-flow.md) (dev → prod 運用フロー、本 ADR でも authoritative)
- [ADR-0001](./0001-local-first-architecture.md) §Consequences (緊急対応 + max-instances=2 + 法務確認 MUST、本 ADR でも継承)
- `.claude/memory/feedback_env_var_naming_drift.md` (Phase 2 教訓、alerting 項目の選定根拠)
- `.claude/memory/feedback_firebase_auth_setup_gotcha.md` (Phase 1 補完事項、auth fail rate alerting の選定根拠)
