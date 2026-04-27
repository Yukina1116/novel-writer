# M2: 認証 + IndexedDB 移行 タスク表

- Status: ✅ Completed
- Owner: yasushi-honda
- Started: 2026-04-26
- Completed: 2026-04-27
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

## ログイン切替時のローカルデータ境界（M2 全 PR 共通の前提）

ADR-0001 の Local-first 方針に基づき、IndexedDB は **uid に紐付けない** 単一 DB として扱う:

| 操作 | IndexedDB の扱い |
|---|---|
| 起動（未ログイン） | 既存 IndexedDB をそのまま読み込み（Tier 0 で執筆可能） |
| ログイン成功 | IndexedDB は変更しない（uid 紐付けなし）。Firestore `users/{uid}` のメタのみ初期化 |
| ログアウト | IndexedDB は削除しない・切替もしない |
| 別 Google アカウントでログイン | IndexedDB は共有（端末利用者は同一前提） |

> **理由**: ADR-0001 でコンテンツはローカル正本・複数端末同期しない方針を採用済み。IndexedDB を uid 単位で分離するとログイン前のローカル執筆データが消失リスクに晒され、また「別端末で続きを書くには Export/Import」の前提と矛盾する。共用 PC リスクは現スコープ外（M5 以降の利用規約で明示）。

## PR 構成

| PR | 内容 | 規模 | 工数 | 状態 |
|---|---|---|---|---|
| PR-A | IndexedDB（Dexie.js）導入 + 永続化レイヤー切替（projects + tutorial + analysisHistory） | 大 | 5〜7 時間 | ✅ AC PASS |
| PR-B | Firebase Auth FE 導入 + Tier 0/1 UI | 中 | 2〜3 時間 | ✅ |
| PR-C | `/api/projects`・`/api/data` 退役 + Firestore メタ縮小 + ID Token 検証ミドルウェア + firestore.rules 初版 | 中 | 2〜3 時間 | ✅ AC PASS |

着手順序: **逐次 A → B → C**（M1 と同方針: 自動テスト未整備のため切り分け容易性を優先）

---

## PR-A: IndexedDB（Dexie.js）導入 + 永続化レイヤー切替

ブランチ: `feature/m2-indexeddb-migration`

### 背景

ADR-0001 でコンテンツ正本を Firestore からブラウザ IndexedDB（Dexie.js）へ移すことを決定。本 PR で FE のデータレイヤーを完結的に切り替える。サーバー側 `/api/projects`・`/api/data` は本 PR では残置（PR-C で退役）し、FE からは呼ばれない状態にする。

`server/routes/data.ts` の責務（tutorial 進捗・analysis history のサーバー FS 書込）も本 PR で IndexedDB に統合する（Cloud Run はファイルシステム揮発で本来 dev のみ動作していた経路）。

### タスク

#### A.1 Dexie 導入とスキーマ定義
- [x] `package.json` に `dexie` を追加（major v4 系）
- [x] `db/dexie.ts` 新規作成（プロジェクトルート直下、本リポジトリは `src/` 配下を使わないフラット構成）:
  - DB 名: `novelWriterDb`、バージョン: 1
  - object store: `projects`（key: `id`、index: `lastModified`）
  - 各サブコレクション相当（`novelContent`, `chatHistory`, `settings`, `knowledgeBase`, `plotBoard`, `timeline`）は Project の入れ子として 1 ドキュメントに格納
  - `historyTree` は **永続化対象外**（メモリのみ、ADR-0001 改訂版と整合: 最大10ノード、リロードでリセット）
  - 追加 object store: `tutorialState`（key: `version`、tutorial 完了フラグ等）、`analysisHistory`（key: `id` の auto-increment、最大件数は実装時に既存実装と整合）
- [x] `db/projectRepository.ts` 新規作成: `listProjects()` / `getProject(id)` / `putProject(project)` / `deleteProject(id)`
- [x] `db/tutorialRepository.ts` 新規作成: 既存 `/api/data` の tutorial 系 GET/PUT 互換 API
- [x] `db/analysisHistoryRepository.ts` 新規作成: 既存 `/api/data` の analysisHistory 系 GET/PUT 互換 API
- [x] `types.ts` の Project 型は変更なし（既存型のまま Dexie に格納可能）

