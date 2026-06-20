# Handoff: novel-writer-prod Phase 2 (CI/CD 二環境化 + 初回 prod deploy) 完了

- Session Date: 2026-06-20 (evening)
- Owner: yasushi-honda
- Status: ✅ **完了** — PR #195 + #197 merged + Phase 2 全 AC 達成 + 2 件の bug 発覚と恒久 fix
- Previous: [2026-06-20b-pr192-193-prod-migration-phase1-complete.md](./2026-06-20b-pr192-193-prod-migration-phase1-complete.md)

## セッション要旨

prod 移行ロードマップ Phase 2 (CI/CD 二環境化 + 初回 prod deploy + smoke test) を完走。

- `.github/workflows/deploy-prod.yml` 新規追加 (workflow_dispatch only、prod WIF + PROD secrets)
- 初回 prod deploy 成功 (revision novel-writer-00001-kn6 → hotfix 後 00002-jv2)
- AC-P2-1〜AC-P2-9 全達成
- Playwright MCP 半自動 E2E で Vertex AI smoke test 成功 (`/api/ai/novel/generate` 200、68 文字生成)

セッション中に 2 件の bug が連続発覚し、対処も完了:
1. **Phase 1 で Firebase Auth 設定漏れ** (Google sign-in provider + authorizedDomains)
2. **env_var_drift bug** (`GCLOUD_PROJECT` 不在 + hardcoded fallback で prod token 全 401 reject)

## 本セッション PR

| PR | 内容 | 規模 | 状態 |
|----|------|------|------|
| **#195** | feat(prod-migration): Phase 2 PR-C — deploy-prod.yml + spec + runbook (3 並列レビュー 7 件指摘反映済) | 4 files, +423/-0 | ✅ ef5a40a |
| **#197** | fix(prod-migration): Phase 1 WIF condition (Yukina1116/novel-writer) + Artifact Registry cleanup policy | 5 files, +37/-5 | ✅ 08a4346 |
| **#198** → PR-D に統合 | fix(docs): email 訂正 (sanwaminamihonda → hy.unimail.11) | 3 files, +3/-3 | (close 予定) |
| **PR-D** (本 handoff 同梱、別 commit) | docs(prod-migration): Phase 2 完了 + env_var_drift 恒久 fix + Phase 1 補完 (Firebase Auth) + memory + email 訂正 | TBD | 🚧 |

## Phase 2 達成内容

### AC 達成状況

| AC | 結果 |
|----|------|
| AC-P2-1 (workflow_dispatch only) | ✅ |
| AC-P2-2 (PROD_VITE_FIREBASE_* x6) | ✅ |
| AC-P2-3 (prod WIF) | ✅ |
| AC-P2-4 (Cloud Run URL) | ✅ `https://novel-writer-df263ic6wa-an.a.run.app` revision `novel-writer-00002-jv2` |
| AC-P2-5 (curl 401) | ✅ users/init + ai/utility/names ともに 401 |
| AC-P2-6 (curl 200 + HTML) | ✅ text/html + `<title>小説らいたー</title>` |
| AC-P2-7 (Vertex AI smoke) | ✅ novel/generate 200 + 68 文字 + ナレッジ 3 候補 |
| AC-P2-8 (rollback runbook) | ✅ |
| AC-P2-9 (tasks 完走) | ✅ |

### Phase 2 で発覚した bug (2 件)

#### Bug 1: Firebase Auth 設定漏れ (Phase 1 補完事項)

- 症状: AC-P2-7 で login 時に `auth/configuration-not-found`
- 原因: Phase 1 で `firebase apps:create WEB` のみ実行、Google sign-in provider enable と authorizedDomains 追加が漏れていた
- 対処: 本田様 Firebase Console UI で Google provider enable + AI が `identitytoolkit.googleapis.com/admin/v2/projects/.../config` REST API で authorizedDomains 5 件追加
- 文書化: `docs/runbook/prod-infrastructure-setup.md` T11.5 セクション + `docs/spec/prod-migration/phase1-tasks.md` AC-15/16 追加
- memory: `.claude/memory/feedback_firebase_auth_setup_gotcha.md`

#### Bug 2: env_var_drift bug (深刻)

- 症状: login 成功後、全 API (users/init / ai/novel/generate) が 401
- 根本原因: `server/firebaseAdmin.ts` は `process.env.GCLOUD_PROJECT` を読むが、`.github/workflows/deploy*.yml` は `GCP_PROJECT` のみ設定 → 両 env undefined → hardcoded fallback `'novel-writer-dev'` で Firebase Admin SDK 初期化 → prod token (`aud: novel-writer-prod`) を `expected: novel-writer-dev` で reject (Cloud Logging に `Firebase ID token has incorrect "aud" claim` warning)
- 即時 hotfix: `gcloud run services update novel-writer --update-env-vars=GCLOUD_PROJECT=novel-writer-prod` (revision 00002-jv2 で反映、本田様番号単位明示認可下で実行)
- 恒久 fix (本 PR-D):
  - `.github/workflows/deploy-prod.yml` env-vars に `GCLOUD_PROJECT=novel-writer-prod` 追加
  - `.github/workflows/deploy.yml` (dev) env-vars に `GCLOUD_PROJECT=novel-writer-dev` 追加
  - `server/firebaseAdmin.ts` の hardcoded fallback 削除 → fail-fast 化 (emulator mode のみ `'demo-novel-writer'` placeholder 許容)
  - `server/aiClient.ts` の同種 hardcoded fallback (`GCP_PROJECT || 'novel-writer-dev'`) も fail-fast 化 (発症はしていなかったが prophylactic)
