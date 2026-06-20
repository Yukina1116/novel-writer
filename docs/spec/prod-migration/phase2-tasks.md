# Phase 2: CI/CD 二環境化 + 初回 prod deploy タスク表

- Status: 🚧 進行中 (2026-06-20)
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
| **Phase 2** (本ドキュメント) | CI/CD 二環境化 + 初回 prod デプロイ | 🚧 進行中 |
| Phase 3 | dev → prod 運用フロー確立 (workflow_dispatch 駆動) | ⏳ |
| Phase 4 | 一般公開 (法務確認 + 課金クォータ完了が前提) | ⏳ |

## タスク一覧

### PR-C: workflow + spec + runbook (実 deploy 前に merge)

| # | タスク | 状態 | 担当 | AC |
|---|--------|------|------|----|
| T1 | `.github/workflows/deploy-prod.yml` 新規作成 (workflow_dispatch only, prod WIF, PROD_VITE_FIREBASE_*, Cloud Run 設定 dev 同等) | ✅ | AI | AC-P2-1 / AC-P2-2 / AC-P2-3 |
| T2 | `docs/spec/prod-migration/phase2-tasks.md` (本ドキュメント) | ✅ | AI | AC-P2-9 |
| T3 | `docs/runbook/prod-phase2-deploy.md` 新規 + `prod-infrastructure-setup.md` に link 追記 | ✅ | AI | AC-P2-8 |
| PR-C | lint + test + PR 作成 → 本田様承認 → merge | ⏳ | AI → 本田様 | - |

### 手動 deploy + 検証 (PR-C merge 後)

| # | タスク | 状態 | 担当 | AC |
|---|--------|------|------|----|
| T4 | GitHub Actions UI から workflow_dispatch 起動 (branch: main) | ⏳ | AI 提案 → 本田様承認 → AI 実行 | AC-P2-4 |
| T5 | deploy 結果記録 (Cloud Run revision name, URL を runbook 証跡セクションに) | ⏳ | AI | AC-P2-4 |
| T6 | AC-13 検証: `curl -i https://<url>/api/users/init` → 401 確認 | ⏳ | AI | AC-P2-5 |
| T7 | AC-14 検証: Playwright MCP で `https://<url>/` 到達 + ログイン画面確認 | ⏳ | AI | AC-P2-6 |
| T8 | Vertex AI smoke test: 本田様 login → `/api/ai/utility/names` 成功確認 → `/api/ai/novel/generate` 短プロンプトで成功確認 | ⏳ | 本田様 (login) + AI (確認) | AC-P2-7 |

### PR-D: 証跡 + 完了

| # | タスク | 状態 | 担当 | AC |
|---|--------|------|------|----|
| T9 | runbook に T4-T8 実行証跡追記 (revision name / URL / curl レスポンス / smoke test 結果) | ⏳ | AI | - |
| T10 | 本ドキュメントの全チェックボックス `[x]` 更新 | ⏳ | AI | AC-P2-9 |
| T11 | handoff `docs/handoff/2026-06-20c-*.md` 作成 | ⏳ | AI | - |
| PR-D | lint (doc 限定) + PR 作成 → 本田様承認 → merge | ⏳ | AI → 本田様 | - |

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
| AC-P2-9 | 本ドキュメントの全チェックボックス `[x]` (残 `⏳` / `[ ]` 0 件) | `grep -c '^- \[ \]' docs/spec/prod-migration/phase2-tasks.md` = 0 かつ `grep -c '⏳' docs/spec/prod-migration/phase2-tasks.md` = 0 |

## Phase 3 への引き継ぎ事項

### Phase 3 で文書化する運用フロー

- dev → prod 手動デプロイの判断基準 (どの bug fix を本番に上げるか)
- prod tag 戦略 (semver / 日付タグ)
- rollback 判断基準 (どの状態で rollback すべきか)
- prod ↔ dev データ同期方針 (基本: 同期しない、本田様の prod アカウントは別)

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
