# Runbook: novel-writer-prod 初回デプロイ + 検証 (Phase 2)

- Status: 🚧 進行中 (2026-06-20)
- Owner: yasushi-honda
- Executor: AI (Claude Opus 4.7)
- Related: [docs/spec/prod-migration/phase2-tasks.md](../spec/prod-migration/phase2-tasks.md) (タスク表 + AC)
- Related: [docs/runbook/prod-infrastructure-setup.md](./prod-infrastructure-setup.md) (Phase 1 インフラ整備の証跡)
- Related: [.github/workflows/deploy-prod.yml](../../.github/workflows/deploy-prod.yml) (本 runbook が起動する workflow)

## 用途

Phase 1 で整備した novel-writer-prod インフラに対して、初回 Cloud Run デプロイと AC-13/AC-14 実機検証、Vertex AI smoke test を実施する手順と証跡。

## 前提

- Phase 1 完了済 (PR #192 / #193 / #194 merged、`docs/runbook/prod-infrastructure-setup.md` 参照)
- `.github/workflows/deploy-prod.yml` が main に merged されている (PR-C)
- GitHub Secrets `PROD_VITE_FIREBASE_*` 6 件登録済 (Phase 1 T11)
- WIF Provider attribute condition は `refs/heads/main` 制約付き = feature branch からの prod deploy は構造的にブロック

## 危険操作の注意

- **`workflow_dispatch` の Branch 選択は必ず `main`**。feature branch を選んでも WIF condition で deploy step は失敗するが、無駄な build を走らせない
- **smoke test で AI 機能を呼ぶ際の使用 token を最小化**。`/api/ai/utility/names` (50 sen / 呼出) を優先し、`novel/generate` は短プロンプト + 50 tokens 程度の続き生成のみ
- **smoke test で書き込まれる Firestore データは本田様自身の uid のみ**。`/api/users/init` は冪等 transaction (M2 PR-C)、`/api/users/accept-terms` は同様に冪等
- **Vertex AI 料金は smoke test で発生する**。手順 4-T8 完了後に Cloud Billing で実コストを確認し、本田様に報告

## 実行手順 (時系列、実行時に記録)

### T4: workflow_dispatch 起動

1. GitHub UI → `https://github.com/yasushi-honda/novel-writer/actions/workflows/deploy-prod.yml` を開く
2. 右上 "Run workflow" → Branch: `main` → "Run workflow" 押下
3. test job → deploy job の順で進行 (合計 5-10 分想定)

CLI でも起動可能:

```bash
gh workflow run deploy-prod.yml --ref main
gh run watch  # 実行状況を tail
```

#### 証跡 (T4)

- **Run URL**: (実行後に追記)
- **開始時刻**: (実行後に追記)
- **完了時刻**: (実行後に追記)
- **結果**: (実行後に追記)

### T5: Cloud Run revision / URL 記録

```bash
gcloud run services describe novel-writer \
  --region=asia-northeast1 \
  --project=novel-writer-prod \
  --format="value(status.url,status.latestReadyRevisionName)"
```

#### 証跡 (T5)

- **Cloud Run URL**: (実行後に追記)
- **latest revision**: (実行後に追記)

### T6: AC-13 検証 (未認証 `/api/*` → 401)

```bash
# 認証ヘッダーなしで /api/users/init を叩く
curl -i -X POST "https://<CLOUD_RUN_URL>/api/users/init" \
  -H "Content-Type: application/json"

# 期待: HTTP/2 401 + JSON body { error: "...", code: "..." } 相当

# 別 endpoint (AI route) でも同様に確認
curl -i -X POST "https://<CLOUD_RUN_URL>/api/ai/utility/names" \
  -H "Content-Type: application/json" \
  -d '{}'
# 期待: HTTP/2 401
```

#### 証跡 (T6)

- `/api/users/init` 未認証応答コード: (実行後に追記)
- `/api/ai/utility/names` 未認証応答コード: (実行後に追記)
- AC-13 判定: (実行後に追記)

### T7: AC-14 検証 (静的 UI 未認証到達)

```bash
# 静的 UI が未認証で到達できることを確認
curl -i "https://<CLOUD_RUN_URL>/"
# 期待: HTTP/2 200 + Content-Type: text/html + body に <div id="root"> 等

# Playwright MCP で実際にブラウザ open
# (mcp__playwright__browser_navigate で <CLOUD_RUN_URL>/ を開き、ログイン画面 or 初期 UI が描画されることを確認)
```

#### 証跡 (T7)

- `/` 応答コード: (実行後に追記)
- HTML 描画確認 (Playwright snapshot): (実行後に追記)
- AC-14 判定: (実行後に追記)

### T8: Vertex AI smoke test

本田様自身の Google アカウント (`sanwaminamihonda@gmail.com`) で login し、AI 機能を実呼出。

1. Playwright MCP で `https://<CLOUD_RUN_URL>/` を open
2. 本田様自身がブラウザ画面でログイン (Google OAuth)
3. ログイン後、`/api/users/init` が自動実行され Firestore に users/{uid} doc 作成される (冪等)
4. 利用規約同意画面 (TermsConsentModal) → 同意
5. プロジェクト作成 → エディタ画面
6. 名前生成ツール起動 → `/api/ai/utility/names` 呼出 (50 sen, 最小コスト)
7. 名前候補が返却されることを確認
8. 続き生成 → 短プロンプト + 50 tokens 程度で `/api/ai/novel/generate` 呼出 (200 sen)
9. 文章が生成されることを確認

#### 証跡 (T8)

- 本田様 login 成功: (実行後に追記)
- TermsConsentModal 表示 → 同意: (実行後に追記)
- `/api/ai/utility/names` 応答: (実行後に追記)
- `/api/ai/novel/generate` 応答: (実行後に追記)
- Cloud Logging エラー有無: (実行後に追記)
- Cloud Billing 推定コスト (smoke test 分): (Phase 2 完了後 Cloud Billing で確認)
- AC-P2-7 判定: (実行後に追記)

## Rollback 手順

### 直前 revision に戻す (deploy 後に問題発覚した場合)

```bash
# 1. 過去の revision 一覧を確認
gcloud run revisions list \
  --service=novel-writer \
  --region=asia-northeast1 \
  --project=novel-writer-prod

# 2. 戻したい revision に 100% トラフィック切替
gcloud run services update-traffic novel-writer \
  --to-revisions=<REVISION_NAME>=100 \
  --region=asia-northeast1 \
  --project=novel-writer-prod
```

### Service 自体を取り消し (最終手段、Phase 2 初回 deploy で大きな問題が出た場合)

```bash
gcloud run services delete novel-writer \
  --region=asia-northeast1 \
  --project=novel-writer-prod
```

Service 削除後、Phase 2 をやり直すには deploy-prod.yml を再実行するだけで OK (Artifact Registry の image は残るが、`--max-instances=2` で再構築されるためコストは限定的)。

### Firestore データ rollback

Phase 4 で PITR (Point-In-Time Recovery) を有効化するまで、Firestore データの rollback は手動 export → 再 import が必要。Phase 2 smoke test では本田様自身の uid のみ書き込まれるため、必要時は Firebase Console から該当 doc を手動削除する。

## Phase 3 への引き継ぎ事項

- Phase 2 で deploy された Cloud Run service `novel-writer @ novel-writer-prod` は本田様の dev test 用として継続稼働
- Phase 3 では dev → prod 運用フロー (どの bug fix をどのタイミングで本番に上げるか) を ADR 化
- Phase 4 (一般公開) 前に Firestore PITR 有効化 + Cloud Logging 監視ダッシュボード作成

## 参考

- [phase2-tasks.md](../spec/prod-migration/phase2-tasks.md) (AC + タスク表)
- [phase1-tasks.md](../spec/prod-migration/phase1-tasks.md) (Phase 1 引き継ぎ事項 §73-102)
- [prod-infrastructure-setup.md](./prod-infrastructure-setup.md) (Phase 1 証跡、prod SA / WIF / Secrets 等の確定値)
- ADR-0001 §M3 (Cloud Run public + verifyIdToken 設計、AC-13 の根拠)