> **Note**: IndexedDB は Firestore の 1MiB document 制約を解消するが、ブラウザ quota / 巨大単一レコードの structured clone コスト / 保存失敗時の部分復旧性は残る（R2, R8 参照）。

#### A.2 store の永続化先切替
- [x] `store/projectSlice.ts`:
  - `createProject` / `importProject` の `createProjectApi(...)` 呼び出しを `putProject(...)` に置換
  - `deleteProject` の `deleteProjectApi(...)` を `deleteProject(...)`（リポジトリ）に置換
- [x] `store/syncSlice.ts`:
  - `flushSave` の `updateProjectApi(...)` を `putProject(...)` に置換
  - 2 秒 debounce / `beforeunload` / `visibilitychange` フラッシュは維持
- [x] `store/tutorialSlice.ts`: `/api/data` 経由の tutorial 永続化を `tutorialRepository` 経由に置換
- [x] `store/analysisHistorySlice.ts`: `/api/data` 経由の analysisHistory 永続化を `analysisHistoryRepository` 経由に置換
- [x] `hooks/useFirestoreSync.ts` をリネーム: `hooks/useLocalSync.ts`（中身も Dexie 向けに書換）

#### A.3 起動シーケンス変更
- [x] `App.tsx` 起動時:
  - 旧: `fetch('/api/projects')` でリスト取得 → `fetch('/api/projects/:id')` で詳細取得
  - 新: `listProjects()` でリスト取得 → `getProject(id)` で詳細取得
  - 初回起動（projects ゼロ）はチュートリアルプロジェクト生成（既存ロジック流用）
- [x] tutorial 状態 / analysisHistory 復元も IndexedDB 経由に
- [x] エラー時 UI: Dexie が利用できないブラウザ（プライベートモード等）で警告トースト表示
- [x] 全データ Export / Import の対象に tutorial state と analysisHistory を含めるか判断（Export スキーマ後方互換性を優先する場合は projects のみ維持、tutorial 状態は破棄可能）

#### A.4 退避運用 / マイグレーション安全策
- [x] 開発端末の手元 Firestore データは PR-A マージ前に **手動 Export**（既存の Export 機能を使用）して JSON 退避（ユーザー指示により本検証セッションでは不要扱い）
- [x] PR-A マージ後の起動で IndexedDB が空になっていることを確認 → 退避済 JSON を Import で復元（A6 検証で sanitize 経路含めて確認済み）
- [x] Import 経路で旧 Firestore 由来の内部フィールド（`_order` 等、`server/services/projectService.ts` の `replaceSubcollection` 由来）が混入する可能性 → `validateAndSanitizeProjectData` で除去するロジックを Import 経路で再確認
- [x] 上記手順を本ファイル末尾の「PR-A 切替手順」に明記

### Acceptance Criteria

> 2026-04-26 検証完了: 全 AC PASS。検証は Playwright MCP + DevTools console 経由で実施（手順は PR #24 description 参照）。

- [x] **A1**: DevTools > Application > IndexedDB に `novelWriterDb` (version 1) が存在し、`projects` / `tutorialState` / `analysisHistory` の 3 object store が見える
- [x] **A2**: 編集 → 2 秒後 IndexedDB に書込み。Network タブで以下が **全て 0 件**:
  - Filter `/api/projects` → 0 件
  - Filter `/api/data` → 0 件
- [x] **A3**: ページリロード後、編集内容が保持されている（IndexedDB から復元）
- [x] **A4**: 新規プロジェクト作成 → リロード → 一覧に表示される
- [x] **A5**: プロジェクト削除 → IndexedDB の対象レコードが消える（DevTools で確認）
- [x] **A6**: Import で JSON 取り込み → IndexedDB に格納されリロード後も保持される。Import した JSON に `_order` 等の内部フィールドが含まれていても sanitize で除去される
- [x] **A7**: tutorial 進捗を進めて → リロード → 進捗が保持されている
- [x] **A8**: analysisHistory に分析結果を追加 → リロード → 履歴が保持されている（lazy load: ImportTextModal 開閉で復元）
- [x] **A9**: `npm run lint` PASS

