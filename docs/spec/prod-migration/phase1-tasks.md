# Phase 1: novel-writer-prod インフラ整備 タスク表

- Status: ✅ **完了** (2026-06-20)
- Owner: yasushi-honda
- Related: [docs/runbook/prod-infrastructure-setup.md](../../runbook/prod-infrastructure-setup.md) (実行手順 + 証跡)
- Related ADR: [ADR-0001](../../adr/0001-local-first-architecture.md) §M0 / §M3 / §M7

## 背景

2026-06-08 (handoff `2026-06-08-pr162-163-and-prod-roadmap.md`) で本田様と合意した prod 移行方針に基づき、bugfix 一巡完了 (PR #190、2026-06-20) を trigger に Phase 1 (prod インフラ整備) を実施。

Phase 1 では prod 環境のリソースのみ整備し、実デプロイは Phase 2 で行う。

## Phase 分割

| Phase | スコープ | 状態 |
|---|---|---|
| **Phase 1** (本ドキュメント) | prod インフラ整備 (デプロイなし) | ✅ 完了 |
| Phase 2 | CI/CD 二環境化 + 初回 prod デプロイ | ⏳ 次着手 |
| Phase 3 | dev → prod 運用フロー確立 (workflow_dispatch 駆動) | ⏳ |
| Phase 4 | 一般公開 (法務確認 + 課金クォータ完了が前提) | ⏳ |

## Codex セカンドオピニオン反映済の修正点 (Phase 1 計画段階)

| 修正 | 内容 |
|---|---|
| 修正 1 | API リストを 6 → **9** 種に拡張 (Firebase 関連 +3: firebase / firebaserules / identitytoolkit) |
| 修正 2 | Runtime SA に **`roles/datastore.user`** を必須として明示追加 (Firebase Admin SDK は rules bypass、別途権限必要) |
| 修正 3 | WIF Provider attribute condition に **`refs/heads/main` 制約**追加 (feature ブランチからの誤デプロイ防止) |
| 修正 4 | Vertex AI quota 確認を「並行進行」から Phase 1 AC に格上げ |
| 修正 5 | AC に「未認証 401 (AC-13)」「静的 UI 到達 (AC-14)」を追加 (Phase 2 検証として文書化) |
| 修正 6 | 予算アラートを「事前承認タスク扱い」に明示 |
| 修正 7 | PR-A は `.firebaserc` 変更のみ、実 rules deploy は runbook 証跡化 |

## タスク一覧と達成状況

| # | タスク | 状態 | 担当 | AC |
|---|--------|------|------|----|
| T1 | novel-writer-prod 課金有効化 (請求先アカウント `01EAA2-26BD24-E69348`) | ✅ | 本田様承認 → AI 実行 | AC-1 |
| T2 | GCP API 9 種有効化 | ✅ | AI | AC-2 |
| T3 | Artifact Registry `novel-writer` @ asia-northeast1 (DOCKER) | ✅ | AI | AC-3 |
| T4 | Service Account 2 種 (`github-deploy` / `novel-writer-run`) | ✅ | AI | AC-4 |
| T5 | SA 権限付与 (datastore.user 必須含む、Codex 修正反映) | ✅ | AI | - |
| T6 | WIF Pool + Provider (branch 制約付き、Codex 修正反映) | ✅ | AI | AC-5 |
| T7 | `github-deploy` SA に WIF impersonation 権限 | ✅ | AI | AC-6 |
| T8 | Firestore Native mode 初期化 (asia-northeast1) | ✅ | AI | AC-7 |
| T9 | `.firebaserc` prod alias 追加 (PR #192) + rules deploy | ✅ | AI (PR-A) | AC-8 |
| T10 | Firebase Web App 登録 (`firebase apps:create WEB`) | ✅ | AI | AC-9 (前段) |
| T11 | GitHub Secrets に PROD_VITE_FIREBASE_* 6 件登録 | ✅ | AI (gh CLI) | AC-9 |
| T11.5 | Firebase Auth: Google provider 有効化 + authorizedDomains 5 件追加 (Phase 2 段階で漏れ発覚、`docs/runbook/prod-infrastructure-setup.md` T11.5.1〜T11.5.3 で補完) | ✅ | 本田様 UI + AI REST API (PR #198 系) | AC-15 / AC-16 |
| T12 | 予算アラート (¥1,000/月、50/80/100/120% 閾値) | ✅ | AI (本田様承認後) | AC-10 |
| T13 | Vertex AI quota / region 確認 (asia-northeast1 default quota) | ✅ | AI | AC-11 |
| T14 | runbook + tasks 文書化 (本 PR) | 🚧 進行中 | AI (PR-B) | AC-12 |

## Acceptance Criteria 検証結果

| # | 基準 | 検証 |
|---|------|------|
| AC-1 | 課金が有効化 | `gcloud billing projects describe novel-writer-prod --format="value(billingEnabled)"` → `True` ✅ |
| AC-2 | 必要 9 API が ENABLED | `gcloud services list --enabled` で 9 種確認 ✅ |
| AC-3 | Artifact Registry repository 存在 | `gcloud artifacts repositories describe novel-writer --location=asia-northeast1` ✅ |
| AC-4 | SA 2 種存在 | `gcloud iam service-accounts list --project novel-writer-prod` ✅ |
| AC-5 | WIF Provider に repo + branch 制約 | `assertion.repository=='Yukina1116/novel-writer' && assertion.ref=='refs/heads/main'` ✅ |
| AC-6 | WIF impersonation 権限付与 | `roles/iam.workloadIdentityUser` + principalSet ✅ |
| AC-7 | Firestore Native, asia-northeast1 | `FIRESTORE_NATIVE` / `asia-northeast1` ✅ |
| AC-8 | firestore.rules prod 反映 | `firebase deploy --only firestore:rules --project prod` 成功 ✅ |
| AC-9 | Firebase Web App + Secrets | `apps:sdkconfig` 6 値取得 → `gh secret list` で 6/6 登録 ✅ |
| AC-10 | 予算アラート | budget ID `1f17fe3e-13d2-46f3-b906-2942a984ec6d` ¥1,000 JPY 設定済 ✅ |
| AC-11 | Vertex AI quota 確認 | aiplatform.googleapis.com 有効 + default quota (dev 同 region 稼働実績あり) ✅ |
| AC-12 | runbook + tasks 文書 | 本 PR でマージ予定 🚧 |
| AC-13 | 未認証 `/api/*` が 401 | **Phase 2 deploy 後検証** (Phase 1 では文書化のみ) 📋 |
| AC-14 | 静的 UI (`/`) 未認証到達 | **Phase 2 deploy 後検証** (Phase 1 では文書化のみ) 📋 |
| AC-15 | Firebase Auth Google provider 有効 (prod) | `curl .../defaultSupportedIdpConfigs` で `enabled: true` + clientId 取得 ✅ (Phase 2 段階で補完) |
| AC-16 | Firebase Auth authorizedDomains に Cloud Run URL 含む | `curl .../config` で 5 ドメイン (`novel-writer-df263ic6wa-an.a.run.app` 含む) 取得 ✅ (Phase 2 段階で補完) |

## Phase 2 への引き継ぎ事項

### Phase 2 で参照する値

| 項目 | 値 |
|---|---|
| Project ID | `novel-writer-prod` |
| Project Number | `1026420855688` |
| Region | `asia-northeast1` |
| Artifact Registry | `asia-northeast1-docker.pkg.dev/novel-writer-prod/novel-writer/novel-writer` |
| Build-time SA | `github-deploy@novel-writer-prod.iam.gserviceaccount.com` |
| Runtime SA | `novel-writer-run@novel-writer-prod.iam.gserviceaccount.com` |
| WIF Provider | `projects/1026420855688/locations/global/workloadIdentityPools/github-pool/providers/github-provider` |
| Firebase Web App ID | `1:1026420855688:web:4afee11ab993a15e2ae03d` |
| GitHub Secrets prefix | `PROD_VITE_FIREBASE_*` (6 件) |
| Budget ID | `1f17fe3e-13d2-46f3-b906-2942a984ec6d` (¥1,000/月、50/80/100/120%) |

### Phase 2 で必ず検証すべき項目

- AC-13: 未認証 `/api/*` リクエストが 401 を返すこと (BE `verifyIdToken` middleware 動作確認)
- AC-14: 静的 UI (`/`) が未認証で到達可能であること
- Vertex AI 実呼び出し (`/api/ai/novel/generate` 等) で smoke test 通過すること

### Phase 2 で作成する deploy-prod.yml の要点

- `on.workflow_dispatch` (手動 trigger、main push 自動デプロイは dev のみ)
- WIF Provider は prod 用 (上記)
- Build-arg は `PROD_VITE_FIREBASE_*` を参照
- Cloud Run flags: dev と同等 (`--memory=512Mi --timeout=300 --max-instances=2 --allow-unauthenticated --service-account=novel-writer-run@novel-writer-prod...`)
- env-vars: `GCP_PROJECT=novel-writer-prod, GCP_LOCATION=asia-northeast1, USE_VERTEX_AI=true, NODE_ENV=production`

## Phase 4 (一般公開) への前提条件

| 前提 | 状態 |
|---|---|
| 法務確認 (顧問弁護士による規約 3 文書承認) | ⏳ 別軸進行 |
| 課金クォータ (Vertex AI 通常利用範囲で必要なら申請) | ⏳ 必要時申請 |
| Phase 2 (初回 deploy + smoke test) | ⏳ 次着手 |
| Phase 3 (dev → prod 運用フロー文書化) | ⏳ |

## 参考

- ADR-0001 §M0 (緊急対応 + `max-instances=2` + 予算アラート)
- ADR-0001 §M3 (Cloud Run public 化 + verifyIdToken 設計)
- ADR-0001 §M7 (法務確認 MUST、Phase 4 前提条件)
- Codex セカンドオピニオン (本セッション、19 件の指摘から 7 件修正反映)
- PR #192 (T9 PR-A、`.firebaserc` prod alias)
