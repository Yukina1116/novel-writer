# Handoff: M2 マイルストーン完了 / PR-C merge + Cloud Run デプロイ成功 / M3 待機

- Session Date: 2026-04-27
- Owner: yasushi-honda
- Status: ✅ 再開可能（M2 マイルストーン完了、M3 待機）

## 今セッションの完了内容

| 区分 | 完了事項 | 成果物 |
|---|---|---|
| 実装 | PR-C 実装（旧 server route 削除 + verifyIdToken + users/init + firestore.rules + rules-unit-testing 15 ケース） | PR #34 / commit `17c91f8` |
| 品質ゲート | `/impl-plan`（ユーザー承認） → `/simplify`（MAJOR 1 + MINOR 2 対処）→ `/safe-refactor`（検出 0）→ `evaluator`（再評価で APPROVE）→ `/review-pr` 6 並列（HIGH 1 + Important 3 + LOW 5 全対応）→ `/codex review`（APPROVE、LOW 1 件 M3 持越） | 7 段階の評価レポート |
| AC 検証 | C1〜C7 全 PASS（curl + Auth/Firestore Emulator + admin REST + docker build） | tasks.md PR-C AC 全 [x] |
| 追加修正 | rules 強化（`updatedAt is timestamp` / `email.size() > 0` / `keys().hasAll`）、`handleApiError` 誤分類解消（route 内 `formatFirestoreError` で 503/500 分類）、authSlice の fetch エラー body 抽出、`isEmulatorMode` を Firestore emulator 単独利用に対応 | commit `17c91f8` |
| マージ | PR #34 squash merge → commit `a56df5b` on main、Cloud Run 自動デプロイ ✅ success（run 24975219523、2m18s） | PR #34 → a56df5b |
| ドキュメント | `docs/spec/m2/tasks.md` PR-C 全 [x] + M2 完了の定義 6 項目 [x]、ADR-0001 ロードマップ表 M2 を ✅ 完了に更新 + M2 振り返り追記、CLAUDE.md "AI API 層" 表更新 | 同 PR |
| 追加 ADR 追記 | `/codex review` 指摘の transient エラーコード拡張（`ECONNREFUSED` / `EAI_AGAIN` / `app/network-error`）を M3 持越項目 #5 として追記 | commit `6294401` |

**M2 マイルストーン完了**（ADR-0001 Local-first アーキテクチャ phase 1 達成）。

## 次セッション開始時の状態

- ブランチ: `main` clean、origin/main と同期済み (commit a56df5b)
- 進行中の feature ブランチ: `docs/handoff-m2-completed` — 本ハンドオフ用
- Open Issue: 0 件
- Open PR: 1 件（本セッションで作る handoff PR）
- グローバル `~/.claude/` への変更なし（プロジェクト CLAUDE.md §1 遵守）
- main 直 push なし、feature ブランチ + PR 運用維持（プロジェクト CLAUDE.md §2 遵守）

## 次のアクション（推奨順）

### 1. 本ハンドオフ PR をレビュー → merge
- `gh pr view <本 PR>` で内容確認
- ユーザー明示認可後 `gh pr merge <PR#> --squash --delete-branch`

### 2. 本番 Firestore rules デプロイ（M3 着手前に実施）
- `firebase deploy --only firestore:rules -P novel-writer-dev`
- rules/firebase.md の手動デプロイ手順を遵守
- デプロイ後、`firestore.rules` 変更が反映されたことを Firebase Console > Firestore > ルール画面で確認
- Cloud Run 経由のアプリは現状 IAM 非公開のため、ブラウザでの動作確認は M3 で `--allow-unauthenticated` 復活時に実施