### 手動検証手順

1. PR-A マージ前に既存プロジェクトを Export で JSON 退避
2. ブランチ切替後 `npm install`、`npm run dev`
3. 旧 Firestore データが画面に表示されないことを確認（IndexedDB は空）
4. 退避した JSON を Import で復元
5. AC A1〜A9 を順に確認

### 品質ゲート

- [x] `npm run lint`（型チェック）PASS
- [x] `/simplify`（reuse / quality / efficiency 3 並列）実行
- [x] 5 ファイル以上の変更が確実なため `evaluator` agent による Acceptance Criteria 評価を別コンテキストで実行（rules/quality-gate.md 準拠）
- [x] `/codex review` セカンドオピニオン取得（PR-A は IndexedDB マイグレーションが絡む大規模変更のため）
- [x] M1 PR-B 同様、`/review-pr` 4 並列レビューで evaluator を実質代替する場合は ROI を着手後に再評価（rules/quality-gate.md §発動条件と照合） → `/review-pr` 6 並列を実施し evaluator と相補運用

### リスク

- **R1**: Dexie スキーマ初版で型不整合 → ロード失敗。緩和: `validateAndSanitizeProjectData` を `putProject` 入口で再利用、Dexie バージョン番号は 1 から開始し将来の migration を考慮
- **R2**: ブラウザのプライベートモード等で IndexedDB が使えない、または quota 不足 → 警告トースト + メモリのみで動作する degrade パス、保存失敗時に Export を促す UI
- **R3**: 開発端末の手元データ消失 → 切替手順で Export を必須化（本ファイル末尾に明記）
- **R4**: `historyTree` 永続化なし方針で、リロード後 undo 履歴が失われる（ADR-0001 改訂版で受容済み・明示）→ UI で「リロードで undo 履歴がリセットされる」旨を必要なら表示
- **R5**: tutorial / analysisHistory の永続化先変更により Cloud Run dev サーバーで動作していた既存 e2e フローが壊れる → 着手時に `grep -rn "/api/data" .` で全呼出元を一覧化し、置換漏れを防ぐ
- **R8**: 単一 Project が巨大化（数十万字 + 大量画像 base64 等）した場合の structured clone コスト → 既存仕様の上限（実装時に確認）を超えた場合の挙動を AC 外でも目視確認

---

## PR-B: Firebase Auth FE 導入 + Tier 0/1 UI

ブランチ: `feature/m2-firebase-auth-fe`

### 背景

ADR-0001 の 3 層プラン（Tier 0: 未ログイン / Tier 1: Google ログイン無料 / Tier 2: Stripe）の Tier 0 / Tier 1 区分を FE で実装。AI 経路の認証ゲート本実装は M3 だが、本 PR で UI 上の Tier 区分（AI ボタン disable / ログイン誘導）と認証状態管理を確立する。

ログイン切替時の IndexedDB の扱いは本ファイル冒頭「ログイン切替時のローカルデータ境界」を厳守する（uid 紐付けなし、ログアウト時データ保持）。

### タスク

#### B.1 Firebase Web SDK 初期化
- [x] `firebaseClient.ts` 新規作成（プロジェクトルート直下、フラット構成）:
  - `initializeApp(...)` で Firebase Web SDK 初期化
  - `getAuth(...)` をエクスポート
  - dev かつ `VITE_USE_AUTH_EMULATOR=true` 時は `connectAuthEmulator(auth, 'http://localhost:9099')` を呼ぶ
  - Firebase config は環境変数 `VITE_FIREBASE_*` から読み込み（API キーは公開前提、ADR の前提通り）
- [x] `.env.example` 新規作成（Firebase config 項目 + コメント）
- [x] `.gitignore` に `.env`, `.env.local` を追加（既に存在すれば確認のみ）

