# M2: 認証 + IndexedDB 移行 タスク表

- Status: 🚧 In Progress
- Owner: yasushi-honda
- Started: 2026-04-26
- Completed: -
- Related ADR: [ADR-0001](../../adr/0001-local-first-architecture.md)

## ゴール

ADR-0001 で採用した Local-first アーキテクチャの第一段を実装する:

1. **コンテンツ正本をブラウザ IndexedDB（Dexie.js）に移す**（Firestore は退役）
2. **Firebase Auth（Google プロバイダ）を導入し Tier 0 / Tier 1 を区分する**
3. **`/api/projects`・`/api/data` を退役し、Firestore を `users/{uid}` メタのみに縮小する**

これにより M3（AI 認証ゲート + クォータ）に着手可能な状態を作る。

## マイルストーン外スコープ（やらないこと）

- AI 認証ゲート本実装（M3 で実装）
- Cloud Run の `--allow-unauthenticated` 復活（M3 で再検討）
- AI クォータ管理（M3 で実装）
- Stripe 連携（M5 で実装）
- E2EE バックアップ（M6 で実装）
- 複数端末同期（ADR-0001 で不採用方針確定済み）
- 本番 Firestore からの自動データ移行（ユーザーゼロのため対象なし。開発端末の手元データは Export/Import で個別退避）

## PR 構成

| PR | 内容 | 規模 | 工数 | 状態 |
|---|---|---|---|---|
| PR-A | IndexedDB（Dexie.js）導入 + データ永続化レイヤー切替 | 大 | 4〜6 時間 | ⏳ |
| PR-B | Firebase Auth FE 導入 + Tier 0/1 UI | 中 | 2〜3 時間 | ⏳ |
| PR-C | `/api/projects`・`/api/data` 退役 + Firestore メタ縮小 + ID Token 検証ミドルウェア | 中 | 2 時間 | ⏳ |

着手順序: **逐次 A → B → C**（M1 と同方針: 自動テスト未整備のため切り分け容易性を優先）

---

## PR-A: IndexedDB（Dexie.js）導入 + データ永続化レイヤー切替

ブランチ: `feature/m2-indexeddb-migration`

### 背景

ADR-0001 でコンテンツ正本を Firestore からブラウザ IndexedDB（Dexie.js）へ移すことを決定。本 PR で FE のデータレイヤーを完結的に切り替える。サーバー側 `/api/projects` は本 PR では残置（PR-C で退役）し、FE からは呼ばれない状態にする。

### タスク

#### A.1 Dexie 導入とスキーマ定義
- [ ] `package.json` に `dexie` を追加（major v4 系）
- [ ] `src/db/dexie.ts` 新規作成:
  - DB 名: `novelWriterDb`、バージョン: 1
  - object store: `projects`（key: `id`、index: `lastModified`）
  - 各サブコレクション相当（`novelContent`, `chatHistory`, `settings`, `knowledgeBase`, `plotBoard`, `timeline`）は Project の入れ子として 1 ドキュメントに格納（IndexedDB は 1MB 制約なし）
  - `historyTree` は IndexedDB に書かない（メモリのみ、ADR-0001 の方針）
- [ ] `src/db/projectRepository.ts` 新規作成: `listProjects()` / `getProject(id)` / `putProject(project)` / `deleteProject(id)` の 4 関数
- [ ] `types.ts` の Project 型変更なし（既存型のままで Dexie に格納可能）

#### A.2 store の永続化先切替
- [ ] `store/projectSlice.ts`:
  - `createProject` / `importProject` の `createProjectApi(...)` 呼び出しを `putProject(...)` に置換
  - `deleteProject` の `deleteProjectApi(...)` を `deleteProject(...)`（リポジトリ）に置換
- [ ] `store/syncSlice.ts`:
  - `flushSave` の `updateProjectApi(...)` を `putProject(...)` に置換
  - 2 秒 debounce / `beforeunload` / `visibilitychange` フラッシュは維持
- [ ] `hooks/useFirestoreSync.ts` をリネーム: `hooks/useLocalSync.ts`（または同名のまま中身だけ Dexie 向けに書換）

#### A.3 起動シーケンス変更
- [ ] `App.tsx` 起動時:
  - 旧: `fetch('/api/projects')` でリスト取得 → 選択 → `fetch('/api/projects/:id')` で詳細取得
  - 新: `listProjects()` でリスト取得 → 直近選択 → `getProject(id)` で詳細取得
  - 初回起動（projects ゼロ）はチュートリアルプロジェクト生成（既存ロジック流用）
- [ ] エラー時 UI: Dexie が利用できないブラウザ（プライベートモード等）で警告トースト表示

