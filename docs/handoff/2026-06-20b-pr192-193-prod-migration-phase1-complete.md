# Handoff: novel-writer-prod Phase 1 (インフラ整備) 完了

- Session Date: 2026-06-20 (afternoon)
- Owner: yasushi-honda
- Status: ✅ **完了** — PR #192 (PR-A) + PR #193 (PR-B) ともに merged + main clean + CI ✅ + Phase 1 全 14 タスク達成
- Previous: [2026-06-20-pr190-modal-itemtoedit-bugfix.md](./2026-06-20-pr190-modal-itemtoedit-bugfix.md)

## セッション要旨

prod 移行ロードマップ Phase 1 (novel-writer-prod インフラ整備、デプロイなし) を完走。
2026-06-08 handoff (`2026-06-08-pr162-163-and-prod-roadmap.md`) で本田様と合意した移行方針 (bugfix 一巡完了を trigger に prod 構築着手) を、PR #190 完走を経て本日実行。

事前に Codex セカンドオピニオンを取得し、7 件の修正 (API リスト拡張 / Runtime SA `datastore.user` 必須 / WIF branch 制約 / AC 追加等) を計画に反映済み。

価格設定の参考メモも本セッション前半で `.claude/memory/pricing_tier2_reference_2026-06.md` に保存 (M5 Stripe 着手時に再参照)。

## 本セッション PR

| PR | 内容 | 規模 | 状態 |
|----|------|------|------|
| **#192** | chore(prod): .firebaserc に prod alias 追加 (Phase 1 PR-A) | 1 file, +3/-1 | ✅ `b2a5ff1` |
| **#193** | docs(prod-migration): Phase 1 完了 runbook + tasks 文書化 (PR-B) | 2 files, +420/-0 | ✅ `2f1f439` |

## Phase 1 達成内容詳細

### インフラ整備実績 (T1-T13)

| # | タスク | 結果 |
|---|--------|------|
| T1 | 課金有効化 | 請求先アカウント `01EAA2-26BD24-E69348` 紐付け (Firebase のお支払いは 10 project quota 上限のため切替) |
| T2 | GCP API 9 種有効化 | run / aiplatform / artifactregistry / firestore / cloudbuild / iamcredentials / firebase / firebaserules / identitytoolkit |
| T3 | Artifact Registry | `novel-writer` @ asia-northeast1 (DOCKER) |
| T4 | Service Account 2 種 | `github-deploy` + `novel-writer-run` |
| T5 | SA 権限付与 | Build-time: `run.admin` / `artifactregistry.writer` / `iam.serviceAccountUser`、Runtime: `datastore.user` (Codex 必須指摘) + `aiplatform.user` |
| T6 | WIF Pool + Provider | `github-pool` / `github-provider`、condition に `repository=='Yukina1116/novel-writer' && ref=='refs/heads/main'` (Codex 修正反映、PR-C-prereq で repo owner 誤記を修正) |
| T7 | WIF impersonation | `github-deploy` SA に principalSet で workloadIdentityUser |
| T8 | Firestore Native | `(default)` @ asia-northeast1 |
| T9 | firestore.rules deploy | PR #192 merge 後 `firebase deploy --only firestore:rules --project prod` 成功 |
| T10 | Firebase Web App | `firebase apps:create WEB` → App ID `1:1026420855688:web:4afee11ab993a15e2ae03d` |
| T11 | GitHub Secrets | `PROD_VITE_FIREBASE_*` 6 件登録確認 |
| T12 | 予算アラート | budget ID `1f17fe3e-13d2-46f3-b906-2942a984ec6d` ¥1,000/月 50/80/100/120% |
| T13 | Vertex AI quota | default quota で開始 (Phase 2 smoke test で実値確認) |

### Codex セカンドオピニオン反映済 7 修正

1. API リスト 6 → 9 種 (Firebase 関連 +3)
2. Runtime SA に `roles/datastore.user` 必須追加 (Firebase Admin SDK は Security Rules を bypass)
3. WIF condition に `refs/heads/main` 制約 (feature ブランチからの誤デプロイを構造的にブロック)
4. Vertex AI quota 確認を Phase 1 AC に格上げ
5. AC-13 (未認証 401) / AC-14 (静的 UI 到達) を追加 (Phase 2 検証として文書化)
6. 予算アラートを「事前承認タスク扱い」に明示
7. PR-A は `.firebaserc` のみ、実 rules deploy は runbook 証跡化

### Acceptance Criteria 達成状況

| AC | 状態 |
|----|------|
| AC-1 〜 AC-11 | ✅ Phase 1 内で機械的検証完了 |
| AC-12 (runbook + tasks 文書) | ✅ PR #193 merged |
| AC-13 (未認証 `/api/*` → 401) | 📋 Phase 2 検証 |
| AC-14 (静的 UI 未認証到達) | 📋 Phase 2 検証 |

### 価格設定 参考メモ (M5 Stripe 着手時に再参照)

