# Phase 2: CI/CD 二環境化 + 初回 prod deploy タスク表

- Status: ✅ **完了** (2026-06-20)
- Owner: yasushi-honda
- Related: [docs/runbook/prod-phase2-deploy.md](../../runbook/prod-phase2-deploy.md) (実行手順 + 証跡)
- Related: [docs/spec/prod-migration/phase1-tasks.md](./phase1-tasks.md) (Phase 1 引き継ぎ事項)
- Related ADR: [ADR-0001](../../adr/0001-local-first-architecture.md) §Consequences (緊急対応 + max-instances=2 + 法務確認 MUST) / §M3 振り返り (Cloud Run public + verifyIdToken)

## 背景

Phase 1 (インフラ整備、PR #192 / #193 / #194) 完了を受けて、prod 環境への初回デプロイと AC-13/AC-14 実機検証、Vertex AI smoke test を実施する。

dev workflow (`.github/workflows/deploy.yml`、main push 自動 deploy) には一切影響を与えず、新規 `deploy-prod.yml` を `workflow_dispatch` only で追加する。

## Phase 分割 (再掲)

| Phase | スコープ | 状態 |
|---|---|---|
| Phase 1 | prod インフラ整備 (デプロイなし) | ✅ 完了 (PR #192/#193/#194) |
| **Phase 2** (本ドキュメント) | CI/CD 二環境化 + 初回 prod デプロイ | ✅ 完了 (PR #195/#197/#199) |
| Phase 3 | dev → prod 運用フロー確立 (workflow_dispatch 駆動) | ✅ 完了 ([phase3-tasks.md](./phase3-tasks.md) / [ADR-0002](../../adr/0002-dev-prod-deploy-flow.md) / [runbook prod-deploy-flow.md](../../runbook/prod-deploy-flow.md)) |
| Phase 4 | 一般公開 (法務確認 + 課金クォータ完了が前提) | ⏳ (Phase 4 GO チェックは [phase3-tasks.md §Phase 4 GO チェック](./phase3-tasks.md#phase-4-go-チェック) 参照) |

## タスク一覧

### PR-C: workflow + spec + runbook (実 deploy 前に merge)

| # | タスク | 状態 | 担当 | AC |
|---|--------|------|------|----|
| T1 | `.github/workflows/deploy-prod.yml` 新規作成 (workflow_dispatch only, prod WIF, PROD_VITE_FIREBASE_*, Cloud Run 設定 dev 同等) | ✅ | AI | AC-P2-1 / AC-P2-2 / AC-P2-3 |
| T2 | `docs/spec/prod-migration/phase2-tasks.md` (本ドキュメント) | ✅ | AI | AC-P2-9 |
| T3 | `docs/runbook/prod-phase2-deploy.md` 新規 + `prod-infrastructure-setup.md` に link 追記 | ✅ | AI | AC-P2-8 |
| PR-C | lint + test + PR 作成 → 本田様番号単位認可 → merge | ✅ (PR #195 merged ef5a40a + PR-C-rev2 で 3 並列レビュー指摘 7 件反映) | AI → 本田様 | - |

### 手動 deploy + 検証 (PR-C merge 後)

| # | タスク | 状態 | 担当 | AC |
|---|--------|------|------|----|
| T4 | GitHub Actions UI から workflow_dispatch 起動 (branch: main) | ✅ | AI 実行 (本田様番号単位認可下) | AC-P2-4 |
| T5 | deploy 結果記録 (Cloud Run revision name, URL を runbook 証跡セクションに) | ✅ | AI (revision 00001-kn6 → 00002-jv2) | AC-P2-4 |
| T6 | AC-13 検証: `curl -i https://<url>/api/users/init` → 401 確認 | ✅ | AI | AC-P2-5 |
| T7 | AC-14 検証: Playwright MCP で `https://<url>/` 到達 + ログイン画面確認 | ✅ | AI | AC-P2-6 |
| T8 | Vertex AI smoke test: 本田様 login → AI gen 成功 (env_var_drift hotfix 後) | ✅ | 本田様 login + AI Playwright E2E | AC-P2-7 |

### PR-D: 証跡 + 完了

| # | タスク | 状態 | 担当 | AC |
|---|--------|------|------|----|
| T9 | runbook に T4-T8 実行証跡追記 + Phase 2 で発覚した bug + hotfix 記録 | ✅ | AI (`docs/runbook/prod-phase2-deploy.md` 内) | - |
| T10 | 本ドキュメントの全チェックボックス `[x]` 更新 | ✅ | AI | AC-P2-9 |
| T11 | handoff `docs/handoff/2026-06-20c-phase2-complete.md` 作成 | ✅ | AI | - |
| PR-D | lint + test (恒久 fix の server コード変更含む) + PR 作成 → 本田様番号単位認可 → merge | ✅ | AI → 本田様 | - |

## Acceptance Criteria

| # | 基準 | 検証方法 |
|---|------|---------|
| AC-P2-1 | `deploy-prod.yml` が `on.workflow_dispatch` のみで起動 (push trigger なし) | yaml 静的検査 (`grep -E '^on:|workflow_dispatch:|push:' .github/workflows/deploy-prod.yml`) |
| AC-P2-2 | build-arg は `PROD_VITE_FIREBASE_*` 6 件を参照 | yaml 静的検査 (`grep -c 'secrets.PROD_VITE_FIREBASE_' .github/workflows/deploy-prod.yml` → 6) |
| AC-P2-3 | WIF Provider が `projects/1026420855688/...` (prod project number) | yaml 静的検査 (`grep workload_identity_provider .github/workflows/deploy-prod.yml`) |
| AC-P2-4 | 初回 deploy 成功、Cloud Run URL `https://novel-writer-*.run.app` 取得 | `gcloud run services describe novel-writer --region=asia-northeast1 --project=novel-writer-prod --format='value(status.url)'` |
| AC-P2-5 | AC-13: 未認証 `curl https://<url>/api/users/init` → HTTP 401 | curl `-i` |
| AC-P2-6 | AC-14: 未認証で `https://<url>/` 到達、HTML 200 (静的 UI レンダリング) | curl + Playwright MCP |
| AC-P2-7 | Vertex AI smoke test 成功: `/api/ai/utility/names` 200 + 名前候補返却 / `/api/ai/novel/generate` 200 + 短プロンプト続き生成 / Cloud Logging に ERROR レベル 0 件 (異常系は 429/503/504 のいずれかに分類済) | 本田様 login + Playwright + `gcloud logging read` |
| AC-P2-8 | rollback 手順が runbook に明文化 (公開即遮断 `--no-allow-unauthenticated` + revision 切替 + service delete + Firestore データ削除 順序) | `grep -q 'update-traffic' docs/runbook/prod-phase2-deploy.md && grep -q 'to-revisions' docs/runbook/prod-phase2-deploy.md && grep -q 'no-allow-unauthenticated' docs/runbook/prod-phase2-deploy.md` |
| AC-P2-9 | Phase 2 タスク表 (T1-T11 + PR-C/PR-D) すべて ✅ (Phase 3/4 / 法務 / 課金 / Firestore PITR の ⏳ は別軸進行のため対象外) | `awk '/^### PR-C/,/^## Acceptance Criteria/' docs/spec/prod-migration/phase2-tasks.md \| grep -c '⏳'` = 0 |

## Phase 3 への引き継ぎ事項 (✅ Phase 3 で完了済)

### Phase 3 で文書化された運用フロー (参照先)

| 旧 引き継ぎ項目 | 完了先 |
|---|---|
| dev → prod 手動デプロイの判断基準 | [ADR-0002 §1](../../adr/0002-dev-prod-deploy-flow.md) / [runbook §deploy 判断チェックリスト](../../runbook/prod-deploy-flow.md#deploy-判断チェックリスト) |
| prod tag 戦略 (semver / 日付タグ) | [ADR-0002 §2](../../adr/0002-dev-prod-deploy-flow.md) / [runbook §tag 付与コマンド例](../../runbook/prod-deploy-flow.md#tag-付与コマンド例) (日付+short SHA を採用) |
| rollback 判断基準 (どの状態で rollback すべきか) | [ADR-0002 §3](../../adr/0002-dev-prod-deploy-flow.md) / [runbook §rollback 判断と 3 段階手順](../../runbook/prod-deploy-flow.md#rollback-判断と-3-段階手順) (Firestore データ rollback は Phase 4 で再設計) |
| prod ↔ dev データ同期方針 | [ADR-0002 §4](../../adr/0002-dev-prod-deploy-flow.md) / [runbook §データ同期 NG ポリシー](../../runbook/prod-deploy-flow.md#データ同期-ng-ポリシー) (anonymize copy も禁止) |

### Phase 4 (一般公開) への前提条件 (未変化)

| 前提 | 状態 |
|---|---|
| 法務確認 (顧問弁護士による規約 3 文書承認) | ⏳ 別軸進行 |
| 課金クォータ (Vertex AI 通常利用範囲で必要なら申請) | ⏳ Phase 2 smoke test 結果次第 |
| Phase 2 (初回 deploy + smoke test) | 🚧 進行中 |
| Phase 3 (dev → prod 運用フロー文書化) | ⏳ |
| Firestore PITR 設定 | ⏳ Phase 4 公開前 trigger |

## 参考

- ADR-0001 §Consequences §4 注書き (緊急対応: `max-instances=2` + 月 ¥1,000 予算アラート、Phase 2 deploy にも適用)
- ADR-0001 §M3 振り返り (Cloud Run public + `verifyIdToken` middleware、AC-13 で検証)
- ADR-0001 §Consequences (Stripe 課金 / 法務 stub 注書き、Phase 4 一般公開前に法務確認 MUST)
- Phase 1 phase1-tasks.md §73-102 (Phase 2 で参照する prod 値、すべて Phase 1 で確定済)
- 既存 dev workflow `.github/workflows/deploy.yml` (構成は dev と同等、PROD_VITE_FIREBASE_* / prod SA / prod WIF のみ差し替え)