#### A.4 退避運用
- [ ] 開発端末の手元 Firestore データは PR-A マージ前に **手動 Export**（既存の Export 機能を使用）して JSON 退避
- [ ] PR-A マージ後の起動で IndexedDB が空になっていることを確認 → 退避済 JSON を Import で復元
- [ ] 上記手順を本ファイル末尾の「PR-A 切替手順」に明記

### Acceptance Criteria

- [ ] **A1**: DevTools > Application > IndexedDB に `novelWriterDb` (version 1) が存在し、`projects` object store の中に Project レコードが格納されている
- [ ] **A2**: 編集 → 2 秒後 IndexedDB に書込み、Network タブで `/api/projects` 系リクエストが**ゼロ**であることを確認
- [ ] **A3**: ページリロード後、編集内容が保持されている（IndexedDB から復元）
- [ ] **A4**: 新規プロジェクト作成 → リロード → 一覧に表示される
- [ ] **A5**: プロジェクト削除 → IndexedDB の対象レコードが消える（DevTools で確認）
- [ ] **A6**: Import で JSON 取り込み → IndexedDB に格納されリロード後も保持される
- [ ] **A7**: `npm run lint` PASS

### 手動検証手順

1. PR-A マージ前に既存プロジェクトを Export で JSON 退避
2. ブランチ切替後 `npm install`、`npm run dev`
3. 旧 Firestore データが画面に表示されないことを確認（IndexedDB は空）
4. 退避した JSON を Import で復元
5. AC A1〜A7 を順に確認

### 品質ゲート

- [ ] `npm run lint`（型チェック）PASS
- [ ] `/simplify`（reuse / quality / efficiency 3 並列）実行
- [ ] 5 ファイル以上の変更が確実なため `evaluator` agent による Acceptance Criteria 評価を別コンテキストで実行（rules/quality-gate.md 準拠）
- [ ] `/codex review` セカンドオピニオン取得（PR-A は IndexedDB マイグレーションが絡む大規模変更のため）

### リスク

- **R1**: Dexie スキーマ初版で型不整合 → ロード失敗。緩和: `validateAndSanitizeProjectData` を putProject 入口で再利用、Dexie バージョン番号は 1 から開始し将来の migration を考慮
- **R2**: ブラウザのプライベートモード等で IndexedDB が使えない環境 → 警告トースト + メモリのみで動作する degrade パス
- **R3**: 開発端末の手元データ消失 → 切替手順で Export を必須化（本ファイル末尾に明記）
- **R4**: `historyTree` を IndexedDB に書かない方針が誤っているケース（リロードで undo 履歴が失われるのは ADR で受容済みだが、ユーザー混乱の可能性）→ 既存挙動と同等であることをコミット時に再確認

---

## PR-B: Firebase Auth FE 導入 + Tier 0/1 UI

ブランチ: `feature/m2-firebase-auth-fe`

### 背景

ADR-0001 の 3 層プラン（Tier 0: 未ログイン / Tier 1: Google ログイン無料 / Tier 2: Stripe）の Tier 0 / Tier 1 区分を FE で実装。AI 経路の認証ゲート本実装は M3 だが、本 PR で UI 上の Tier 区分（AI ボタン disable / ログイン誘導）と認証状態管理を確立する。

### タスク

#### B.1 Firebase Web SDK 初期化
- [ ] `src/firebaseClient.ts` 新規作成:
  - `initializeApp(...)` で Firebase Web SDK 初期化
  - `getAuth(...)` をエクスポート
  - dev かつ `VITE_USE_AUTH_EMULATOR=true` 時は `connectAuthEmulator(auth, 'http://localhost:9099')` を呼ぶ
  - Firebase config は環境変数 `VITE_FIREBASE_*` から読み込み（API キーは公開前提、ADR の前提通り）
- [ ] `.env.example` 新規作成（Firebase config 項目 + コメント）
- [ ] `.gitignore` に `.env`, `.env.local` を追加（既に存在すれば確認のみ）

#### B.2 authSlice 追加
- [ ] `store/authSlice.ts` 新規作成:
  - state: `currentUser: { uid, email, displayName, photoURL } | null`、`authStatus: 'initializing' | 'unauthenticated' | 'authenticated'`、`authError: string | null`
  - actions: `initAuth()`（onAuthStateChanged 購読）、`signInWithGoogle()`、`signOut()`
  - **Tier 判定は state から派生する derived 値**として `selectTier(state): 0 | 1` を別 export
- [ ] `store/index.ts` で authSlice を結合