### 3. GitHub Actions Node 20 廃止対応（M3 着手前の独立 PR）
- 公式 [GitHub blog (2025-09-19)](https://github.blog/changelog/2025-09-19-deprecation-of-node-20-on-github-actions-runners/) を再確認
- PR #34 の Cloud Run デプロイログでも Node 20 deprecation 警告が出ている（`actions/checkout@v4`、`google-github-actions/{auth,setup-gcloud,deploy-cloudrun}@v2` 等）
- `actions/checkout@v5`、`google-github-actions/auth@v3`、`setup-gcloud@v3`、`deploy-cloudrun@v3` 等の major 追従を一括実施
- `2026-06-02` 強制までに完了させる（暫定値、要再確認）

### 4. M3 着手（AI 認証ゲート + クォータ）
- `git checkout main && git fetch && git reset --hard origin/main`
- `git checkout -b feature/m3-ai-auth-gate`（仮ブランチ名）
- M2 PR-C で導入した `verifyIdToken` middleware を `/api/ai/*` に適用
- FE から `Authorization: Bearer <ID Token>` 付与の仕組みを実装
- `usage/{uid_yyyymm}` コレクションを Firestore に追加（クォータ管理）
- `--allow-unauthenticated` 復活の再評価
- `/impl-plan` 起動時、本ハンドオフの「M3 持越項目（5 件）」を実装計画に組み込むこと

## 申し送り事項（重要）

### M3 持越項目（5 件、ADR-0001 M2 振り返りに明記済み）

PR-C で導入した認証 / Firestore 経路の堅牢化を M3 で完成させる必要がある。

1. **CLAUDE.md MUST #5 route Partial Update assertion gap**:
   - `/api/users/init` route が `tx.update` payload に `createdAt`/`plan` を含めないことを **route の挙動として直接 assert する自動テストが未整備**（現状の rules unit test は rules の許可判定であり、route の payload 構築は未検証）
   - M3 で vitest + supertest 基盤を導入する際にこの gap を埋める

2. **FE 側 users/init 失敗 retry signal**:
   - ネットワーク失敗で users/init が落ちても `currentUser` は authenticated のまま、retry signal 無し
   - `needsUserInit` flag を保持して M3 の AI gating で再試行する仕組みを追加

3. **`applicationDefault()` eager init**:
   - ADC 未設定環境では `getFirebaseAdminApp()` が初回 request 時に同期 throw する
   - M3 で起動時 probe（`startServer()` 内で `getFirebaseAuth()` 呼出）を追加して fail-fast 化

4. **型強化**:
   - `AuthedRequest = Request & { user: { uid: string; email: string | null } }` を export し、verifyIdToken 通過後の handler 引数型に使う（type-design-analyzer 指摘）
   - `sanitizeForUpdate` の戻り値型を `{ [K in keyof T]: Exclude<T[K], undefined> }` に変更し undefined フリーを型で表現

5. **`verifyIdToken` の transient エラーコード拡張**:
   - 現状の `TRANSIENT_AUTH_CODES` Set は `auth/internal-error` / `auth/network-request-failed` / `auth/service-unavailable` + `ETIMEDOUT` / `ECONNRESET` / `ENOTFOUND` をカバー
   - `ECONNREFUSED` / `EAI_AGAIN` / `app/network-error` 形式が permanent (401) に落ちる余地（`/codex review` 指摘）
   - M2 では実害トースト誤分類程度なので、M3 で AI 認証ゲート適用前に広げる

### Firestore transient 分類の汎用化

PR-C では users/init で inline に `formatFirestoreError`（503/500 分類）を実装したが、AI 経路でも同等の処理が必要。M3 で `verifyIdToken` を AI 経路に展開するタイミングで `handleApiError` を Firestore エラーコードに対応させ共通化する（rules/error-handling.md §3 準拠）。

### PR-C で確定した重要設計判断

- **firestore.rules の Admin SDK bypass + 二重防御**: Admin SDK 経由の `/api/users/init` は rules を bypass するため、route 側で `sanitizeForUpdate` + plan enum + email 型/長さ検証を二重化。同時に rules 側でも `keys().hasOnly + hasAll + is timestamp + size() > 0 + plan in [...]` を全網羅
- **transaction による冪等性**: `runTransaction` 内で `tx.get(ref)` → `!snap.exists ? tx.set(...) : tx.update(...)` 分岐。`merge: true` 単独では `createdAt` が再ログインで上書きされるため transaction 必須
- **`/api` 404 fallback**: 削除した旧 API への curl が SPA fallback で 200 HTML を返す問題を AC C1 検証中に発見、`app.use('/api', (_req, res) => res.status(404).json(...))` を追加。dev/prod とも未登録 API パスは確実に 404
- **`isEmulatorMode` の OR 条件化**: `FIREBASE_AUTH_EMULATOR_HOST` または `FIRESTORE_EMULATOR_HOST` のいずれかで credential 省略。Firestore emulator 単独利用時の ADC 未設定クラッシュを予防

### Out of scope / フォローアップ候補（Issue 化は triage 基準を満たした時点で）

CLAUDE.md triage 基準（rating ≥ 7 + confidence ≥ 80 / 実害あり / 再現バグ / CI 破壊 / ユーザー明示指示）を満たさないため現時点で Issue 化せず、ADR M2 振り返りに集約:

- 上記 M3 持越項目 5 件
- pre-existing 課題: `index.html` の `cdn.tailwindcss.com` runtime → 本来 PostCSS plugin 化、`aistudiocdn.com` の importmap → bundle 化推奨（PR #29 / #31 / #34 共通の Out of scope）
- silent-failure-hunter の earlier 指摘（C-1 / H-1）は authSlice / firebaseClient の white screen 系で M3 でカバー予定
- type-design-analyzer の earlier 指摘 3 件（`createAuthSlice` (set, get) / `RequiresAuthState` / `REQUIRED_KEYS` 型）も M3 の型強化で一括対応

### 環境状況

- `.envrc` 設定済（GH_TOKEN 自動取得 + GCP `novel-writer-dev`）
- `cd ~/Projects/学校/yamashita/novel-writer && claude` で起動すれば direnv 経由で正しいアカウントが有効化される
- Firebase Web App ID `1:446321146441:web:285a9e0bbd4146e15b1d98`（`novel-writer-dev-web`）— SDK config は `.env.local`（gitignore）
- `npm run dev:emu` で Auth + Firestore Emulator（auth: 9099 / firestore: 8080）並列起動 + env 注入
- 残留 Node プロセスなし

## Issue Net 変化

- Close 数: 0 件
- 起票数: 0 件
- Net: 0 件
- **進捗の質**: Net = 0 だが「進捗ゼロ扱い」ではない。本セッションでは M2 マイルストーン最終 PR（#34）を merge し、ADR-0001 Local-first アーキテクチャ phase 1 を達成。M3 持越項目 5 件は ADR / 本ハンドオフに集約済みで、CLAUDE.md triage 基準（rating ≥ 7 + confidence ≥ 80 / 実害あり / 再現バグ）を満たさないため Issue 化していない（過剰起票防止、`feedback_issue_triage.md` 準拠）

## ドキュメント整合性

| 項目 | 状態 | 備考 |
|---|---|---|
| `docs/spec/m2/tasks.md` PR-A〜PR-C 全タスク | ✅ 全 [x] | PR-C で全章完了 |
| `docs/spec/m2/tasks.md` M2 完了の定義 6 項目 | ✅ 全 [x] | PR-C merge で達成 |
| `docs/spec/m2/tasks.md` Status / Completed | ✅ Completed / 2026-04-27 | PR-C で更新 |
| ADR-0001 ロードマップ表 M2 | ✅ 完了 | PR-C で更新済 |
| ADR-0001 M2 振り返り | ✅ 追記済 | M3 持越 5 項目 + 設計判断含む |
| `CLAUDE.md` "API 層" 表 | ✅ 更新済 | `/api/projects` 削除 + `/api/users/init` 追加 + verifyIdToken middleware 言及 |
| `CLAUDE.md` "状態管理" セクション | ✅ 更新済（前セッション PR #33） | IndexedDB 反映 + authSlice 追記 |
| `firestore.rules` 本番デプロイ | ⏳ 未実行 | 次のアクション §2 で M3 着手前に手動デプロイ |
| GitHub Actions Node 20 廃止対応 | ⏳ 未対応 | 次のアクション §3 で独立 PR |

## 残留プロセス

✅ なし