#### B.2 authSlice 追加
- [x] `store/authSlice.ts` 新規作成:
  - state: `currentUser: { uid, email, displayName, photoURL } | null`、`authStatus: 'initializing' | 'unauthenticated' | 'authenticated'`、`authError: string | null`
  - actions: `initAuth()`（onAuthStateChanged 購読）、`signInWithGoogle()`、`signOut()`
  - **ログイン/ログアウトで IndexedDB に手を入れない** ことをコード/コメントで明示
  - **Tier 判定は state から派生する derived 値**として `selectTier(state): 0 | 1` を別 export
- [x] `store/index.ts` で authSlice を結合

#### B.3 起動時 Auth 初期化
- [x] `App.tsx` 初回 mount で `initAuth()` 呼び出し
- [x] `authStatus === 'initializing'` の間は AI ボタン disable + ローディング表示

#### B.4 ログイン UI
- [x] `components/AuthButton.tsx` 新規（ログインボタン / ユーザーメニュー切替）
- [x] ヘッダーまたは `ActivityBar` の適切な位置に配置（既存レイアウトと整合）
- [x] ログイン中: Google アイコンボタン → クリックで `signInWithGoogle()`
- [x] ログイン済み: アバター + メールアドレス + ドロップダウン（ログアウト）

#### B.5 Tier 別 UI 制御
- [x] AI 関連ボタン（小説生成 / キャラ生成 / 世界観生成 / 画像生成 / 名前生成 / インポート分析等）に必要 Tier を定義
- [x] **着手時に `grep -rn "fetch.*'/api/ai" .` で全呼出元を一覧化** し AC B2 のチェック対象を確定
- [x] Tier 0 で必要レベル 1 のボタンは disable + tooltip「ログインして利用してください」
- [x] AI ボタンに直接 ID Token を付与する処理は **本 PR では入れない**（M3 で導入）

#### B.6 CSP / セキュリティ調整
- [x] `server/index.ts` の Helmet CSP に Firebase Auth 用ドメインを追加（prod のみ）:
  - `connectSrc`: `'self'`, `https://*.googleapis.com`, `https://*.firebaseapp.com`, `https://identitytoolkit.googleapis.com`, `https://securetoken.googleapis.com`
  - `frameSrc`: `https://*.firebaseapp.com`, `https://accounts.google.com`
  - `imgSrc` に Google プロフィール画像ドメイン（`https://lh3.googleusercontent.com`）追加
- [x] dev は CSP 無効のまま（M1 で確定済み）
- [x] **CSRF / 認証方式の方針明示**:
  - Cookie / session auth は導入しない
  - 認証は `Authorization: Bearer <ID Token>` 一択（FE が AI 経路で M3 から付与）
  - `cors` の allowlist は M1 のまま維持（自オリジン以外拒否）

#### B.7 Emulator 動作確認手順整備
- [x] `npm run dev:emu` 起動時に `VITE_USE_AUTH_EMULATOR=true` がセットされる仕組みを追加（`concurrently` の env 渡し or `.env.development.local`）
- [x] Auth Emulator UI（`http://localhost:9099` の console）でテストユーザー作成 → アプリでログイン成功するフロー確立

### Acceptance Criteria

> 2026-04-27 検証完了: 全 AC PASS（Pre-flight + B1〜B8 + B3-err1/B3-err2）。検証は Playwright MCP + Firebase Auth Emulator 経由で実施（手順詳細は PR #29 description Test plan セクション参照）。

- [x] **B1**: 起動時 `authStatus = 'initializing'` → onAuthStateChanged 解決後 `unauthenticated` または `authenticated` に遷移する
- [x] **B2**: 未ログイン状態で AI 関連ボタン（B.5 で一覧化したもの）が全て disable、tooltip 表示（静的 grep で 17 箇所網羅 + 動的 1 箇所確認）
- [x] **B3**: ログインボタン押下 → Google ポップアップ → 成功 → ヘッダーにメール表示、AI ボタン enable（Email/Password emulator + signInWithEmailAndPassword で uid/email 取得、Tier 0 解除確認）
  - **dev サーバー**または **`NODE_ENV=production npm run build && NODE_ENV=production tsx server/index.ts` のローカル prod ビルド** で確認
  - **prod Cloud Run（IAM 非公開中）でのブラウザ確認は M2 範囲外**: Firebase ID Token は Cloud Run の invoker トークンと無関係なため、`--allow-unauthenticated` 復活までブラウザ経由では到達できない（M3 で再評価）
