# Phase 3: dev → prod 運用フロー確立 タスク表

- Status: 🚧 **進行中** (2026-06-20 着手)
- Owner: yasushi-honda
- Related: [docs/runbook/prod-deploy-flow.md](../../runbook/prod-deploy-flow.md) (運用フロー本体)
- Related ADR: [ADR-0002](../../adr/0002-dev-prod-deploy-flow.md) (運用判断基準の規範)
- Related: [phase2-tasks.md](./phase2-tasks.md) §Phase 3 への引き継ぎ事項
- Related ADR: [ADR-0001](../../adr/0001-local-first-architecture.md) §Consequences (緊急対応 + max-instances=2 + 法務確認 MUST)

> **本書の位置付け**: 本ドキュメント・関連 ADR-0002・関連 runbook は AI (Claude Code) が起草した **運用判断の草案** である。最終的な運用判断 (deploy 可否、rollback 実施、prod データ扱い、Phase 4 着手) は **decision-maker (owner = 本田様)** に委ねる。AI は executor として手順実行と起草を担当する。

## 背景

Phase 2 (PR #195 / #197 / #199、2026-06-20) で `deploy-prod.yml` (`workflow_dispatch` only) と初回 prod デプロイ + Vertex AI smoke test が完了。prod 環境は本田様自身の dev test 用として稼働中 (revision `novel-writer-00002-jv2`、一般公開は未)。

Phase 3 では、Phase 2 で発覚した bug 2 件 (Firebase Auth 設定漏れ / env_var_drift) の教訓を反映しつつ、**「dev で安定確認した変更を、いつ・どう prod に上げ、問題発生時にどう戻すか」** の運用フローを ADR + runbook として文書化する。

コード変更は伴わない。文書のみの PR。

## Phase 分割 (再掲)

| Phase | スコープ | 状態 |
|---|---|---|
| Phase 1 | prod インフラ整備 (デプロイなし) | ✅ 完了 (PR #192/#193/#194) |
| Phase 2 | CI/CD 二環境化 + 初回 prod デプロイ | ✅ 完了 (PR #195/#197/#199) |
| **Phase 3** (本ドキュメント) | dev → prod 運用フロー確立 (workflow_dispatch 駆動) | 🚧 進行中 |
| Phase 4 | 一般公開 (法務確認 + 課金クォータ完了が前提) | ⏳ |

## Codex セカンドオピニオン反映済の修正点 (Phase 3 計画段階)

| 修正 | 内容 | 重要度 |
|---|---|---|
| 修正 1 | **草案・最終判断は decision-maker** を ADR/runbook 冒頭に明記 | M |
| 修正 2 | deploy 判断チェックリストに **env_var_drift 再発防止チェック** を組み込む (Phase 2 で発覚した bug の教訓) | M |
| 修正 3 | Tag 戦略を semver より **`prod-YYYYMMDD-HHMM-<shortsha>` 形式 (日付+short SHA) を primary** にする。semver は future work | M |
| 修正 4 | Rollback 段階を **3 段階 (公開遮断 → revision 切替 → service delete)** に縮約。Firestore データ rollback は **Phase 4 で PITR と一体再設計** と明記 (Phase 3 では恒久案を起草しない) | **H** |
| 修正 5 | データ同期方針: **prod → dev 同期 (anonymize copy 含む) 原則禁止**、bug 再現は synthetic data / 手動最小再現 | M |
| 修正 6 | phase3-tasks.md 末尾に **「Phase 4 GO チェック」独立 section** を追加。Phase 3 完了 ≠ Phase 4 GO を明文化 | **H** |
| 修正 7 | NG リストに secret rotation / revision 命名規約 / SLO / 監視 dashboard を future work として追加 | L |

## タスク一覧

### PR-A: ADR + runbook + spec (文書のみ、コード変更なし)

| # | タスク | 状態 | 担当 | AC |
|---|--------|------|------|----|
| T1 | `docs/spec/prod-migration/phase3-tasks.md` (本ドキュメント) 作成 | 🚧 | AI | AC-P3-1 |
| T2 | `docs/adr/0002-dev-prod-deploy-flow.md` 新規作成 (Context / Decision / Consequences + 4 判断基準) | ⏳ | AI | AC-P3-2 |
| T3 | `docs/runbook/prod-deploy-flow.md` 新規作成 (deploy 判断 / tag 付与 / rollback / データ同期 NG の 4 section) | ⏳ | AI | AC-P3-3 |
| T4 | `phase2-tasks.md` Phase 分割表で Phase 3 を ✅ に更新 + `prod-phase2-deploy.md` §Phase 3 引き継ぎ事項 を「Phase 3 完了済、ADR-0002 / runbook 参照」に書き換え | ⏳ | AI | AC-P3-4 |
| T5 | lint + test 確認 → PR 作成 → 本田様番号単位認可 → merge | ⏳ | AI → 本田様 | AC-P3-7 |

## Acceptance Criteria

| # | 基準 | 検証方法 |
|---|------|---------|
| AC-P3-1 | `phase3-tasks.md` (本ドキュメント) に T1〜T5 タスク表 + AC ≥ 8 項目 + 「Phase 4 GO チェック」section が存在 | `grep -c '^| AC-P3-' docs/spec/prod-migration/phase3-tasks.md` ≥ 8 かつ `grep -c '^## Phase 4 GO チェック' docs/spec/prod-migration/phase3-tasks.md` = 1 |
| AC-P3-2 | `ADR-0002` に Context / Decision / Consequences の 3 section + 4 判断基準 (deploy 判断 / tag / rollback / データ同期) すべて記載 + 冒頭に「本書は草案、最終判断は decision-maker」明記 | `grep -cE '^## (Context\|Decision\|Consequences)' docs/adr/0002-dev-prod-deploy-flow.md` = 3 かつ `grep -c '草案\|decision-maker' docs/adr/0002-dev-prod-deploy-flow.md` ≥ 1 |
| AC-P3-3 | runbook に「deploy 判断チェックリスト」「tag 付与コマンド例」「rollback 3 段階手順」「データ同期 NG ポリシー」の 4 section + deploy チェックリストに env_var_drift 再発防止項目 + 冒頭に「本書は草案、最終判断は decision-maker」明記 | `grep -cE '^## (deploy 判断チェックリスト\|tag 付与\|rollback\|データ同期)' docs/runbook/prod-deploy-flow.md` = 4 かつ `grep -c 'GCLOUD_PROJECT\|env_var_drift' docs/runbook/prod-deploy-flow.md` ≥ 1 |
| AC-P3-4 | `phase2-tasks.md` の Phase 分割表で Phase 3 が ✅ 完了に更新 + `prod-phase2-deploy.md` §Phase 3 引き継ぎ事項 が ADR-0002 / runbook 参照に書き換えられている | `awk '/^## Phase 分割/,/^## /' docs/spec/prod-migration/phase2-tasks.md \| grep -c '✅'` ≥ 3 (Phase 1/2/3) かつ `grep -c '0002-dev-prod-deploy-flow\|prod-deploy-flow' docs/runbook/prod-phase2-deploy.md` ≥ 1 |
| AC-P3-5 | 相互 link: ADR-0002 / runbook / phase3-tasks.md が互いに参照している | `grep -l '0002-dev-prod-deploy-flow' docs/runbook/prod-deploy-flow.md docs/spec/prod-migration/phase3-tasks.md` = 2 行 (両方ヒット) かつ `grep -l 'prod-deploy-flow' docs/adr/0002-dev-prod-deploy-flow.md docs/spec/prod-migration/phase3-tasks.md` = 2 行 |
| AC-P3-6 | rollback section に「公開即遮断 → Cloud Run revision 切替 → service delete」の 3 段階順序が記載され、Firestore データ rollback は「Phase 4 で PITR と一体再設計」として明示的に Phase 3 スコープ外に置かれている | `grep -c '公開即遮断\|no-allow-unauthenticated' docs/runbook/prod-deploy-flow.md` ≥ 1 かつ `grep -c 'update-traffic\|to-revisions' docs/runbook/prod-deploy-flow.md` ≥ 1 かつ `grep -c 'PITR\|Phase 4' docs/runbook/prod-deploy-flow.md` ≥ 1 |
| AC-P3-7 | `npm run lint` PASS (本 PR は doc のみだが、規律として実行) | tsc エラー 0 件 |
| AC-P3-8 | `phase3-tasks.md` 末尾に **「Phase 4 GO チェック」** 独立 section が存在し、Phase 4 着手前に充足が必要な未完了項目 (法務確認 / 課金クォータ / Firestore PITR / Cloud Logging dashboard / SLO・incident policy) をチェックリスト形式で列挙、Phase 3 完了 ≠ Phase 4 GO を明文化 | `grep -c '^## Phase 4 GO チェック' docs/spec/prod-migration/phase3-tasks.md` = 1 かつ `awk '/^## Phase 4 GO チェック/,/^## /' docs/spec/prod-migration/phase3-tasks.md \| grep -cE '法務\|課金\|PITR\|Logging\|SLO'` ≥ 4 |

## Phase 3 スコープ外 (NG リスト、本 PR に含めない)

| カテゴリ | 項目 | 理由 |
|---|---|---|
| Phase 4 前提条件 | Firestore PITR 設定 | Phase 4 公開前 trigger、別軸 |
| Phase 4 前提条件 | Cloud Logging 監視ダッシュボード | Phase 4 公開前 trigger、別軸 |
| Phase 4 前提条件 | SLO / incident policy 策定 | 一般公開時の運用設計、Phase 4 で再設計 |
| Phase 4 前提条件 | 監視 dashboard / 通知 channel 設計 | 同上 |
| decision-maker 領分 | 法務確認 (顧問弁護士による規約 3 文書承認) | 進捗追跡は decision-maker 領分 (4 原則 §1) |
| decision-maker 領分 | 課金クォータ Vertex AI 申請 | 申請可否・内容は decision-maker 判断 |
| データ rollback | Firestore データ復旧手順 (PITR ベース) | Phase 4 で PITR 設定と一体再設計、Phase 3 では「Phase 4 で再設計」予告のみ |
| コード | コードベース修正 | Phase 2 で env_var_drift fix 済、Phase 3 は doc only |
| 課金フロー | M5 (Stripe Tier 2 課金) | 別マイルストーン |
| UI 変更 | 一般公開時の規約同意フロー UI | Phase 4 着手後の別 PR |
| Future work (Phase 4 以降) | secret rotation 方針 | 一般公開後の運用設計 |
| Future work (Phase 4 以降) | Cloud Run revision 命名規約の細部 | 本 Phase の tag 戦略でカバー、細部は future work |
| Future work (Phase 4 以降) | semver の本格運用 | 一般公開後に併用検討 |

## Phase 4 GO チェック

> **重要**: Phase 3 完了は **Phase 4 着手の GO ではない**。Phase 3 で文書化された運用フローは「prod が稼働している間 (現在 = 本田様 dev test 用)」「将来一般公開後」のどちらでも適用される共通フローである。一般公開 (Phase 4) には下記すべてが充足され、かつ **decision-maker (本田様) からの明示 GO** が必要である。

### 一般公開前に充足すべき項目 (チェックリスト)

| # | 項目 | 状態 | 担当 | 備考 |
|---|------|------|------|------|
| GO-1 | **法務確認** (顧問弁護士による利用規約・プライバシーポリシー・特商法表記 3 文書の承認) | ⏳ | 本田様 | 現状 `public/legal/*.md` に `LEGAL_REVIEW_REQUIRED` 警告残置中 |
| GO-2 | **課金クォータ** (Vertex AI / Cloud Run / Firestore が想定利用範囲をカバー) | ⏳ | 本田様 | Phase 2 smoke test 結果 (68 文字 1 回呼出) では default quota で十分、本格利用前に再評価 |
| GO-3 | **Firestore PITR 設定** | ⏳ | AI (本田様明示指示後実行) | `gcloud firestore databases update --enable-pitr`、データ rollback の前提 |
| GO-4 | **Cloud Logging 監視ダッシュボード** | ⏳ | AI (本田様明示指示後構築) | ERROR レベル log の通知 + auth fail rate / 5xx rate / Vertex AI quota 利用率 |
| GO-5 | **SLO / incident policy 策定** | ⏳ | 本田様 + AI 起草 | 一般公開時の可用性目標 (例: 99.5% monthly)、incident 時の対応窓口 |
| GO-6 | **本田様からの公開 GO** | ⏳ | 本田様 | 上記 GO-1〜GO-5 充足を確認の上、明示指示 |

### Phase 4 着手の trigger 条件

- 上記 GO-1〜GO-6 **すべて** が ✅ になる
- かつ **本田様から「Phase 4 着手 GO」の明示指示**
- AI は自発的に Phase 4 着手を提案しない (4 原則 §1 越権防止)

### Phase 3 完了 ≠ Phase 4 GO

Phase 3 完了 (本 PR merge) の意味:
- ✅ dev → prod の運用フローが文書化された
- ✅ 将来のセッションで「いつ deploy するか / どう rollback するか」を ADR + runbook で参照可能になった

Phase 3 完了の意味**ではない**もの:
- ❌ 一般公開する準備が整った
- ❌ Phase 4 を自動的に開始してよい
- ❌ 法務 / 課金 / PITR / 監視の判断を AI が代行してよい

## 参考

- ADR-0001 §Consequences §4 注書き (緊急対応: `max-instances=2` + 月 ¥1,000 予算アラート、Phase 3 でも適用継続)
- ADR-0001 §M3 振り返り (Cloud Run public + `verifyIdToken` middleware、Phase 3 の deploy 判断でも前提)
- Phase 2 で発覚した bug 2 件 (Firebase Auth 設定漏れ / env_var_drift) の教訓 → deploy 判断チェックリストに反映
- 既存 dev workflow `.github/workflows/deploy.yml` (main push 自動) / prod workflow `.github/workflows/deploy-prod.yml` (`workflow_dispatch` only)
- `.claude/memory/feedback_env_var_naming_drift.md` (Phase 2 で起こした bug の教訓 memory)
- `.claude/memory/feedback_firebase_auth_setup_gotcha.md` (Phase 1 補完事項の教訓 memory)
