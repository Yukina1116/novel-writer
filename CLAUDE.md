# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev               # 開発サーバー起動（Express + Vite HMR, port 3000）
npm run build             # FEビルド（dist/）+ サーバーコンパイル（dist-server/）
npm run start             # 本番サーバー起動（dist-server/server/index.js）
npm run lint              # 型チェック（tsc --noEmit）
npm run preview           # Viteビルド後プレビュー
npm run test              # vitest run（middleware / route の単体・契約テスト、M3 PR-D 導入）
npm run test:watch        # vitest watch モード
npm run test:firestore-rules  # firebase emulators:exec で firestore.rules unit test
```

自動テストは M3 PR-D で vitest（`*.test.ts`）を導入。`server/middleware/*.test.ts` と `server/routes/*.test.ts` は admin SDK を vi.mock して contract assertion する方針。Firestore rules は emulator 実行（`test:firestore-rules`）。`tests/` 配下は引き続き手動テスト仕様書（QA 設計書）— 詳細は `tests/README.md`。

## Architecture

AI駆動の小説執筆支援アプリ（小説らいたーver16）。React + TypeScript + Vite。

### エントリポイント

- **フロントエンド**: `index.html` → `index.tsx` → `App.tsx`（デスクトップ3パネル）/ `App.mobile.tsx`（モバイル）
- **サーバー**: `server/index.ts` — Express。AI APIプロキシ + Viteミドルウェア（dev）/ 静的配信（prod）

### レイアウト

```
[ActivityBar] | [LeftPanel] | [NovelEditor] | [RightPanel]
```

### API層（サーバーサイド）

```
Browser → fetch(/api/*) → server/routes/ → server/services/ → Vertex AI (gemini-2.5-flash) / Firestore
```

全 `/api/ai/*` route は `mountAiRoutes` で `verifyIdToken` middleware (M3 PR-E) を一括 mount し、各 endpoint は `withUsageQuota` 高階関数 (M3 PR-F) で reserve→handler→commit/cancel の 3 phase ラップ。FE `apiClient.ts` (M3 PR-G) が Bearer 自動付与 + `requestId` 自動生成 + 401/429/503/409 共通分類器を担当。

| ルート | サービス / 認証・クォータ | 用途 |
|-------|---------|------|
| `/api/ai/novel/generate` | novelService + `withUsageQuota('novel/generate', 200 sen)` | 小説続き生成 |
| `/api/ai/character/{update,reply,image-prompt}` | characterService + `withUsageQuota('character/*', 100 sen)` | キャラクター作成・更新 |
| `/api/ai/world/{update,reply}` | worldService + `withUsageQuota('world/*', 100 sen)` | 世界観設定 |
| `/api/ai/image/generate` | imageService + `withUsageQuota('image/generate', 1000 sen)` | Imagen画像生成 |
| `/api/ai/utility/{names,knowledge-name,extract-character}` | utilityService + `withUsageQuota('utility/*', 50-100 sen)` | 名前生成、キャラ抽出等 |
| `/api/ai/analysis/import` | analysisService + `withUsageQuota('analysis/import', 200 sen)` | テキストインポート分析 |
| `/api/users/init` | verifyIdToken middleware → Firestore `users/{uid}` を transaction で冪等初期化（M2 PR-C） | ログイン直後のユーザーメタ初期化、M7-α で `termsAcceptedAt` / `termsVersion` / `currentTermsVersion` をレスポンスに追加 |
| `/api/users/accept-terms` | verifyIdToken + Firestore transaction で `termsAcceptedAt` / `termsVersion` 更新、`TERMS_VERSION` 不一致は 409 + `code: 'TERMS_VERSION_MISMATCH'`（M7-α PR-D-1） | 利用規約同意の永続化 |

- **AIクライアント**: `server/aiClient.ts` — `USE_VERTEX_AI=true`でVertex AI、それ以外はAPIキーモード
- **プロンプト構築**: `server/services/promptBuilder.ts` — format系ユーティリティ
- **Firebase Admin**: `server/firebaseAdmin.ts` — `getFirebaseAdminApp()` / `getFirebaseAuth()` / `getFirebaseFirestore()`（M2 PR-C で `firestoreClient.ts` から統合）
- **認証ミドルウェア**: `server/middleware/verifyIdToken.ts` — `Authorization: Bearer <ID Token>` 検証、transient（503）/permanent（401）分類（M2 PR-C 導入、M3 PR-E で `/api/ai/*` 全 endpoint に展開）
- **usage クォータ**: `server/services/usageService.ts` (reserve/commit/cancel + transaction 予約 + requestId 冪等)、`server/middleware/withUsageQuota.ts` (高階関数ラップ)、`server/services/usageConfig.ts` (Tier 1=月 100 円 + route 別 sen)。詳細は `docs/spec/m3/usage-cost-config.md`
- **エラー分類**: `server/middleware/errorHandler.ts` の `handleApiError(error, fn, context: 'ai' | 'firestore' | 'usage')` で文言と分類戦略を context 別に切替（M3 PR-F で table-driven 化、context 必須）
- **フロントエンドAPI**: ルート直下の `*Api.ts` はfetchラッパー（`apiClient.ts`経由）。`apiClient.ts` が Bearer 自動付与 + `requestId` 自動生成 + 401/429/503/409 を `AuthGateErrorCode` 列挙でユーザー向け文言に分類（M3 PR-G）。Project の永続化 API（旧 `projectApi.ts`）は M2 PR-A で削除済み
- **FE/BE 共有定数**: `shared/termsCodes.ts` — `TERMS_VERSION_MISMATCH_CODE = 'TERMS_VERSION_MISMATCH'` + `TermsVersionMismatchCode` 型を export（M7-α PR-D-2、`server/services/termsConfig.ts` は `shared/` から re-export）。FE/BE が直接 import することで stringly-typed リテラルの drift を排除し、`shared/termsCodes.test.ts` の literal-value pin テストで FE/BE 双方の参照先を保証
- **同意 UI**: `components/modals/TermsConsentModal.tsx` — `role="alertdialog"` + ModalManager 先頭分岐 (`needsTermsAccept && !isTermsDevBypass()`) で他モーダルより優先 mount。`isTermsDevBypass()` は dev-only `?skip-terms=1` query 評価（PROD ガード + SSR-safe ガード）。M7-α PR-D-2 で導入。Footer 3 link (`legalDocs.ts` の LEGAL_DOCS) は Desktop / ProjectSelection / Mobile 全 view に配置

### 状態管理（Zustand slices pattern）

`store/index.ts` で 11 スライス（M2 PR-B で `authSlice`、M4 で `backupSlice` 追加）を結合（`persist` ミドルウェアは未使用、メモリのみ）。永続化は `syncSlice` 経由で IndexedDB（Dexie.js）へ書き込み（2 秒 debounce + `beforeunload`/`visibilitychange` で flush、`hooks/useLocalSync.ts`）。

| スライス | 責務 |
|---------|------|
| projectSlice | プロジェクトCRUD、import は M4 で `backupSlice.prepareImport` 経由に変更 (legacy bare-project JSON も同経路で処理) |
| uiSlice | モーダル、サイドバー、タブ、トースト等のUI状態 |
| dataSlice | 小説本文、設定、ナレッジ、プロット、タイムラインの変更 |
| aiSlice | AI呼び出し、生成モード、複数候補管理 |
| historySlice | ツリー構造の undo/redo（最大10ノード、メモリのみ・IndexedDB にも書かない） |
| syncSlice | IndexedDB 同期（2 秒 debounce → `flushSave` → `putProject` via `db/projectRepository.ts`、M2 PR-A で Firestore から移行） |
| tutorialSlice | 5種チュートリアルの進捗（IndexedDB の `tutorialState` ストア） |
| analysisHistorySlice | テキストインポート分析の履歴（IndexedDB の `analysisHistory` ストア） |
| formSlice | フォーム状態 |
| authSlice | Firebase Auth 状態（`currentUser` / `authStatus: 'initializing' \| 'unauthenticated' \| 'authenticated'` / `authError` / `needsUserInit` / `retryUserInit()`、M7-α PR-D-1 で `termsAcceptedAt` / `termsVersion` / `currentTermsVersion` / `needsTermsAccept` (派生) / `termsAccepting` / `acceptTerms()` 追加、PR-D-2 で `refreshCurrentTermsVersion()` (TERMS_VERSION_MISMATCH 時に users/init を再 fetch して `currentTermsVersion` のみ更新、`needsUserInit` には触れない) + `isTermsVersionMismatch(error)` helper を追加、IndexedDB は uid に紐付けない設計、M2 PR-B で導入、M3 PR-G で users/init transient retry signal 追加） |
| backupSlice | 全データバックアップ (`exportAllData` / `prepareImport` / `executeImport` / `cancelImport` / `setImportResolution` / `isBackupStale`)、`lastExportedAt` + `backupMetaStatus: 'unknown' \| 'loaded'` sentinel、`importPlan: { backup: BackupV1, conflicts: ImportConflict[] }`、M4 で導入 |

### バックアップ層 (M4)

- **Schema**: `BackupV1 { schemaVersion: 1, exportedAt, appVersion, projects, tutorialState, analysisHistory }` (`utils/backupSchema.ts`)。`historyTree` は ADR-0001 の memory-only 方針で export 対象外。M5 (Stripe Tier 2 backup) / M6 (E2EE) で再利用予定。Legacy bare-project JSON / `{ project: {...} }` envelope は `parseBackup` 内で BackupV1 にラップして後方互換確保。
- **永続化**: IndexedDB v2 で `backupMeta` ストア (`{ key: 'current', lastExportedAt: ISO | null }`) 追加 (`db/dexie.ts`、Dexie sequential upgrade で既存データ保持)。
- **Import 経路**: `db/backupRepository.ts` の `writeImport` が単一 Dexie transaction で `projects` (sanitize chain `validateAndSanitizeProjectData → pickPersistableFields → stripInternalKeys` 適用) / `tutorialState` / `analysisHistory` を atomic 書き込み。完了後 `hooks/refreshFromIndexedDb.ts` で in-memory state を rehydrate (memory ↔ disk の silent overwrite を防止)。
- **TOCTOU 対策**: `prepareImport` で `flushSave` 先行 + `executeImport` で `existingIds` を再 read (delete/insert の concurrent 変更を吸収)。
- **UI**: `components/BackupWarningBanner.tsx` (30 日経過で表示、`backupMetaStatus === 'unknown'` 時は suppress) + `components/modals/ImportConflictModal.tsx` (per-project に `overwrite` / `duplicate` / `skip` 選択、`ModalManager` に統合)。M6 PR-D で Banner / Header / SettingsPanel の 3 export 起点を `openModal('exportEncrypt')` に集約。

### E2EE 暗号化バックアップ層 (M6)

- **Crypto core**: `utils/backupCrypto.ts` — AES-GCM-256 + PBKDF2-SHA256 (600,000 iter., `extractable: false` + AAD で envelope metadata 認証)。`encryptBackup` / `decryptBackup` / `validatePassphraseLength` / `codepointLength` を export。`exportKey` は **export しない** (CI 静的検査 `tests/static/no-export-key.test.ts` で機械的に enforcement)。エラー文言は constant `DECRYPT_FAILURE_MESSAGE` 単一 (fingerprinting 防止)。
- **Schema**: `EncryptedBackupV1 { envelopeVersion: 1, encrypted: true, algorithm, kdf, kdfParams, iv, ciphertext, appVersion, encryptedAt }` (`utils/backupSchema.ts`)。`isEncryptedBackup` AND 結合 type guard + `parseEncryptedEnvelope` parse-time validation (literal / floor & ceiling / byte-length) + `parseAnyBackup` で encrypted/平文 dispatch。`parseBackup` 戻り値型 `BackupV1` 不変 (AC-8 regression)。
- **State machine**: `store/backupSlice.ts` の `pendingDecryption: { rawEnvelope, retryCount, abortController, isDecrypting }` で 4 状態 (Idle / AwaitingPassphrase / Decrypting / ImportPlan)。invariant `pendingDecryption !== null ⇒ importPlan === null` を atomic transition で保持。`MAX_DECRYPT_RETRIES = 5` 超で modal 自動 unmount + toast `DECRYPT_RETRY_EXCEEDED_TOAST`。`isStaleDecryptSession` helper で signal.aborted / ownership 喪失を 3 段階 race-free check (`docs/spec/m6/state-diagram.md` T1〜T12)。
- **UI (M6 PR-D)**: `components/modals/ExportEncryptModal.tsx` (「暗号化する」チェックボックス内蔵、ON 時は 12 codepoint 強度表示 + 確認再入力 + `autocomplete="new-password"` + `oncopy`/`oncut` preventDefault + 30 秒 AbortController timeout) と `components/modals/ImportPassphraseModal.tsx` (DECRYPT_FAILURE_MESSAGE 直接使用 + retry 残回数を `MAX_DECRYPT_RETRIES - retryCount` で UI 側派生 + 30 秒 timeout)。`ModalManager` 先頭分岐で `pendingDecryption !== null` 時に `ImportPassphraseModal` を `activeModal` より優先表示 (TermsConsentModal の先頭分岐パターンと整合)。`cancelPendingDecryption` / retry 5 到達時の slice 経路は `closeModal()` を呼ばない (PR-D F3 fix、auto-unmount で完結)。
- **規律**: `components/` 配下は `error.cause` を読まない (AC-9、CI 静的検査 `tests/static/no-error-cause-in-components.test.ts` で grep 検証)。passphrase は React state を成功・失敗どちらでも即クリア (AC-9 memory 滞留最小化)。

### 型定義

`types.ts` に全型を集約。主要型: `Project`, `NovelChunk`, `SettingItem`, `KnowledgeItem`, `PlotItem`, `TimelineEvent`, `AiSettings`, `ChatMessage`, `BackupV1` (M4), `ImportConflict` / `ImportPlan` / `ImportConflictResolution` (M4), `EncryptedBackupV1` (M6), `PendingDecryption` / `PrepareImportResult` (M6 backupSlice export)。`ModalType` に `'exportEncrypt'` 追加 (M6 PR-D)。

### パスエイリアス

`@/` → プロジェクトルート（tsconfig + vite.config.ts）

## GCP / デプロイ

- **開発**: `novel-writer-dev`（課金有効、asia-northeast1）
- **本番**: `novel-writer-prod`（課金クォータ引き上げ待ち）
- **ランタイム**: Cloud Run + Vertex AI（Workload Identity認証）
- **CI/CD**: GitHub Actions → WIF → Cloud Run自動デプロイ（mainブランチ）
- **Docker**: マルチステージビルド（`Dockerfile`）。Vite の build-time 静的置換のため、`VITE_FIREBASE_*` 6 変数は `docker build --build-arg` で注入する必要があり、GitHub Secrets → workflow の `env:` ブロック → shell 変数の順で受け渡す（直接 `${{ secrets.* }}` を `run:` に展開しない、command injection 回避）
- **direnv**: `.envrc` で `CLOUDSDK_ACTIVE_CONFIG_NAME=novel-writer-dev` 自動設定 + `gh auth switch --user yasushi-honda` 自動実行（direnv は shell の interactive hook (`eval "$(direnv hook bash)"`) に依存し、Claude Code Bash ツールが起動する非対話 subshell では発火しないため、補助として下記 §5 の `.claude/hooks/` で吸収）

## Claude Code 運用ルール（本プロジェクト固有の規律）

2026-04-26 セッションで規範違反 + 言い訳的対応が発生したため、再発防止として明文化する。グローバル `~/.claude/CLAUDE.md` の規範を本プロジェクトでも厳守すること。

### 1. スコープ厳守（MUST）

- **本プロジェクトの作業中に `~/.claude/`（グローバル設定）を触らない。** 例外なし。
- グローバル memory（`~/.claude/memory/`）・hook・rules への変更が必要と判断した場合は、**まず本プロジェクトの現タスクを区切る（コミット可能な状態にする）→ ユーザーに変更内容と理由を提示して承認を得る → 別 claude セッション（cwd=`~/.claude`）から feature ブランチ + PR で対応**。本プロジェクトのセッションのまま並行作業を始めない。
- 本プロジェクトの memory として残したい知見は `docs/` 配下または本ファイルに記録する（プロジェクトスコープに閉じる）。
- **SHOULD**: グローバル `~/.claude/CLAUDE.md` 改定時は本セクションとの整合性を `/catchup` 時に確認し、ズレていたら別 claude セッションでグローバル側 or 本ファイルの追従 PR を出す。

### 2. main 直 push 禁止（MUST、規範違反を技術問題にすり替えない）

- ドキュメントのみの変更でも feature ブランチ + PR。
- `git push` のみのコマンド（push 先未指定）= main 直 push の経路になりうる。**コマンドを書いた時点で「これは main を更新するか？」を自問する**。
- pre-push hook がブロックしてきた場合、それは「hook のバグ」ではなく「自分が main 上で push しようとしている」サインの可能性が高い。**「hook 回避策」と言い換える前に自分の運用を疑う**。
- 別リポジトリ（`~/.claude` 等）の push が hook で誤検知される場合は、cwd を合わせた別 claude セッションから操作する（本プロジェクトの責務外）。

### 3. 指摘を受けたときの対応（MUST）

- ユーザーから規範違反を指摘されたら、**初回指摘で認める。反論・選択肢提示・条件付き同意は禁止**。「一部その通りだが…」「ただし技術的には…」のような留保も含めない。
- 「ツール改修」「hook 改修」を選択肢として出す前に、**自分の運用ルール側で解決できないかを先に検討**する。技術問題への分岐は、運用側の解決可能性をすべて排除した後にのみ提示する。
- 卑怯な言い回し（「バグ回避」「設計上の限界」「設計上のトレードオフ」など、自分のサボりを技術問題に転嫁する語彙）を避ける。
- ユーザーに **2 度同じ指摘を言わせた時点で運用に組み込まれた問題と扱い、§4 に従って永続化対象**にする。

### 4. 永続化（MUST）

- 同種の規範違反・運用ミスが再発したら、**口頭の謝罪で終わらせず、本セクションへの事例と対策の追記を完了してからセッションを閉じる**。
- 軽微な事例は `docs/adr/` または個別 ADR に追記、重大な再発防止は本ファイルで常時参照可能にする。
- 過去事例は時系列の根拠（特定セッション日付）を残す。理由: 規律の正当性が「過去の具体的失敗」に紐付いていると次セッションの Claude がルールを軽視しにくい。詳細セッション要約は `docs/adr/` に分離し、本ファイルからは相対リンクで辿れる構造を保つ。

### 5. GitHub アカウント自動切替（プロジェクトローカル hook）

`gh auth` の active account はマシン全体で `~/.config/gh/hosts.yml` で共有される。本プロジェクトの GitHub identity は `yasushi-honda` だが、別 claude セッションや別ターミナルで `gh auth switch` が走ると active account が他ユーザーに変わり、`gh pr create` / `gh pr merge` が GraphQL の collaborator チェックで失敗する（2026-04-29 セッション、PR #80 の発端事象）。`.envrc` での自動 switch は direnv の interactive hook 依存により Claude Code Bash ツールでは機能しないため、プロジェクトローカルの PreToolUse hook で吸収する。

- **`.claude/hooks/ensure-gh-account.sh`**: Bash ツール実行直前に `tool_input.command` を検査し、`gh ` を独立したコマンド語として含む場合は `gh auth switch --user yasushi-honda` を実行（既に同ユーザーなら no-op）。失敗時は stderr に `[ensure-gh-account] WARN:` で診断を出すが、exit 0 を維持して Bash tool は block しない。`git push` / `git pull` 等は origin URL に token (`https://x-access-token:gho_...@github.com/...`) を埋め込んで認証するため、`gh auth` の active account に依存しない（hook の検知対象外で問題ない）
- **`.claude/settings.json`**: 上記 hook を `PreToolUse` × `Bash` matcher に登録
- **`tests/static/ensure-gh-account-hook-resilience.test.ts`**: jq 不在 / malformed JSON / 空 input 等の異常系で hook が exit 0 を維持することを vitest で hard-pin
- **廃止条件 (sunset)**: 以下のいずれかが満たされたら本 hook は撤去する
  1. グローバル `~/.claude/` 側で「他プロジェクトでの `gh auth switch` を session 終了時に元アカウントへ復帰させる」規律 / hook が確立されたとき
  2. Claude Code Bash ツールが direnv hook を発火するようになったとき（公式 changelog で確認）
  3. プロジェクトが per-command identity（全 gh 呼出で `--user` flag、または ephemeral `GH_TOKEN`）に移行し、active account 依存が解消されたとき