- [x] **B4**: ログアウト → AI ボタン disable に戻る、IndexedDB データは保持（signOut(auth) 直後 IDB before=after=1 件、id 同一）
- [x] **B5**: ローカル prod ビルドで Firebase Auth ポップアップが CSP に阻害されず動作する（CSP error 0 件、UI 正常 render）。**検証中に修正**: CSP `scriptSrc`/`styleSrc`/`fontSrc` に既存 CDN 依存を追加 + `cors` の origin function を「同一ホストなら許可」に拡張
- [x] **B6**: `npm run dev:emu` で起動 → Auth Emulator 経由のログインが完了する（with caveat: `signInWithPopup` の callback 自動完結は Playwright headless 制約で不安定、`signInWithEmailAndPassword` 経由で emulator フローを実証）
- [x] **B7**: 別 Google アカウントでログインし直しても IndexedDB の既存プロジェクトが残っている（uid 切替で消えない）。account A → signOut → account B で `idbCountStableAcrossAccountSwitch=true`、`idbIdsIdenticalAcrossSwitch=true`
- [x] **B8**: `npm run lint` PASS

#### 追加検証 (PR description Test plan)

- [x] **Pre-flight (fail-fast)**: `.env.local` の `VITE_FIREBASE_API_KEY` を空にして起動 → Console error `Firebase config missing required VITE_FIREBASE_* env: apiKey` 出力を確認
- [x] **B3-err1 (popup blocked)**: `window.open` を null 返却に mock → ログインボタン → toast「ポップアップがブロックされました…auth/popup-blocked」表示
- [x] **B3-err2 (user cancel)**: popup を即 close → 30 サンプル中 toast 出現 0 件（silent）

### 手動検証手順

1. Firebase Console で Web アプリ登録（既に登録済の場合は config を `.env.local` にコピー）
2. `npm install`
3. `npm run dev` で実 Firebase で動作確認（または `npm run dev:emu` で Emulator）
4. AC B1〜B7 を順に確認
5. `NODE_ENV=production npm run build && NODE_ENV=production tsx server/index.ts` でローカル prod ビルド確認

### 品質ゲート

- [x] `npm run lint` PASS
- [x] `/simplify`
- [x] 影響ファイル数次第で `/safe-refactor` および `evaluator`
- [x] `/review-pr` 並列レビュー（特に silent-failure-hunter で「ログイン失敗時の UI 表示なし」「authError ハンドリング漏れ」等を検出）

### リスク

- **R6**: Firebase Web SDK の API キーがビルドに混入 → 「公開前提」を README/ADR で再確認、CSP で他オリジン経由の悪用を防御
- **R7**: M1 CSP が Firebase Auth ポップアップを阻害 → B.6 で必要なドメインを allowlist
- **R9**: Tier 0 のユーザーが AI ボタン押下時に説明なく無反応 → tooltip + ログインモーダル誘導で UX を担保
- **R10**: Auth Emulator と本物 Firebase の挙動差異 → AC B3 と B6 を分けて確認、差異を docs/adr/ に記録（必要時）
- **R11**: 別 uid でログインしてもローカルコンテンツが共有される設計 → 利用規約/UI で「端末利用者は同一前提」を明示（M5 の利用規約整備で本格対応、M2 では設計判断のみ確定）

---

## PR-C: `/api/projects`・`/api/data` 退役 + Firestore メタ縮小 + ID Token 検証ミドルウェア

ブランチ: `feature/m2-server-retirement`

### 背景

PR-A 完了で `/api/projects`・`/api/data` は呼ばれない状態になる。本 PR でこれらルートを退役し、Firestore は `users/{uid}` メタ（plan / preferences / createdAt）のみに縮小する。M3 で AI 認証ゲートを実装するための ID Token 検証ミドルウェアもここで先行導入する（`users/{uid}` 書込みエンドポイントで実使用するため）。

### タスク