#### B.3 起動時 Auth 初期化
- [ ] `App.tsx` 初回 mount で `initAuth()` 呼び出し
- [ ] `authStatus === 'initializing'` の間は AI ボタン disable + ローディング表示

#### B.4 ログイン UI
- [ ] `components/AuthButton.tsx` 新規（ログインボタン / ユーザーメニュー切替）
- [ ] ヘッダーまたは `ActivityBar` の適切な位置に配置（既存レイアウトと整合）
- [ ] ログイン中: Google アイコンボタン → クリックで `signInWithGoogle()`
- [ ] ログイン済み: アバター + メールアドレス + ドロップダウン（ログアウト）

#### B.5 Tier 別 UI 制御
- [ ] AI 関連ボタン（小説生成 / キャラ生成 / 世界観生成 / 画像生成 / 名前生成 / インポート分析等）に `tier: 0 | 1` 必要レベルを定義
- [ ] Tier 0 で必要レベル 1 のボタンは disable + tooltip「ログインして利用してください」
- [ ] AI ボタンに直接 ID Token を付与する処理は **本 PR では入れない**（M3 で導入）

#### B.6 CSP / セキュリティ調整
- [ ] `server/index.ts` の Helmet CSP に Firebase Auth 用ドメインを追加（prod のみ）:
  - `connectSrc`: `'self'`, `https://*.googleapis.com`, `https://*.firebaseapp.com`
  - `frameSrc`: `https://*.firebaseapp.com`, `https://accounts.google.com`
  - `imgSrc` に Google プロフィール画像ドメイン（`https://lh3.googleusercontent.com`）追加
- [ ] dev は CSP 無効のまま（M1 で確定済み）

#### B.7 Emulator 動作確認手順整備
- [ ] `npm run dev:emu` 起動時に `VITE_USE_AUTH_EMULATOR=true` がセットされる仕組みを追加（`concurrently` の env 渡し or `.env.development.local`）
- [ ] Auth Emulator UI（`http://localhost:9099` の console）でテストユーザー作成 → アプリでログイン成功するフロー確立

### Acceptance Criteria

- [ ] **B1**: 起動時 `authStatus = 'initializing'` → onAuthStateChanged 解決後 `unauthenticated` または `authenticated` に遷移する
- [ ] **B2**: 未ログイン状態で AI 関連ボタンが全て disable、tooltip 表示
- [ ] **B3**: ログインボタン押下 → Google ポップアップ → 成功 → ヘッダーにメール表示、AI ボタン enable（prod の Google 本物プロバイダで確認、dev は Emulator）
- [ ] **B4**: ログアウト → AI ボタン disable に戻る、IndexedDB データは保持
- [ ] **B5**: prod ビルドで Firebase Auth ポップアップが CSP に阻害されず動作する（`NODE_ENV=production tsx server/index.ts` で起動 + 実プロジェクトで verify）
- [ ] **B6**: `npm run dev:emu` で起動 → Auth Emulator 経由のログインが完了する
- [ ] **B7**: `npm run lint` PASS

### 手動検証手順

1. Firebase Console で Web アプリ登録（既に登録済の場合は config を `.env.local` にコピー）
2. `npm install`
3. `npm run dev` で実 Firebase で動作確認（または `npm run dev:emu` で Emulator）
4. AC B1〜B6 を順に確認
5. `NODE_ENV=production npm run build && NODE_ENV=production tsx server/index.ts` で prod ビルド確認

### 品質ゲート

- [ ] `npm run lint` PASS
- [ ] `/simplify`
- [ ] 影響ファイル数次第で `/safe-refactor` および `evaluator`
- [ ] `/review-pr` 並列レビュー（特に silent-failure-hunter で「ログイン失敗時の UI 表示なし」等を検出）

### リスク

- **R5**: Firebase Web SDK の API キーがビルドに混入 → 「公開前提」を README/ADR で再確認、CSP で他オリジン経由の悪用を防御
- **R6**: M1 CSP が Firebase Auth ポップアップを阻害 → B.6 で必要なドメインを allowlist
- **R7**: Tier 0 のユーザーが AI ボタン押下時に説明なく無反応 → tooltip + ログインモーダル誘導で UX を担保
- **R8**: Auth Emulator と本物 Firebase の挙動差異 → AC B3 と B6 を分けて確認、差異を docs/adr/ に記録（必要時）

---

## PR-C: `/api/projects`・`/api/data` 退役 + Firestore メタ縮小 + ID Token 検証ミドルウェア

ブランチ: `feature/m2-server-retirement`

### 背景

