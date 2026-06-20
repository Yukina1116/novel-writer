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

1. GitHub UI → `https://github.com/Yukina1116/novel-writer/actions/workflows/deploy-prod.yml` を開く
   - 注: `workflow_dispatch` は default branch にマージされて初めて Actions UI に表示される仕様。本 PR-C merge 後に初めて選択可能になる
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

### T7: AC-14 検証 (静的 UI 未認証到達) — Playwright MCP

未認証経路の確認のみ。本田様の login session を持たない MCP browser context で実行する。

```bash
# 静的 UI が未認証で到達できることを確認
curl -i --http2 "https://<CLOUD_RUN_URL>/"
# 期待: HTTP/2 200 + Content-Type: text/html + body に <div id="root"> 等
# (curl が HTTP/1.1 で返す環境では HTTP/1.1 200 でも AC を満たす、AC-P2-6 は status 200 のみ要件)
```

Playwright MCP で実際にブラウザ open:
- `mcp__playwright__browser_navigate` で `https://<CLOUD_RUN_URL>/` を開く
- `mcp__playwright__browser_snapshot` で初期 UI 描画を確認 (ログイン画面 or トップ画面)
- ログインボタンの存在を snapshot で確認するに留め、**login は実行しない** (T8 で別 context で実施)

#### 証跡 (T7)

- `/` 応答コード: (実行後に追記、`HTTP/1.1 200` or `HTTP/2 200`)
- Playwright snapshot 抜粋 (ログインボタンまたはトップ画面の存在): (実行後に追記、redacted - DOM 構造のみ、本文文字列は省略)
- AC-14 判定: (実行後に追記)

### T8: Vertex AI smoke test — 本田様の通常ブラウザで実施 (Playwright MCP は使わない)

T7 と context を分離する理由: Playwright MCP の browser context は OS のキーチェーン / Chrome の Google session を共有せず、Google OAuth login flow は別 context で完結させた方が手順が単純で確実。

本田様自身の Google アカウント (`hy.unimail.11@gmail.com`、Phase 1 runbook §前提に記載の業務 GCP / Firebase / GitHub アカウント) で login し、AI 機能を実呼出する。

1. 本田様の通常ブラウザで `https://<CLOUD_RUN_URL>/` を開く
2. 「Google でログイン」→ 本田様アカウントで認証 (Google OAuth popup)
3. ログイン成功後、`/api/users/init` が自動実行され Firestore に users/{uid} doc 作成される (冪等 transaction)
4. 利用規約同意画面 (`TermsConsentModal`) が表示 → 「同意する」を押下 → `/api/users/accept-terms` 呼出
5. プロジェクト作成 → エディタ画面に遷移
6. 名前生成ツール起動 → `/api/ai/utility/names` 呼出 (quota: 50 sen, 最小コスト)
7. 名前候補が返却されることを確認
8. 続き生成 → 短プロンプト + 50 tokens 程度で `/api/ai/novel/generate` 呼出 (quota: 200 sen)
9. 文章が生成されることを確認
10. Cloud Logging で `severity>=ERROR` を grep し、0 件 (または expected な 429/503/504 のみ) を確認:
    ```bash
    gcloud logging read \
      'resource.type="cloud_run_revision" AND resource.labels.service_name="novel-writer" AND severity>=ERROR' \
      --project=novel-writer-prod \
      --limit=20 \
      --format="value(timestamp,severity,jsonPayload.message)"
    ```

#### 証跡 (T8) — PII / 生成本文の redaction 運用

下記項目のみを runbook 証跡に残す。**生成本文 / uid / email / request payload / ID token は記録しない** (PR-D の commit から PII を漏らさないため)。

- 本田様 login 成功: (Yes / No のみ)
- TermsConsentModal 表示 → 同意成功: (Yes / No のみ)
- `/api/ai/utility/names` HTTP status + requestId 下 8 桁: (実行後に追記、例: `200 / req-abcd1234`)
- 名前候補返却件数: (count のみ、文字列は省略)
- `/api/ai/novel/generate` HTTP status + requestId 下 8 桁: (実行後に追記)
- 生成文字数: (count のみ、本文は省略)
- Cloud Logging ERROR 件数 (T8 開始〜完了の時間範囲): (count + 種別、本文は省略)
- Cloud Billing 推定コスト: Cloud Billing reports は 24-48h 反映遅延があるため、Phase 2 完了から 48h 後に再確認し PR-D マージ後の追補 commit で記入
- AC-P2-7 判定: (実行後に追記)

## Rollback 手順

### 緊急時の即時遮断 (最優先、deploy 後に問題発覚した場合の第一手)

予期せぬデータ漏洩や認証バイパスの疑いがある場合、まず public access を遮断してから原因調査する:

```bash
gcloud run services update novel-writer \
  --no-allow-unauthenticated \
  --region=asia-northeast1 \
  --project=novel-writer-prod
```

この時点で `/` 含めて全 endpoint が IAM 認証必須になる (本田様の identity でも `curl https://...` は 403 になる)。次に原因調査 → 修正 → 再 deploy → `--allow-unauthenticated` 復元。

### 直前 revision に戻す (deploy 後に問題発覚した場合、revision が複数ある場合のみ)

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