`.claude/memory/pricing_tier2_reference_2026-06.md` に保存:
- 市場相場 (海外: NovelAI $10-25、Sudowrite $19-44 / 国内: 1,000-3,000円)
- 推奨: 案A (¥980 単一プラン MVP) → 半年データで案B (¥1,480 + ¥2,980) 拡張
- 確定前再確認チェックリスト (Vertex AI 実コスト / Stripe vs Paddle vs Komoju / 年額プラン LTV 等)

## Issue Net 変化 (本セッション)

- Close 数: 0 件
- 起票数: 0 件
- **Net: 0 件**

本セッションは Phase 1 完走が主題、Issue triage 該当事象なし。

## 残 Open Issue (前 handoff から不変)

| Issue | 内容 | 緊急性 |
|------|------|--------|
| #137 | promptSafety umbrella (残 #6 / #8) | LOW |
| #147 | PII path leak (codex review 由来) | LOW |
| #152 | update path paired signal | LOW |
| #155 | AC-3 backward compat test gap | LOW |
| #156 | callback register-or-forget リスク | LOW |

すべて enhancement (P0/P1/bug なし)、Phase 2 着手を妨げない。

## 次のアクション (3 分割)

### 即着手タスク

なし (本セッションで Phase 1 完了、次セッション開始時に Phase 2 impl-plan へ)

### 条件待ち (明示 trigger 付き)

| # | 項目 | A/B/C | trigger | 充足時のタスク |
|---|------|-------|---------|--------------|
| 1 | **Phase 2 (CI/CD 二環境化 + 初回 prod deploy)** | A (executor 領分) | 次セッション開始 + 本田様「Phase 2 に進んで」指示 | `/impl-plan` で deploy-prod.yml 詳細設計 → 実装 → 手動 trigger デプロイ → Playwright MCP 実機検証 (AC-13/AC-14) → Vertex AI smoke test |
| 2 | **Phase 3 (dev → prod 運用フロー文書化)** | A (executor 領分) | Phase 2 完了 | dev → prod 手動デプロイ手順を ADR 化、rollback 手順、prod tag 戦略 |
| 3 | **Phase 4 (一般公開)** | C (起点待ち) | 法務確認 (顧問弁護士 OK) + 課金クォータ確認 + Phase 2/3 完了 | プロモーション開始、Firestore PITR 設定、Cloud Logging 監視ダッシュボード |
| 4 | M5 (Stripe Tier 2 課金) | C (起点待ち) | 本田様「M5 着手」指示 + 価格決定 | `.claude/memory/pricing_tier2_reference_2026-06.md` 参照、Stripe Subscription + Webhook 実装 |
| 5 | Issue #137 / #147 / #152 / #155 / #156 | C (起点待ち) | 番号指定の明示着手指示 | 各 enhancement の impl-plan → tdd |
| 6 | Firestore PITR 設定 | B (検出可・実行人待ち) | Phase 4 公開前 trigger or 本田様の明示指示 | `gcloud firestore databases update` で PITR 有効化、production-data-safety.md MUST 達成 |

### 却下候補 (記録のみ・包括指示の対象外)

| # | 項目 | A/B/C | 着手しない理由 |
|---|------|-------|--------------|
| 1 | 未指示の C 案発想 (新機能 / UX 改善 / リファクタリング) | C (unclear) | 起点アイデアは decision-maker 領分、AI 起案禁止 (4 原則 §1) |
| 2 | Phase 2 を AI 単独判断で着手 | A (越権) | Phase 区切りごとに本田様の進行 GO を取る方針、handoff で締めて新セッションで仕切り直し |
| 3 | 法務確認の進捗確認 / 督促 | C (decision-maker 領分) | 顧問弁護士との連絡は本田様の領分 |
| 4 | 課金クォータ Vertex AI 申請 | A (本田様判断) | 申請可否と申請内容は本田様の判断、Phase 2 smoke test 結果次第 |

## 次セッション開始時の手順

1. `/catchup` で状況把握 (本 handoff が LATEST.md にリンクされている前提)
2. 本田様から「Phase 2 に進んで」or 別タスク指示 (Issue 番号等) を受領
3. Phase 2 指示の場合:
   - `/impl-plan Phase 2: CI/CD 二環境化 + 初回 prod deploy` で詳細設計
   - 必要時に Codex セカンドオピニオン
   - 実装 (deploy-prod.yml 新規作成)
   - 手動 trigger で初回 deploy
   - Playwright MCP で AC-13/AC-14 実機検証
   - Vertex AI smoke test (`/api/ai/novel/generate` 等)
   - Phase 2 PR (deploy-prod.yml + runbook 追記)

## セッション終了可否

### ✅ **終了可** (執筆者: AI、最終判定者: 本田様)

#### 根拠
- 本セッション主題 (Phase 1 完了) を完走、PR #192 / #193 ともに merged
- main clean / CI ✅ / unpushed commit なし
- Phase 1 全 14 タスク達成、AC-1〜AC-12 機械的検証通過
- AC-13/AC-14 は Phase 2 で検証する旨を tasks.md と runbook の双方に明文化、引き継ぎ完了
- 価格設定参考メモも保存済、M5 着手時に即参照可能
- active Issue 5 件はすべて LOW enhancement、Phase 2 着手を妨げない
- 次セッションは新規 context で `/catchup` → Phase 2 着手指示待ち、というクリーンな状態