PR-A 完了で `/api/projects`・`/api/data` は呼ばれない状態になる。本 PR でこれらルートを退役し、Firestore は `users/{uid}` メタ（plan / preferences / createdAt）のみに縮小する。M3 で AI 認証ゲートを実装するための ID Token 検証ミドルウェアもここで先行導入する（`users/{uid}` 書込みエンドポイントで実使用するため）。

### タスク

#### C.1 旧ルート削除
- [ ] `server/routes/projects.ts` 削除
- [ ] `server/routes/data.ts` の責務を確認 → コンテンツ系のみなら削除、それ以外（utility 系）が残っている場合は最小化
- [ ] `server/services/projectService.ts` 削除
- [ ] `server/firestoreClient.ts` の `projectsCollection` 系を削除し、`usersCollection` ヘルパーに置換
- [ ] `projectApi.ts`（FE）削除
- [ ] `server/index.ts` で削除ルートの mount 行を削除

#### C.2 ID Token 検証ミドルウェア
- [ ] `server/middleware/verifyIdToken.ts` 新規作成:
  - `Authorization: Bearer <token>` から ID Token 抽出
  - `getFirebaseAuth().verifyIdToken(token)` で検証
  - 成功時 `req.user = { uid, email }` を注入、失敗時 401
  - dev モードで Auth Emulator 環境変数（`FIREBASE_AUTH_EMULATOR_HOST`）が設定されている場合は Emulator 経由で verify される（admin SDK の標準挙動）
- [ ] エラーハンドリング: rules/error-handling.md §1 に準拠（状態復旧優先、ログ独立 try-catch）

#### C.3 users/{uid} 書込みエンドポイント
- [ ] `server/routes/users.ts` 新規作成: `POST /api/users/init`（ID Token 必須、`{ email, plan: 'free', createdAt: Timestamp.now() }` を `users/{uid}` に **merge** で書込）
- [ ] **Partial Update 安全性**: rules/production-data-safety.md §1 準拠、`undefined` フィールドは事前に除去してから書込（`sanitizeForUpdate` パターン）
- [ ] FE: PR-B の `signInWithGoogle()` 成功後 `fetch('/api/users/init', { headers: { Authorization: 'Bearer ' + idToken }})` を呼ぶ
- [ ] 冪等性: 既存ドキュメントがあれば `email` のみ更新、`plan` と `createdAt` は保持（merge: true + sanitize で実現）

#### C.4 Firestore セキュリティルール（暫定）
- [ ] `firestore.rules` 新規作成:
  - `users/{userId}`: `request.auth.uid == userId` のみ read/write 許可
  - その他は全拒否（M3 で `usage/{uid_yyyymm}` 等を追加）
- [ ] `firebase.json` の emulators に firestore を追加（port 8080）→ ローカルでルールテスト可能に
- [ ] **firestore.rules 変更時のルールユニットテスト**: rules/firebase.md の MUST 項目に従い `@firebase/rules-unit-testing` で最低限のテストを追加（未認証 / 他 uid アクセス拒否 / 自 uid 許可）

#### C.5 ドキュメント更新
- [ ] `CLAUDE.md` の "AI API層" 表から `/api/projects` を削除、`/api/users/init` を追加
- [ ] `CLAUDE.md` の "状態管理" セクションで `syncSlice` の保存先を Firestore → IndexedDB に修正、`authSlice` を追記

### Acceptance Criteria

- [ ] **C1**: `/api/projects/*`・`/api/data` への curl が 404（ルート削除後）
- [ ] **C2**: ログイン直後に `users/{uid}` ドキュメントが Firestore に作成され、`{email, plan: 'free', createdAt}` が含まれる
- [ ] **C3**: Authorization ヘッダーなしで `/api/users/init` を叩くと 401
- [ ] **C4**: 不正な ID Token で 401
- [ ] **C5**: ログイン → 再ログイン（同 uid）で `createdAt` が変更されない（冪等性）
- [ ] **C6**: 他 uid の `users/{otherUid}` に Firestore Emulator 経由で読み書きを試みると拒否される（rules ユニットテストで PASS）
- [ ] **C7**: `npm run lint` PASS、`docker build` 成功

### 手動検証手順

1. `npm install`
2. `npm run dev:emu` で Auth + Firestore Emulator 起動
3. ログイン → DevTools Network で `/api/users/init` が 200 を返す
4. Firestore Emulator UI で `users/{uid}` を確認
5. AC C1〜C6 を順に確認
6. `firebase deploy --only firestore:rules -P novel-writer-dev` でルール本番デプロイ（rules/firebase.md の手動デプロイ手順に従う）

### 品質ゲート