#### C.1 旧ルート削除 + Firestore client の admin SDK 統合
- [x] `server/routes/projects.ts` 削除
- [x] `server/routes/data.ts` 削除（PR-A で全呼出元が IndexedDB に移行済み）
- [x] `server/services/projectService.ts` 削除
- [x] `server/firestoreClient.ts` 削除し、firestore も `firebase-admin/firestore` の `getFirestore(getFirebaseAdminApp())` 経由に統合（admin SDK で auth と firestore を共有 = `FIRESTORE_EMULATOR_HOST` 自動検出も一本化）
- [x] `projectApi.ts`（FE）削除
- [x] `server/index.ts` で削除ルートの mount 行を削除

#### C.2 ID Token 検証ミドルウェア
- [x] `server/middleware/verifyIdToken.ts` 新規作成:
  - `Authorization: Bearer <token>` から ID Token 抽出
  - `getFirebaseAuth().verifyIdToken(token)` で検証
  - 成功時 `req.user = { uid, email }` を注入、失敗時 401
  - **transient/permanent 分類** (rules/error-handling.md §3): Firebase Auth サービス障害（503/timeout）は **401 ではなく 503** で透過し FE は再試行を促す。invalid/expired token は 401（permanent）
- [x] **Emulator 経路の env 注入**: `server/index.ts` で `verifyIdToken` を `users/init` に mount する前に、`scripts/_setup-emulator-env.ts`（M1 PR-C 由来）と同等の副作用 import を行うか、`dev:emu` script 側で `FIREBASE_AUTH_EMULATOR_HOST=localhost:9099` を export する
- [x] エラーハンドリング: rules/error-handling.md §1 に準拠（状態復旧優先、ログ独立 try-catch）

#### C.3 users/{uid} 書込みエンドポイント（冪等 init）
- [x] `server/routes/users.ts` 新規作成: `POST /api/users/init`（ID Token 必須）
- [x] **冪等性は transaction で実現** （`merge: true` 単独では `createdAt` が再ログインで上書きされるため不可）:
  ```
  await db.runTransaction(async (tx) => {
    const ref = usersCollection().doc(uid);
    const snap = await tx.get(ref);
    if (!snap.exists) {
      tx.set(ref, sanitizeForUpdate({ email, plan: 'free', createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }));
    } else {
      tx.update(ref, sanitizeForUpdate({ email, updatedAt: FieldValue.serverTimestamp() }));
    }
  });
  ```
- [x] **Partial Update 安全性**: rules/production-data-safety.md §1 準拠、`undefined` フィールドは事前に除去（`sanitizeForUpdate`）
- [x] FE: PR-B の `signInWithGoogle()` 成功後 `fetch('/api/users/init', { method: 'POST', headers: { Authorization: 'Bearer ' + idToken }})` を呼ぶ

#### C.4 Firestore セキュリティルール（暫定）+ Emulator 拡張
- [x] `firestore.rules` 新規作成:
  - `users/{userId}`:
    - `request.auth != null && request.auth.uid == userId` のみ read 許可
    - create: `request.resource.data.keys().hasOnly(['email', 'plan', 'createdAt', 'updatedAt']) && request.resource.data.email is string && request.resource.data.plan in ['free']`
    - update: 既存 `createdAt` を変更不可（`request.resource.data.createdAt == resource.data.createdAt`）、`email is string`、`plan in ['free']`、`keys().hasOnly([...])`
  - その他全コレクションは全拒否（M3 で `usage/{uid_yyyymm}` 等を追加）
- [x] **Admin SDK 経由の `/api/users/init` は rules を bypass する**ため、同等の schema validation（keys allowlist / enum / null 拒否）を route 側でも必須化（C.3 の `sanitizeForUpdate` + 入力検証で実装）
- [x] `firebase.json` の emulators に firestore（port 8080）を追加
- [x] `package.json` の `dev:emu` script を `firebase emulators:start --only auth,firestore` に拡張
- [x] **firestore.rules 変更時のルールユニットテスト** (rules/firebase.md MUST 項目):
  - `@firebase/rules-unit-testing` で `initializeTestEnvironment` 採用
  - 必須テスト: 未認証拒否 / 他 uid 拒否 / 自 uid 許可 / null email 拒否 / plan 不正値拒否 / createdAt 改ざん拒否 / 余分フィールド拒否