- 深刻度: dev 環境で長期間気付かない構造的 fail-open (dev project ID と hardcoded fallback が偶然一致して動作)
- memory: `.claude/memory/feedback_env_var_naming_drift.md`

### Phase 2 で実行した destructive 操作 (番号単位明示認可済)

1. PR #197 認可・merge (Phase 1 WIF condition 修正 + cleanup policy)
2. PR #195 認可・merge (Phase 2 PR-C)
3. WIF Provider attribute condition update (`yasushi-honda` → `Yukina1116`)
4. SA impersonation principalSet swap
5. Artifact Registry cleanup policy 適用
6. T4: `gh workflow run deploy-prod.yml --ref main` (初回 prod deploy)
7. Firebase Auth authorizedDomains 5 件追加 (REST API PATCH)
8. Cloud Run env vars update (`GCLOUD_PROJECT=novel-writer-prod` 追加 hotfix)

## Issue Net 変化 (本セッション)

- Close 数: 0 件 (Bug 1, 2 は in-flight fix、Issue 起票せず)
- 起票数: 0 件
- **Net: 0 件**

理由: Bug 1, 2 とも本セッション内で root cause 特定 + 恒久 fix まで完走済。Issue 起票 triage 条件 (rating 7+) には該当するが、本 PR-D の merge で resolve するため Issue 起票不要 (CRITICAL §「Issue は net で減らすべき KPI」)。

## 残 Open Issue (前 handoff から不変)

| Issue | 内容 | 緊急性 |
|------|------|--------|
| #137 | promptSafety umbrella (残 #6 / #8) | LOW |
| #147 | PII path leak (codex review 由来) | LOW |
| #152 | update path paired signal | LOW |
| #155 | AC-3 backward compat test gap | LOW |
| #156 | callback register-or-forget リスク | LOW |

すべて enhancement、Phase 3 着手を妨げない。

## 次のアクション (3 分割)

### 即着手タスク

なし (本セッションで Phase 2 完了、PR-D merge 後にクリーン状態)

### 条件待ち (明示 trigger 付き)

| # | 項目 | A/B/C | trigger | 充足時のタスク |
|---|------|-------|---------|--------------|
| 1 | **Phase 3 (dev → prod 運用フロー文書化)** | A (executor 領分) | 本田様「Phase 3 に進んで」指示 | dev → prod 手動デプロイ手順 ADR 化、rollback 手順、prod tag 戦略 |
| 2 | **Phase 4 (一般公開)** | C (起点待ち) | 法務確認 (顧問弁護士 OK) + 課金クォータ確認 + Phase 3 完了 | プロモーション開始、Firestore PITR 設定、Cloud Logging 監視ダッシュボード |
| 3 | M5 (Stripe Tier 2 課金) | C (起点待ち) | 本田様「M5 着手」指示 + 価格決定 | `.claude/memory/pricing_tier2_reference_2026-06.md` 参照 |
| 4 | Issue #137 / #147 / #152 / #155 / #156 | C (起点待ち) | 番号指定の明示着手指示 | 各 enhancement の impl-plan → tdd |
| 5 | Cloud Billing 実コスト追補 (Phase 2 smoke test 分) | A (executor 領分、追補 commit) | 2026-06-22 以降 (Cloud Billing reports 24-48h 反映遅延) | runbook 証跡セクションに追補 |
| 6 | Firestore PITR 設定 | B (検出可・実行人待ち) | Phase 4 公開前 trigger or 本田様明示指示 | `gcloud firestore databases update` で PITR 有効化 |

### 却下候補 (記録のみ・包括指示の対象外)

| # | 項目 | A/B/C | 着手しない理由 |
|---|------|-------|--------------|
| 1 | 未指示の C 案発想 (新機能 / UX 改善 / リファクタリング) | C (unclear) | 起点アイデアは decision-maker 領分 (4 原則 §1) |
| 2 | Phase 3 を AI 単独判断で着手 | A (越権) | Phase 区切りごとに本田様の進行 GO を取る方針 |
| 3 | 法務確認の進捗確認 / 督促 | C (decision-maker 領分) | 顧問弁護士との連絡は本田様の領分 |
| 4 | 課金クォータ Vertex AI 申請 | A (本田様判断) | 申請可否と申請内容は本田様の判断、Phase 2 smoke 結果 (68 文字 1 回呼出) なら default quota で十分 |

## セッション終了可否

### ✅ **終了可** (執筆者: AI、最終判定者: 本田様)

#### 根拠
- 本セッション主題 (Phase 2 完了) を完走、PR #195 / #197 merged + PR-D 作成・merge 予定
- Phase 2 全 AC (P2-1 〜 P2-9) 達成、prod が本田様自身の dev test 用として稼働中
- セッション中に発覚した 2 件の bug は in-flight で恒久 fix まで完走 (PR-D に同梱)
- main clean (PR-D merge 後) / CI ✅ / unpushed commit なし
- active Issue 5 件はすべて LOW enhancement、Phase 3 着手を妨げない
- 次セッションは新規 context で `/catchup` → Phase 3 着手指示待ち、というクリーンな状態
- Cloud Billing 実コスト追補 (2026-06-22 以降) は B カテゴリの軽い追補で、別セッションでも対応可
