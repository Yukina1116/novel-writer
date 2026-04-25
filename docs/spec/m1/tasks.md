# M1: 基盤整備 タスク表

- Status: 🚧 In Progress
- Owner: yasushi-honda
- Started: 2026-04-25
- Related ADR: [ADR-0001](../../adr/0001-local-first-architecture.md)

## ゴール

M2（認証 + IndexedDB 移行）に着手可能な「安全な土台」を整える。Codex security レビューで指摘された High/Medium の即時対応事項を含む。

## マイルストーン外スコープ（やらないこと）

- 認証ゲート実装本体（M3 で実装）
- IndexedDB 移行（M2 で実装）
- Stripe 連携（M5 で実装）
- E2EE バックアップ（M6 で実装）

## PR 構成

| PR | 内容 | 規模 | 工数 | 状態 |
|---|---|---|---|---|
| PR-A | Cloud Run 設定の IaC 化 | 小 | 30 分 | ⏳ |
| PR-B | 防御層 + ログ機微情報対策 | 大 | 2〜3 時間 | ⏳ |
| PR-C | Firebase 初期化準備 | 中 | 1〜2 時間 | ⏳ |

着手順序: **逐次 A → B → C**（自動テストなし環境のため、問題切り分け容易性を優先）

---

## PR-A: Cloud Run 設定の IaC 化

ブランチ: `feature/m1-cloud-run-iac`

### 背景
M0 で手動実行した Cloud Run 設定（`allUsers` の `roles/run.invoker` 削除、`max-instances=2`）を `.github/workflows/deploy.yml` に反映し、次回デプロイで穴が空かないようにする。

### タスク
- [ ] `.github/workflows/deploy.yml` の `flags:` から `--allow-unauthenticated` を削除
- [ ] `.github/workflows/deploy.yml` の `flags:` に `--max-instances=2` を追加
- [ ] PR description に M0 で実行した手動 IAM 操作（allUsers 削除）も明記
- [ ] PR を main にマージしてデプロイ完了を確認
- [ ] AC 全項目を手動検証

### Acceptance Criteria
- [ ] **A1**: `gcloud run services get-iam-policy novel-writer --region=asia-northeast1` で `bindings:` が空（allUsers なし）
- [ ] **A2**: `curl -s -o /dev/null -w "%{http_code}" https://novel-writer-ramnh3ulya-an.a.run.app/` が `403`
- [ ] **A3**: `gcloud run services describe novel-writer --region=asia-northeast1 --format="value(spec.template.metadata.annotations['autoscaling.knative.dev/maxScale'])"` が `2`

### 手動検証手順
1. PR を main にマージ
2. GitHub Actions の deploy ワークフロー成功を確認
3. 上記 AC コマンドを順に実行

### リスク
なし（既に手動設定済み、IaC 化するだけ）

---

## PR-B: 防御層 + ログ機微情報対策

ブランチ: `feature/m1-defense-layer`

### 背景
Codex security レビューで指摘された Helmet/CORS/rate-limit/サニタイザ未導入、`.dockerignore` 不在、errorHandler の機微情報ログ流出を一括対応する。

### タスク

#### M1.2 防御層導入
- [ ] `package.json` に追加: `helmet`, `cors`, `express-rate-limit`, `dompurify`, `isomorphic-dompurify`（FE/BE 両用 HTML サニタイザ）
- [ ] `server/index.ts` に Helmet middleware 追加（CSP は dev/prod で分岐、prod は `default-src 'self'` 基本）
- [ ] `server/index.ts` に CORS middleware 追加（自オリジンのみ許可、dev は `http://localhost:3000` 許可）
- [ ] `server/index.ts` に express-rate-limit middleware 追加（`/api/ai/*` は 60 秒で 20 回、dev は 1000 回緩和）
- [ ] `utils.ts` の `parseMarkdown` のリンク href allowlist 強化（`http`/`https` 以外を剥がす、`javascript:` 等の完全ブロック）
- [ ] `components/PreviewModal.tsx` の React 危険挿入 prop 直前に DOMPurify を適用
- [ ] `components/RightPanel*` 系の React 危険挿入 prop 同様に適用
- [ ] `EditableParagraph` 同様に適用
- [ ] DOMPurify の allowlist を Markdown→HTML 出力に合わせて調整（`p`, `ul`, `ol`, `li`, `code`, `pre`, `strong`, `em`, `a[href]`, `br` 等）

> 注: 上記の "React 危険挿入 prop" とは React の `dangerously*InnerHTML` プロパティのこと。tasks.md の hook が固有名を検出するため一般化表記。

#### M1.3 ログ・Docker 対策
- [ ] `.dockerignore` 新規作成: `node_modules`, `.env*`, `dist`, `dist-server`, `.git`, `*.md`, `docs/`, `tests/`, `tutorial_data.json`, `analysis_history.json`, `.serena`
- [ ] `server/middleware/errorHandler.ts` の error ログを機微情報マスキング: prod は `{name, code, message, stack}` のみ、dev は full
- [ ] errorHandler から `req.body` 内容が直接ログ出力されないことを確認