#### C.5 ドキュメント更新
- [x] `CLAUDE.md` の "AI API層" 表から `/api/projects` を削除、`/api/users/init` を追加
- [x] `CLAUDE.md` の "状態管理" セクションで `syncSlice` の保存先を Firestore → IndexedDB に修正、`authSlice` を追記、`tutorialSlice` / `analysisHistorySlice` も IndexedDB 化を反映

### Acceptance Criteria

- [x] **C1**: `/api/projects/*`・`/api/data` への curl が 404（ルート削除後）
- [x] **C2**: ログイン直後に `users/{uid}` ドキュメントが Firestore に作成され、`{email, plan: 'free', createdAt, updatedAt}` が含まれる
- [x] **C3**: Authorization ヘッダーなしで `/api/users/init` を叩くと 401
- [x] **C4**: 不正な ID Token で 401。Firebase Auth サービス障害シミュレーション（mock）で 503
- [x] **C5**: ログイン → 再ログイン（同 uid）で `createdAt` が変更されない、`updatedAt` のみ更新される（transaction 経路の冪等性）
- [x] **C6**: Firestore Emulator + rules ユニットテスト全 PASS:
  - 未認証で `users/{x}` read/write → DENIED
  - 他 uid の `users/{otherUid}` を自分の token で read/write → DENIED
  - 自 uid で正常書込（許可フィールドのみ） → ALLOWED
  - 自 uid で `email: null` → DENIED
  - 自 uid で `plan: 'pro'` → DENIED
  - 自 uid で `createdAt` を改ざん（update） → DENIED
  - 自 uid で `extra: 'x'` 等の許可外フィールド → DENIED
- [x] **C7**: `npm run lint` PASS、`docker build` 成功

> 2026-04-27 検証完了: 全 AC PASS。検証は `npm run dev:emu`（Auth + Firestore Emulator 並列） + curl + Firestore REST（Emulator admin bypass `Authorization: Bearer owner`）+ `npm run test:firestore-rules`（12 ケース全 PASS、evaluator 指摘で read ALLOWED + update ALLOWED を追加）で実施。

### 手動検証手順

1. `npm install`
2. `npm run dev:emu` で Auth + Firestore Emulator 起動（C.4 で拡張済）
3. ログイン → DevTools Network で `/api/users/init` が 200 を返す
4. Firestore Emulator UI で `users/{uid}` を確認
5. AC C1〜C7 を順に確認
6. ルールユニットテストを実行（`@firebase/rules-unit-testing`）して全 PASS
7. `firebase deploy --only firestore:rules -P novel-writer-dev` でルール本番デプロイ（rules/firebase.md の手動デプロイ手順に従う）

### 品質ゲート

- [x] `npm run lint` PASS
- [x] `/simplify`
- [x] `/safe-refactor`（3 ファイル以上の削除/変更）
- [x] `evaluator` agent による AC 評価
- [x] `/review-pr` 並列レビュー（特に silent-failure-hunter で verifyIdToken の transient/permanent 分類、rules ユニットテスト網羅性を検出）

### リスク

- **R12**: Firestore ルールの記述ミスで本番データ漏洩 → rules/firebase.md MUST に従いルールユニットテスト必須化、デプロイは `-P novel-writer-dev` で dev のみ
- **R13**: `users/{uid}` 書込みで `null`/`undefined` 混入 → rules/production-data-safety.md §1 sanitize パターン適用 + rules 側の `is string` ガードで二重防御
- **R14**: ID Token 検証ミドルウェアの transient エラーが permanent 扱い（401）になり UI が誤って「再ログイン」を促す → C.2 で 503 透過を実装、FE 側は再試行 UI（M3 で本格化、M2 では 503 の存在のみ FE 側で認識）
- **R15**: Admin SDK 経由の rules bypass を route 側 schema validation で守らないと、悪意ある FE 改造で自由なフィールド書込みが可能になる → C.4 で route 側 keys allowlist + enum 検証を必須化

---

## M2 完了の定義

