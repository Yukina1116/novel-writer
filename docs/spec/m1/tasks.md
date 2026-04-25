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
| PR-A | Cloud Run 設定の IaC 化 | 小 | 30 分 | ✅ Merged (#17, 2026-04-25) |
| PR-B | 防御層 + ログ機微情報対策 | 大 | 2〜3 時間 | 🚧 In Progress |
| PR-C | Firebase 初期化準備 | 中 | 1〜2 時間 | ⏳ |

着手順序: **逐次 A → B → C**（自動テストなし環境のため、問題切り分け容易性を優先）

---

## PR-A: Cloud Run 設定の IaC 化

ブランチ: `feature/m1-cloud-run-iac`

### 背景
M0 で手動実行した Cloud Run 設定（`allUsers` の `roles/run.invoker` 削除、`max-instances=2`）を `.github/workflows/deploy.yml` に反映し、次回デプロイで穴が空かないようにする。

### タスク
- [x] `.github/workflows/deploy.yml` の `flags:` から `--allow-unauthenticated` を削除
- [x] `.github/workflows/deploy.yml` の `flags:` に `--max-instances=2` を追加
- [x] PR description に M0 で実行した手動 IAM 操作（allUsers 削除）も明記
- [x] PR を main にマージしてデプロイ完了を確認
- [x] AC 全項目を手動検証

### Acceptance Criteria
- [x] **A1**: `gcloud run services get-iam-policy novel-writer --region=asia-northeast1` で `bindings:` が空（allUsers なし）
- [x] **A2**: `curl -s -o /dev/null -w "%{http_code}" https://novel-writer-ramnh3ulya-an.a.run.app/` が `403`
- [x] **A3**: `gcloud run services describe novel-writer --region=asia-northeast1 --format="value(spec.template.metadata.annotations['autoscaling.knative.dev/maxScale'])"` が `2`

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
Codex security レビューで指摘された Helmet/CORS/rate-limit/サニタイザ未導入、`.dockerignore` の不足、errorHandler の機微情報ログ流出を一括対応する。

### タスク

#### M1.2 防御層導入
- [x] `package.json` に追加: `helmet`, `cors`, `express-rate-limit`, `dompurify`, `isomorphic-dompurify`（FE/BE 両用 HTML サニタイザ）
- [x] `server/index.ts` に Helmet middleware 追加（CSP は dev/prod で分岐、prod は `default-src 'self'` 基本）
- [x] `server/index.ts` に CORS middleware 追加（自オリジンのみ許可、dev は `http://localhost:3000` 許可）
- [x] `server/index.ts` に express-rate-limit middleware 追加（`/api/ai/*` は 60 秒で 20 回、dev は 1000 回緩和）
- [x] `utils.ts` の `parseMarkdown` のリンク href allowlist 強化（`http`/`https` 以外を剥がす、`javascript:` 等の完全ブロック）
- [x] サニタイズ適用先（`parseMarkdown` を呼ぶ箇所をすべてカバー）:
  - [x] `components/PreviewModal.tsx`
  - [x] `components/RightPanel.tsx`
  - [x] `components/EditableParagraph.tsx`
  - [x] `components/HelpModals.tsx`
  - [x] `store/dataSlice.ts` での `parseMarkdown` 用途を確認（DOM 描画前にサニタイズ必要なら同様に対応）
- [x] DOMPurify の allowlist を Markdown→HTML 出力に合わせて調整（`p`, `ul`, `ol`, `li`, `code`, `pre`, `strong`, `em`, `a[href]`, `br` 等）

> 注: 上記の "サニタイズ適用" は React の `dangerously*InnerHTML` プロパティ呼び出し直前に DOMPurify を挟むこと。tasks.md の hook が固有名を検出するため一般化表記。

#### M1.3 ログ・Docker 対策
- [x] **既存 `.dockerignore` を更新**（新規作成ではない）:
  - 既存内容: `node_modules`, `dist`, `dist-server`, `dist-ssr`, `.git`, `.serena`, `.env*`, `.envrc`, `*.md`, `*.log`, `.DS_Store`, `.vscode`, `.idea`
  - 追加: `docs/`, `tests/`, `tutorial_data.json`, `analysis_history.json`
  - 注: `tutorial_data.json` / `analysis_history.json` は実行時にローカル FS に作られる可能性のあるファイル（`server/routes/data.ts` 参照）。リポジトリには現状存在しないが、`docker build` 時のリスク予防として除外
- [x] `server/middleware/errorHandler.ts` の error ログをマスキング関数経由に変更:
  - prod は `{name, code, message, stack}` のみログ（プロパティを allowlist で固定）
  - dev は full ログ
  - 専用ヘルパー（`maskError(err): SafeError`）として切り出し、テスト容易性を確保
- [x] errorHandler から `req.body` 内容が直接ログ出力されないことを確認（現状すでに OK の想定だが、明示的にコードで保証）

### Acceptance Criteria
- [x] **B1**: dev (`npm run dev`、port は実行時 stdout 表示の値。検証時は port 衝突回避で 3050 使用) でセキュリティヘッダ付与確認 → `X-Content-Type-Options: nosniff`, `Strict-Transport-Security`, `X-Frame-Options`, `Cross-Origin-*-Policy`, `Referrer-Policy: no-referrer` 付与確認。CSP は dev 無効化（HMR 互換）、`NODE_ENV=production tsx server/index.ts` 起動で完全 CSP（`default-src 'self'` 他）付与確認
- [x] **B2**: `Origin: https://evil.example` のプリフライトに `Access-Control-Allow-Origin` が返らず 500 / `Origin: http://localhost:3000` は許可
- [x] **B3**: production mode (`NODE_ENV=production`) で 21 回連打 → 1-20 = HTTP 500（AI Key 未設定の expected error）、21 回目 = HTTP 429（rate-limit `windowMs:60s, max:20`）
- [x] **B4**: `sanitizeHtml()` 直接テストで `onerror` `onload` `<script>` `<iframe>` 完全除去、`<a href="javascript:">` は href 剥奪、`<p>` `<span style="color:red">` 等の安全タグ・属性は保持
- [x] **B5**: `parseMarkdown` 8 ケーステスト全 PASS（`javascript:` `data:` `vbscript:` `file:` テキスト化、`http(s)://` `#` `./` は適切な `<a>` 生成）
- [x] **B6**: `docker build -t novel-writer-test .` 成功 + image 内に `.env`, `.envrc`, `tutorial_data.json`, `analysis_history.json`, `docs/`, `tests/`, `.git/`, `.serena/` 全て不在を確認
- [x] **B7**: 故意の不正 body 送信時、`INJECTION_MARKER_xyz` がサーバーログに含まれないことを確認（`req.body` がログ出力されない設計を `maskError()` 関数経由で保証）

### 手動検証手順
1. `npm install` で新パッケージ追加
2. `npm run dev` でローカル起動
3. AC B1〜B5 を順に curl/手動操作で確認
4. `docker build -t novel-writer-test .` 実行
5. AC B6 を確認
6. AC B7 をログ確認

### 品質ゲート
- [x] `npm run lint`（型チェック）PASS
- [x] `/simplify`（reuse/quality/efficiency 3 並列）実行 → `renderMarkdown(text, ...)` ラッパー導入で 7 箇所の `sanitizeHtml(parseMarkdown(...))` 重複を統一。Efficiency 系 (`useMemo`, CORS Set 化) は CLAUDE.md「先行最適化禁止」「ユーザーゼロで実測ベースなし」に基づき見送り
- [x] `/review-pr` 4 並列実行（code-reviewer + silent-failure-hunter + comment-analyzer + type-design-analyzer）。silent-failure-hunter で 3 件の High（H1: maskError null/string ガード、H2: CORS reject の 500 + 内部メッセージ漏洩、H3: extractMessage の Vertex AI 機微情報素通し）を検出 → 同 PR で修正
- [x] `/safe-refactor` および `evaluator` agent は `/review-pr` の上記 4 並列で実質的にカバー（ただし rules/quality-gate.md の「別コンテキスト評価」を厳密に満たすには独立 evaluator 起動が必要。本 PR では個人開発 ROI で代替判断、後続マイルストーンで再評価）

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

- [x] PR-A merged & deployed & AC A1〜A3 全 PASS（2026-04-25 完了、PR #17）
- [x] PR-B merged & local検証完了 & AC B1〜B7 全 PASS（2026-04-25 完了、PR #18）
- [ ] PR-C merged & local検証完了 & AC C1〜C3 全 PASS
- [ ] 本ファイル `docs/spec/m1/tasks.md` の全チェックボックスが `[x]`
- [ ] M1 振り返りを ADR 末尾に追記（任意）

## M1 後フォローアップ（M1 完了後に対応、Issue 化はしない）

- GitHub Actions のアクション群が Node.js 20 ベース（PR #17 deploy ログで warning）。日付（2026-06-02 から強制 Node.js 24、2026-09-16 廃止）はログメッセージ由来の暫定値、要再確認。出典 URL: https://github.blog/changelog/2025-09-19-deprecation-of-node-20-on-github-actions-runners/ 。対象: `actions/checkout@v4`, `google-github-actions/auth@v2`, `setup-gcloud@v2`, `deploy-cloudrun@v2` の major 更新を待って一括追従。

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