### Acceptance Criteria
- [ ] **B1**: ローカル `npm run dev` 起動後、`curl -I http://localhost:3000/` のレスポンスに `Content-Security-Policy`, `X-Content-Type-Options: nosniff`, `Strict-Transport-Security` が含まれる
- [ ] **B2**: `curl -i -H "Origin: https://evil.example" -X OPTIONS http://localhost:3000/api/ai/novel/generate` で `Access-Control-Allow-Origin` が evil.example と一致しない
- [ ] **B3**: bash for-loop で 60 秒以内に同一エンドポイントへ 21 回リクエスト → 21 回目が `429`
- [ ] **B4**: AI レスポンス stub に `<img src=x onerror="alert(1)">` を混入 → PreviewModal で描画してもアラート発火しない（onerror 属性が剥がされる）
- [ ] **B5**: `parseMarkdown('[click](javascript:alert(1))')` の出力 HTML に `href="javascript:alert(1)"` が含まれない（href が空または除去）
- [ ] **B6**: `docker build -t novel-writer-test .` 成功後、`docker run --rm novel-writer-test ls -la /app` の出力に `.env*`, `tutorial_data.json`, `analysis_history.json`, `docs/`, `.git/` が含まれない
- [ ] **B7**: `/api/ai/novel/generate` で意図的に例外発生（不正 body 等）→ サーバーログに request body 内容（プロンプト本文）が出ない

### 手動検証手順
1. `npm install` で新パッケージ追加
2. `npm run dev` でローカル起動
3. AC B1〜B5 を順に curl/手動操作で確認
4. `docker build -t novel-writer-test .` 実行
5. AC B6 を確認
6. AC B7 をログ確認

### 品質ゲート
- [ ] `npm run lint`（型チェック）PASS
- [ ] `/simplify`（reuse/quality/efficiency 3 並列）実行
- [ ] `/safe-refactor`（型安全性・エラー処理カバー）実行
- [ ] 5 ファイル以上の変更のため `evaluator` agent 起動（rules/quality-gate.md 準拠）

### リスク
- **R1**: CSP が Vite HMR を壊す → dev/prod で middleware 設定分岐
- **R2**: サニタイザが Markdown 構造を破壊 → allowlist 調整、既存サンプル小説で目視確認
- **R3**: rate-limit が開発時の動作確認を妨げる → dev は 1000/min 緩和
- **R6**: `.dockerignore` で必要ファイルを誤除外 → Dockerfile の COPY 手順をレビュー、`dist/` `package.json` は除外しない
- **R7**: errorHandler のマスキングでデバッグ性低下 → dev は full stack + body 出力

---

## PR-C: Firebase 初期化準備

ブランチ: `feature/m1-firebase-init`

### 背景
M3（AI 認証ゲート）の前段階として、Firebase Auth/Admin SDK と Emulator を導入。実際の認証ゲート実装は M3 で行う。

### タスク
- [ ] Firebase Console で `novel-writer-dev` プロジェクトの Authentication を有効化
- [ ] Firebase Console で Sign-in method の Google プロバイダを有効化
- [ ] `package.json` に追加: `firebase` (FE), `firebase-admin` (BE), `firebase-tools` (devDep)
- [ ] `firebase.json` 新規作成（emulators: auth のみ、port 9099）
- [ ] `.firebaserc` 新規作成（projectId: novel-writer-dev）
- [ ] `.gitignore` に Firebase debug log 追加: `firebase-debug.log`, `firestore-debug.log`, `ui-debug.log`, `*.log`
- [ ] `server/firebaseAdmin.ts` 新規作成（admin SDK 初期化スタブ、まだルートでは使わない）
- [ ] `package.json` の scripts に追加:
  - [ ] `dev:emu`: Firebase Auth Emulator + Vite を並列起動（concurrently 利用）
  - [ ] `test:firebase-admin`: verifyIdToken の単発検証スクリプト実行
- [ ] `scripts/test-firebase-admin.ts` 新規作成（Emulator 経由で取得した idToken を verify）

### Acceptance Criteria
- [ ] **C1**: Firebase Console で Authentication > Sign-in method > Google が "有効" 表示（スクショを PR description に添付）
- [ ] **C2**: `npm run dev:emu` で Firebase Auth Emulator が `localhost:9099` で起動し、`curl -s http://localhost:9099` が 200
- [ ] **C3**: `npm run test:firebase-admin` でテストスクリプトが PASS（Emulator から idToken 取得 → admin.verifyIdToken() で uid 取得）

### 手動検証手順
1. Firebase Console (https://console.firebase.google.com/project/novel-writer-dev) にアクセス
2. Authentication を有効化、Google プロバイダを ON
3. `npm install`
4. `npm run dev:emu` で Emulator 起動確認
5. 別ターミナルで `npm run test:firebase-admin`

### リスク
- **R4**: Firebase project ID（novel-writer-dev 流用 vs 専用作成）→ 流用採用、追加コストなし
- **R5**: Emulator port 衝突 → 9099/4000/9199 は novel-writer の dev:3000 と無衝突

---

## M1 完了の定義

- [ ] PR-A merged & deployed & AC A1〜A3 全 PASS
- [ ] PR-B merged & local検証完了 & AC B1〜B7 全 PASS
- [ ] PR-C merged & local検証完了 & AC C1〜C3 全 PASS
- [ ] 本ファイル `docs/spec/m1/tasks.md` の全チェックボックスが `[x]`
- [ ] M1 振り返りを ADR 末尾に追記（任意）

## 補足

### 並列実行判断
逐次推奨。理由:
- 自動テストなしのため、各 PR の動作確認に手動工数がかかる
- PR-B は影響範囲が広く、問題発生時に他 PR と切り分け困難
- 個人開発で同時に複数 PR を抱えるのは認知負荷が高い

### dev/prod 設定分岐方針
- `process.env.NODE_ENV === 'production'` で middleware 設定を分岐
- dev は CSP 緩和、rate-limit 緩和、errorHandler full log
- prod は CSP 厳格、rate-limit 本番値、errorHandler マスキング