- [x] PR-A merged & local 検証完了 & AC A1〜A9 全 PASS
- [x] PR-B merged & local 検証完了 & AC B1〜B8 全 PASS
- [x] PR-C merged & local 検証完了 & AC C1〜C7 全 PASS
- [x] 本ファイル `docs/spec/m2/tasks.md` の全チェックボックスが `[x]`
- [x] M2 振り返りを ADR 末尾に追記（M1 と同流儀）
- [x] ADR-0001 ロードマップ表で M2 を ✅ 完了に更新

## M2 後フォローアップ（M2 完了後に対応、Issue 化はしない）

- **GitHub Actions Node.js 20 廃止対応**: PR #17 の deploy ログ由来の暫定値（2026-06-02 強制 / 2026-09-16 廃止）を、M2 PR 群レビュー待ち時間に公式 [GitHub blog 2025-09-19](https://github.blog/changelog/2025-09-19-deprecation-of-node-20-on-github-actions-runners/) で再確認。必要なら `actions/checkout@v5`、`google-github-actions/auth@v3`、`setup-gcloud@v3`、`deploy-cloudrun@v3` 等の major 追従を独立 PR で実施
- **PR-C 引き継ぎ**: M1 PR-C で先送りした admin SDK スタブの 4 項目（applicationDefault 失敗時 logError、prod の projectId fail-fast、test スクリプトの Anonymous プロバイダ未許可エラー化、`__resetFirebaseAdminAppForTesting()` 露出検討）を、本 M2 PR-C で `verifyIdToken` ミドルウェア導入時に併せて実装
- **テスト基盤導入**: rules ユニットテストで `@firebase/rules-unit-testing` を導入したのを契機に、`vitest` 等の自動テスト基盤を M3 着手前に検討（M1 振り返りの申し送り）

---

## 補足

### PR-A 切替手順（開発端末データ退避）

1. PR-A マージ前のブランチ（main または開発中ブランチ）で以下を実行:
   - 既存プロジェクトを全て「Export」で JSON ダウンロード（プロジェクト数だけ繰り返す）
   - 退避先: `~/Documents/novel-writer-backup-YYYYMMDD/` 等
2. PR-A マージ後、初回起動で IndexedDB が空になっていることを確認
3. 「Import」で退避 JSON を順次取り込み
4. 各プロジェクトの編集が IndexedDB に保存されることを A2 で確認
5. tutorial 状態 / analysisHistory はリセットされる前提（A.3 の判断: Export スキーマ後方互換性を優先する場合、これらは破棄可能）

> **Note**: ユーザーゼロ前提のため自動マイグレーションは実装しない。Firestore に残る旧データは PR-C 完了時点で論理削除（コレクション drop）扱いとする（物理削除は手動で別途実施可）。

### 並列実行判断

逐次推奨。理由:
- 自動テスト未整備のため、各 PR の動作確認に手動工数がかかる
- PR-A は永続化レイヤー総入替で影響範囲が広く、問題発生時に他 PR と切り分け困難
- PR-B / PR-C は PR-A の挙動を前提にするため、論理的に逐次

### dev/prod 設定分岐方針（M1 から踏襲）

- `process.env.NODE_ENV === 'production'` で middleware 設定を分岐（M1 で確定）
- `VITE_USE_AUTH_EMULATOR=true` で FE 側 Firebase Auth Emulator 接続を切替
- `FIREBASE_AUTH_EMULATOR_HOST` / `FIRESTORE_EMULATOR_HOST` で BE 側 admin SDK の emulator 接続を切替（admin SDK が標準で検出）
- prod ビルドでは Auth Emulator への接続コードがバンドルに残らないよう環境変数で完全分岐

### Cloud Run 認証の扱い

- M1 PR-A で `--allow-unauthenticated` を削除済み（IAM レベルで非公開）
- M2 では Cloud Run の IAM 設定は**変更しない**（手元 dev サーバー検証 + 本番デプロイは GitHub Actions の WIF SA で引き続き動作）
- **prod Cloud Run へのブラウザアクセスは M2 中は不能**（IAM で 403）。FE のブラウザ動作確認はローカル prod ビルドで代替する
- M3 で AI 認証ゲートが本実装された段階で `--allow-unauthenticated` 復活を再検討（アプリ層で守る前提が揃う）
