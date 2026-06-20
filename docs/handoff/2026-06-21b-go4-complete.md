# Handoff: Phase 4 段階 2 GO-4 完全クローズ (5 連続 fix の振り返り含む)

- Session Date: 2026-06-21 (前 handoff #209 セッション継続)
- Owner: yasushi-honda
- Status: ✅ クリーン、executor 領分の作業ゼロ
- Previous: [2026-06-21-phase3-phase4-go3-go4alpha.md](./2026-06-21-phase3-phase4-go3-go4alpha.md)

## セッション要旨

前セッション handoff (#209) の条件待ち #3「PR #208 merge 後 + 本田様『monitoring workflow を実行してよい』+ email address 確定」が本セッションで充足 (PR #208 既 merge / email = hy.unimail.11@gmail.com 確定 / 本田様『Phase 4 段階 2 GO-4 実機構築を進める』包括認可)。prod IAM (`roles/monitoring.editor`) 付与 + workflow run を 6 回試行し、**5 連続 fix PR (#210/#211/#212/#213/#214) を経て GO-4 実機構築を完全クローズ**、証跡 PR β (#215) で AC-P4-9 を完了化した。

GO-3 の 4 連続 fix (#203-#207) に続く GO-4 の 5 連続 fix で **計 9 連続 fix が同根 (公式 spec の単一ソース確認 + cross-check 不足)**。本 handoff で memory 化候補を明示し、次セッション以降の規律強化につなげる。

## 本セッション merged PR (6 件)

| PR | 内容 | 種別 |
|----|------|------|
| #210 | fix(prod-monitoring): replace IAM precheck with Monitoring API access probe | fix |
| #211 | fix(prod-monitoring): use `gcloud beta monitoring channels` (GA に未提供) | fix |
| #212 | fix(prod-monitoring): A4 comparison COMPARISON_GTE → COMPARISON_GE | fix |
| #213 | fix(prod-monitoring): A4 comparison COMPARISON_GE→GT, thresholdValue 2→1 | fix |
| #214 | fix(prod-monitoring): add scorecard threshold direction (W5/W6) | fix |
| #215 | docs(prod-monitoring): GO-4 実機構築証跡 + AC-P4-9 完了化 (PR β) | docs |

## 本セッション実機操作 (証跡)

| 操作 | 環境 | 経路 | 結果 |
|----|------|------|------|
| prod IAM 付与 (`roles/monitoring.editor`) | prod | gcloud (AI 実行、包括認可) | ✅ github-deploy SA に付与済 |
| monitoring workflow run #27876520913 | prod | workflow_dispatch | ❌ Pre-check IAM catch-22 で fail → #210 fix |
| monitoring workflow run #27876666359 | prod | workflow_dispatch | ❌ `gcloud monitoring channels` GA 未提供で fail → #211 fix |
| monitoring workflow run #27876793187 | prod | workflow_dispatch | ❌ A4 COMPARISON_GTE invalid enum で fail → #212 fix |
| monitoring workflow run #27885477491 | prod | workflow_dispatch | ❌ A4 COMPARISON_GE AlertPolicy 不支持で fail → #213 fix |
| monitoring workflow run #27885859665 | prod | workflow_dispatch | ❌ W5/W6 scorecard direction 必須で fail → #214 fix |
| **monitoring workflow run #27887069695** | prod | workflow_dispatch | ✅ **全 step success** (channel + A1-A5 + dashboard + verify) |

### 構築物 (prod)

| Resource | 状態 |
|----------|------|
| Notification channel | `prod-email-channel` (email: hy.unimail.11@gmail.com) |
| Alerting policy A1 | `prod-5xx-rate-high` ENABLED (COMPARISON_GT 0.5/sec, 300s) |
| Alerting policy A2 | `prod-auth-fail-rate-high` ENABLED (COMPARISON_GT 1.0/sec, 300s) |
| Alerting policy A3 | `prod-vertex-ai-quota-error` ENABLED (COMPARISON_GT 0.3/sec, 300s, regex 429\|503\|504) |
| Alerting policy A4 | `prod-instance-saturation` ENABLED (COMPARISON_GT 1, 300s) |
| Alerting policy A5 | `prod-firestore-error` ENABLED (COMPARISON_GT 0, 300s, severity=ERROR) |
| Dashboard | `novel-writer-prod 監視` (8 widget W1-W8) |

**Dashboard URL**: https://console.cloud.google.com/monitoring/dashboards/builder/5d5790d9-b11a-49f6-9776-c6b6163b1891?project=novel-writer-prod

## Phase 進捗

| Phase | 状態 |
|-------|------|
| Phase 1 (インフラ整備) | ✅ |
| Phase 2 (初回 prod deploy) | ✅ |
| Phase 3 (dev → prod 運用フロー) | ✅ |
| Phase 4 段階 1 (起草) | ✅ |
| Phase 4 段階 2 GO-3 (PITR 有効化) | ✅ |
| **Phase 4 段階 2 GO-4 (Logging dashboard)** | ✅ **本セッション完了** |
| Phase 4 段階 3 (SLO Accepted + 手動 PITR 演習) | ⏳ Phase 5 公開後 1 ヶ月で着手 |
| Phase 5 (公開実行) | ⏳ GO-1〜GO-5 全 ✅ + 本田様 GO 待ち |

## §4.5 グローバル memory scope チェック

本セッションは `~/.claude/memory/` への変更なし。スキップ。

## §4.6 同根再発スキャン (MUST)

### 本セッション内同根候補

本セッション fix PR 5 件 (#210, #211, #212, #213, #214) の共通テーマ: **公式 spec の単一ソース確認 + cross-check 不足**。

| PR | 失敗の root cause | 関連公式 spec |
|----|------------------|--------------|
| #210 | `gcloud projects get-iam-policy` が `resourcemanager.projects.getIamPolicy` 権限を要求 (catch-22) | IAM permission ref |
| #211 | `gcloud monitoring channels` が GA 未提供 (alpha/beta のみ) | gcloud reference |
| #212 | `COMPARISON_GTE` は ComparisonType enum に存在しない (正しくは `COMPARISON_GE`) | ComparisonType enum docs |
| #213 | AlertPolicy MetricThreshold は実装上 `GT/LT` のみサポート (enum 一般定義と別) | Terraform / Python client docs |
| #214 | Scorecard `Threshold.direction` が必須フィールド | Threshold.Direction enum docs |

### 過去 7 日 handoff archive スキャン

`docs/handoff/2026-06-1[4-9]-*.md` + `docs/handoff/2026-06-20*-*.md` + 直前 #209 から `gcloud` / `enum` / `spec` keyword 検索:

| handoff | 同根候補 |
|---------|---------|
| #209 (2026-06-21) | **GO-3 4 連続 fix (#203/#205/#206/#207)** が「gcloud spec の ground truth 確認漏れ」で同根 |
| その他 (#181-#194) | Phase 1/2/3 のインフラ・フロー文書化のため、gcloud spec 系の同根なし |

**GO-3 (4 連続) + GO-4 (5 連続) = 計 9 連続 fix が「公式 spec 確認漏れ」で同根**。これは本セッションだけの認知負荷問題ではなく、構造的な確認手順の欠落を示している。

### 真の root cause 仮説 (3 つ以上)

1. **公式 spec の単一ソース確認バイアス**: AI は公式 docs の最初の 1 ページ (例 `gcloud monitoring policies create --help` の flag のみ) を確認して「OK」と判定しがちだが、YAML body 内の field 値 / enum / 必須性は別 reference に分散している。
2. **「enum 一般定義」と「特定 resource での実装支持範囲」の混同**: ComparisonType enum (#212) と AlertPolicy MetricThreshold 支持範囲 (#213) は別物。Java/Python client の generic enum 定義を見ても AlertPolicy 実装の制限は別途確認が必要。
3. **記憶ベース起草の誘惑**: 深夜帯 + 連続作業の認知負荷で、公式 docs 確認を省略して記憶ベースで YAML を書き、ground truth (実 API error) で初めて誤りが判明する。Phase 4 段階 2 全体で 9 連続 fix が示唆する慢性的な確認不足。
4. **dry-run / sandbox 試行の欠如**: workflow を本番に向けて起草する前に、別 dev project / sandbox で先に 1 回 apply してエラーを潰す手順がない。CI 内 fail で初めて気づくため、本セッションでは 6 回の workflow run + 5 PR の消費になった。

### 次に同根が出る経路 (1 つ以上)

**Phase 4 段階 3 / Phase 5 着手時の新 workflow / runbook 起草段階**で同根再発の可能性が高い。特に:

- Phase 4 段階 3 で SLO 計測の log-based metric 設定 (MQL refactor)
- Phase 5 で本番公開後の Cloud Run blue/green deploy automation
- 上記いずれも gcloud / GCP API spec を新規に触る作業

**事前対策**: 次セッションで本田様に **「公式 spec 確認手順の memory 化」** を提案する (下記 §教訓 memory 化候補)。

## §4.7 対症療法判定 (MUST)

### 基準ヒット状況

| # | 基準 | 該当 |
|---|------|------|
| 1 | 修正が retry/timeout/fallback/エラー文言修正のみで構造調査ログなし | ❌ 各 fix は root cause まで掘り下げ (公式 docs / cross-check / WebSearch ログあり) |
| 2 | 「なぜそれが今起きたか」の外部要因調査ログなし | ❌ 各 fix で公式 docs / WebSearch / Terraform / SDK 等の cross-check 実施 |
| 3 | 同症状の修正 PR が過去 30 日以内に 1 件以上 | ⚠️ 部分該当: GO-3 4 連続 fix (#203-#207、6 月 20 日) が同根 (公式 spec 確認漏れ) |
| 4 | 修正後の動作確認が単体 test/smoke のみで構造的要因の差分検証なし | ❌ 各 fix は実 workflow run (#27876520913〜#27887069695) で実証 |

### 判定

該当する対症療法疑い: **基準 3 のみ部分該当**だが、本セッション内で「元設計再レビュー」を 3 回実施 (#212/#213/#214) し、5 PR 目の dashboard direction まで構造的に潰した。各 fix は **root cause 修正 + 実 workflow run 実証**で対症療法ではない。

**ただし真の root cause** = 「公式 spec の単一ソース確認 + cross-check 不足」は session 規律レベルの問題で、本セッション内では memory 化候補として記録するに留め、次セッションで本田様判断を仰ぐ。

## 教訓 memory 化候補 (次セッションで本田様に提示予定)

§4.6 / §4.7 の振り返りから抽出した、次セッション以降に効きそうな memory 化候補:

### 候補 1: `feedback_gcloud_spec_cross_check.md` (新規)
- gcloud / GCP API 系の設定値は **最低 2 ソース cross-check** (公式 docs / Terraform provider / SDK client reference / Sample policies in JSON)
- 特に「enum 一般定義」と「特定 resource での実装支持範囲」は別物として扱う
- workflow 起草時に `gcloud <component> <resource> --help` だけでなく YAML body 内 field 値の `required:` 表記を必ず確認

### 候補 2: `feedback_workflow_dry_run_sandbox.md` (新規)
- 本番向け workflow を起草する前に、別 dev project / sandbox で 1 回 apply して field 値レベルのエラーを潰す手順
- CI 内 fail で気づく方式は 6 回 workflow run + 5 PR を消費する高コスト経路
- Phase 5 以降の新 workflow 起草時に適用

### 候補 3: 既存 `feedback_consecutive_failure_redesign.md` 拡張案
- 「3 連続失敗 → 元設計再レビュー」を「**特に「元設計再レビュー」は対象範囲を policy / dashboard / workflow / runbook 全ファイルに展開する**」と注釈追加
- 本セッション #212/#213 で policy 側だけ再レビューして dashboard 側を点検漏れ → #214 で発覚した教訓

候補 1-3 はグローバル memory 候補だが、本田様の判断項目 (どれを memory 化するか / プロジェクト固有として novel-writer の `.claude/memory/` に置くか) は次セッションで提示。

## §2.4 / §2.5 次のアクション (3 分割)

### 即着手タスク

**0 件**。executor 領分の作業ゼロ。

理由: 本セッションで Phase 4 段階 2 GO-4 を完全クローズし、残作業は全て本田様判断 trigger 待ち。

### 条件待ち (明示 trigger 付き)

前 handoff #209 の条件待ち 8 件から #3 (GO-4 workflow run) と #4 (GO-4 証跡 PR β) が完了したため、残 6 件 + memory 化候補:

| # | 項目 | A/B/C | trigger | 充足時のタスク |
|---|------|-------|---------|--------------|
| 1 | A1-A5 policy の MQL ratio refactor (絶対 rate → X%) | B 修正 | Phase 5 公開後 1 ヶ月の real traffic 取得 + 本田様「ratio refactor を進める」 | A1 (5% rate) / A2 (50% rate) / A3 (10% rate) の MQL 化、policy YAML 更新 |
| 2 | Phase 4 段階 3 (SLO Accepted 化 + 手動 PITR 演習 + 通知到達確認) | A/B 混在 | Phase 5 公開後 1 ヶ月の real traffic + 本田様「段階 3 を進める」 | runbook prod-slo.md Status 変更、prod-pitr.md 演習履歴追記、prod-monitoring.md 通知到達確認追記 |
| 3 | GO-1 法務確認 status 更新 | A housekeeping | 本田様「顧問弁護士から X 文書 Approved」明示報告 | phase4-tasks.md §GO-1 tracker 更新 |
| 4 | GO-2 課金クォータ判断 | C 起点 | 本田様判断 | phase4-tasks.md §GO-2 申請 draft を本田様が転用 |
| 5 | Phase 5 着手 | C 起点 | GO-1〜GO-5 全 ✅ + 本田様「Phase 5 着手 GO」 | phase5-tasks.md 起草 |
| 6 | 教訓 memory 化 (候補 1-3) | A housekeeping | 本田様「memory 化案を提示して」明示指示 | 候補 1-3 の文面提示 → 本田様判断 (グローバル / プロジェクト固有) → PR 起票 |

### 却下候補 (記録のみ・包括指示の対象外)

| # | 項目 | A/B/C | 着手しない理由 |
|---|------|-------|--------------|
| 1 | dev-monitoring-setup.yml で先行検証 | B 起案 | PR #208 description で「dev workflow は含めない」と明記、本田様判断項目 |
| 2 | dev-pitr-drill.yml の手動 trigger で実機 PITR 演習 | A/B 中間 | 段階 3 で手動 Console 演習に方針変更済 (#207) |
| 3 | A1-A5 placeholder filter refactor (W7/W8 log-based metric) | B 起案 | 段階 2/3 で実機 traffic 観測してから refactor 予定 |
| 4 | promptSafety enhancement Issue 5 件 (#137/147/152/155/156) | C 起点 | 全て enhancement label、本田様明示指示なし、Phase 4 進行中は触れない |
| 5 | Slack/SMS 通知 channel 追加 | C 起点 | Phase 4 NG リスト記載、Phase 5+1 ヶ月後に再評価 (ADR-0003 §Consequences) |

## §7.1 Issue Net 変化

- close 数: 0 件
- 起票数: 0 件
- **Net: 0 件**

理由: 本セッションの fix 5 件は全て in-flight PR (#210-#214) で resolve、別途 Issue 起票が必要な事象 (実害ありの bug / rating ≥7) は発生せず。9 連続 fix は同根 (公式 spec 確認漏れ) で本 handoff §4.6 / §4.7 に集約、Issue 化不要。

## CI / 残留プロセス

- CI: PR #215 / Deploy to Cloud Run / **success** (2m58s, 2026-06-20T23:40:10Z)
- 残留プロセス: ✅ なし

## §8 最終結論

### ✅ **セッション終了可** — Phase 4 段階 2 GO-4 完全クローズ、executor 領分の作業ゼロ

#### 根拠

- OPEN PR ゼロ (本セッション 6 件全 merge 済 + main 同期完了)
- main clean (origin/main と同期、最新 commit `faf61d3`)
- 即着手タスク = 0 件
- 条件待ち = 6 件 (全て本田様判断 trigger、AI 単独着手不可)
- 残留プロセスなし
- §4.5 グローバル memory scope: 本セッション変更なし、スキップ
- §4.6 同根再発スキャン: 本セッション 5 連続 + GO-3 4 連続 = 計 9 連続 fix が「公式 spec 確認漏れ」で同根、memory 化候補 3 件を §教訓 に明示
- §4.7 対症療法判定: 基準 3 のみ部分該当、ただし各 fix は root cause 修正 + 実 workflow run 実証、対症療法ではない
- Issue Net 変化: 0 件 (起票 0 / close 0)

#### 推奨次セッション action

1. `/catchup` で状態確認 → 残作業ゼロを確認
2. 本田様判断項目があれば順次対応 (条件待ち #1〜#6 のいずれか)
3. 本田様「memory 化案を提示して」あれば §教訓 候補 1-3 の文面を起草 → グローバル/プロジェクト固有の配置判断を仰ぐ
4. Phase 4 段階 3 / Phase 5 着手は本田様明示指示後

本セッションは深夜帯 + 6 連続 fix で認知負荷が高い。次セッション開始時に `/catchup` で context 復元してから慎重に進めることを推奨。