- [ ] `npm run lint` PASS
- [ ] `/simplify`
- [ ] `/safe-refactor`（3 ファイル以上の削除/変更）
- [ ] `evaluator` agent による AC 評価
- [ ] `/review-pr` 並列レビュー（特に silent-failure-hunter で verifyIdToken の例外処理、rules ルールテスト網羅性を検出）

### リスク

- **R9**: `/api/data` に削除すべきでない utility 系が残っているケース → 本 PR 着手時に grep で全呼出元を確認
- **R10**: Firestore ルールの記述ミスで本番データ漏洩 → rules/firebase.md MUST に従いルールユニットテスト必須化、デプロイは `-P novel-writer-dev` で dev のみ
- **R11**: `users/{uid}` 書込みで `null`/`undefined` 混入 → rules/production-data-safety.md §1 sanitize パターン適用
- **R12**: ID Token 検証ミドルウェアの transient エラー（Firebase Auth サービス障害）が permanent エラー扱いになる → rules/error-handling.md §3 に準拠して transient/permanent を分類

---

## M2 完了の定義

- [ ] PR-A merged & local 検証完了 & AC A1〜A7 全 PASS
- [ ] PR-B merged & local 検証完了 & AC B1〜B7 全 PASS
- [ ] PR-C merged & local 検証完了 & AC C1〜C7 全 PASS
- [ ] 本ファイル `docs/spec/m2/tasks.md` の全チェックボックスが `[x]`
- [ ] M2 振り返りを ADR 末尾に追記（M1 と同流儀）
- [ ] ADR-0001 ロードマップ表で M2 を ✅ 完了に更新

## M2 後フォローアップ（M2 完了後に対応、Issue 化はしない）

- **GitHub Actions Node.js 20 廃止対応**: PR #17 の deploy ログ由来の暫定値（2026-06-02 強制 / 2026-09-16 廃止）を、M2 PR 群レビュー待ち時間に公式 [GitHub blog 2025-09-19](https://github.blog/changelog/2025-09-19-deprecation-of-node-20-on-github-actions-runners/) で再確認。必要なら `actions/checkout@v5`、`google-github-actions/auth@v3`、`setup-gcloud@v3`、`deploy-cloudrun@v3` 等の major 追従を独立 PR で実施
- **PR-C 引き継ぎ**: M1 PR-C で先送りした admin SDK スタブの 4 項目（applicationDefault 失敗時 logError、prod の projectId fail-fast、test スクリプトの Anonymous プロバイダ未許可エラー化、`__resetFirebaseAdminAppForTesting()` 露出検討）を、本 M2 PR-C で `verifyIdToken` ミドルウェア導入時に併せて実装

---

## 補足

### PR-A 切替手順（開発端末データ退避）

1. PR-A マージ前のブランチ（main または開発中ブランチ）で以下を実行:
   - 既存プロジェクトを全て「Export」で JSON ダウンロード（プロジェクト数だけ繰り返す）
   - 退避先: `~/Documents/novel-writer-backup-YYYYMMDD/` 等
2. PR-A マージ後、初回起動で IndexedDB が空になっていることを確認
3. 「Import」で退避 JSON を順次取り込み
4. 各プロジェクトの編集が IndexedDB に保存されることを A2 で確認

> **Note**: ユーザーゼロ前提のため自動マイグレーションは実装しない。Firestore に残る旧データは PR-C 完了時点で論理削除（コレクション drop）扱いとする（物理削除は手動で別途実施可）。

### 並列実行判断

逐次推奨。理由:
- 自動テスト未整備のため、各 PR の動作確認に手動工数がかかる
- PR-A は永続化レイヤー総入替で影響範囲が広く、問題発生時に他 PR と切り分け困難
- PR-B / PR-C は PR-A の挙動を前提にするため、論理的に逐次

### dev/prod 設定分岐方針（M1 から踏襲）

- `process.env.NODE_ENV === 'production'` で middleware 設定を分岐（M1 で確定）
- `VITE_USE_AUTH_EMULATOR=true` で FE 側 Firebase Auth Emulator 接続を切替
- prod ビルドでは Auth Emulator への接続コードがバンドルに残らないよう環境変数で完全分岐

### Cloud Run 認証の扱い

- M1 PR-A で `--allow-unauthenticated` を削除済み（IAM レベルで非公開）
- M2 では Cloud Run の IAM 設定は**変更しない**（手元での dev サーバー検証 + 本番デプロイは GitHub Actions の WIF SA で引き続き動作）
- M3 で AI 認証ゲートが本実装された段階で `--allow-unauthenticated` 復活を再検討（アプリ層で守る前提が揃う）
