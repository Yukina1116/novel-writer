# M3: AI 認証ゲート + クォータ タスク表

- Status: 🚧 In Progress (PR-F 実装中、PR-G 着手待機)
- Owner: yasushi-honda
- Started: 2026-04-27
- Related ADR: [ADR-0001](../../adr/0001-local-first-architecture.md) phase 2

## ゴール

ADR-0001 で採用した Local-first アーキテクチャの phase 2 を実装する:

1. **`/api/ai/*` を Firebase Auth ID Token を持つユーザーのみに開放**（M2 PR-C 導入の `verifyIdToken` を AI 経路に展開）
2. **`usage/{uid_yyyymm}` で AI 利用量を集計**（transaction 予約制 + requestId 冪等化、コスト上限ベース）
3. **Cloud Run `--allow-unauthenticated` 復活**（middleware による認証強制を前提）
4. **テスト基盤（vitest + supertest）導入**（rules unit test と同居しやすい構成）

これにより M2 持越項目 5 件をすべて消化し、M4（Stripe 連携準備）に着手可能な状態を作る。

## マイルストーン外スコープ（やらないこと）

- Stripe 連携（M5）
- E2EE バックアップ（M6）
- AI モデル切替や精度改善
- Tier 0 ローカル機能の挙動変更
- 月跨ぎ自動 archive（usedCost 月次集計のみ、過去月のドキュメントは保持）
- 複数端末同期（ADR-0001 で不採用）

## M2 持越項目（M3 で消化する 5 項目）

`docs/handoff/LATEST.md` および ADR-0001 M2 振り返り（L144-149）より:

| # | 項目 | 担当 PR |
|---|---|---|
| 1 | `/api/users/init` route の Partial Update assertion テスト未整備 | PR-D |
| 2 | FE 側 users/init 失敗 retry signal (`needsUserInit` flag) | PR-G |
| 3 | `applicationDefault()` eager init (起動時 probe で fail-fast) | PR-E |
| 4 | 型強化 (`AuthedRequest` export / `sanitizeForUpdate` undefined フリー戻り値) | PR-D |
| 5 | `verifyIdToken` transient エラーコード拡張 (`ECONNREFUSED` / `EAI_AGAIN` / `app/network-error`) | PR-D |

## PR 構成

| PR | 内容 | 規模 | 工数 | 状態 |
|---|---|---|---|---|
| PR-D | テスト基盤 (vitest + supertest) + 持越 #1, #4, #5 | 中 | 3〜4 時間 | ✅ 完了 (PR #37) |
| PR-E | `/api/ai/*` 全ルートに `verifyIdToken` 適用 + handleApiError 共通化 + 持越 #3 (起動 probe) | 大 | 4〜5 時間 | ✅ 完了 (本セッション) |
| PR-F | usage クォータ実装 (transaction 予約 + requestId 冪等 + コスト上限) + firestore.rules `usage` コレクション追加 + 持越/PR-E 反映 + Issue #40 | 大 | 4〜6 時間 | 🚧 実装中 |
| PR-G | FE 統合 (apiCall に Bearer 付与 + 持越 #2) + 401/503/429 トースト + Cloud Run `--allow-unauthenticated` 復活 | 中 | 2〜3 時間 | ⏳ 未着手 |

着手順序: **逐次 D → E → F → G**（M2 と同方針、自動テスト基盤が PR-D で立ち上がるため、E/F/G は契約テスト併走で進める）

---

## PR-D: テスト基盤 + 持越項目 (1, 4, 5)

ブランチ: `feature/m3-pr-d-test-infra`

### 背景

M2 までは自動テストが `npm run test:firestore-rules` (rules unit test) のみで、route layer の挙動を assert する基盤が存在しなかった。M3 で AI 経路に認証ゲートと quota を導入する前提として、route のリグレッションを機械的に検出できる仕組みが必要。

PR-D では実装変更を最小に抑え、**テスト基盤導入 + 既存コードへのテスト追加 + 既存指摘事項の解消** に集中する。AI 経路への middleware 適用は PR-E で実施。

### タスク

#### D.1 vitest + supertest 導入
- [x] `package.json` に dev dependency 追加: `vitest`, `supertest`, `@types/supertest`
- [x] `vitest.config.ts` 新規作成（プロジェクトルート、`test.environment: 'node'` で server route テスト対応、`test.globals: true` で `describe`/`it`/`expect` をグローバル展開）
- [x] `package.json` scripts 追加: `test`, `test:watch`, `test:coverage`（既存の `test:firestore-rules` は維持）
- [x] `.gitignore` に `coverage/` 追記
- [x] `tsconfig.json` の `include` に `**/*.test.ts` を追加（必要に応じて）

#### D.2 verifyIdToken transient エラーコード拡張 + テスト
- [x] `server/middleware/verifyIdToken.ts`:
  - `TRANSIENT_AUTH_CODES` に `app/network-error` を追加
  - `isTransientAuthError` 内の string code 判定に `ECONNREFUSED` / `EAI_AGAIN` を追加
- [x] `server/middleware/verifyIdToken.test.ts` 新規:
  - permanent: `auth/argument-error`, `auth/id-token-expired`, `auth/id-token-revoked` → 401
  - transient: `auth/internal-error`, `auth/network-request-failed`, `auth/service-unavailable`, `app/network-error`, `ETIMEDOUT`, `ECONNRESET`, `ENOTFOUND`, `ECONNREFUSED`, `EAI_AGAIN` → 503
  - Authorization 不在 → 401 / Bearer 形式不正 → 401 / 空トークン → 401
  - 成功時 `req.user = { uid, email }` 注入
  - `getFirebaseAuth()` を vi.mock で差し替え（実 emulator 不要）

#### D.3 型強化 (AuthedRequest export + sanitizeForUpdate 戻り値型)
- [x] `server/middleware/verifyIdToken.ts`:
  - `export type AuthedRequest = Request & { user: NonNullable<Request['user']> }` を追加
  - declaration merging はそのまま維持（既存呼び出しの後方互換性）
- [x] `server/utils/sanitize.ts`:
  - 戻り値型を `Partial<T>` から `{ [K in keyof T]: Exclude<T[K], undefined> }` に変更
  - 動作変更なし（型表現の引き締めのみ）
- [x] `server/routes/users.ts`:
  - handler 引数を `AuthedRequest` に narrow（既存の `if (!user) ... return` ガードは保持、二重防御）

#### D.4 /api/users/init Partial Update assertion テスト
- [x] `server/routes/users.test.ts` 新規（supertest + Firestore Emulator）:
  - **D.4.1**: 新規 uid で POST /api/users/init → 200 + Firestore `users/{uid}` に `{email, plan: 'free', createdAt, updatedAt}` 全 4 フィールドが書かれる（snap.data() で全件確認）
  - **D.4.2**: 既存 uid で POST /api/users/init → 200 + `users/{uid}` の `createdAt` と `plan` が **更新されないこと** を確認（前回の値と一致、`updatedAt` のみ進む）
  - **D.4.3**: `tx.update` payload に `createdAt`/`plan` を含まないことを直接 assert（admin SDK transaction を spy / Firestore.runTransaction を mock 化、または書込前後の差分から推論）
  - **D.4.4**: Authorization なし → 401（middleware の振る舞い）
  - **D.4.5**: Firestore UNAVAILABLE 模擬 → 503 / その他 → 500（formatFirestoreError 動作）
- [N/A] テストヘルパー `tests/helpers/firestoreEmulator.ts` → PR-D は admin SDK を vi.mock する方針で D.4.1〜D.4.5 全網羅できたため不要。emulator 接続が必要になる PR-E (AI 経路統合テスト) で実装する
- [N/A] テストヘルパー `tests/helpers/mockIdToken.ts` → 同上（PR-E 以降で必要時に追加）

#### D.5 ドキュメント整備
- [x] `docs/spec/m3/tasks.md` 本ファイルの PR-D セクション ✅ チェック更新
- [x] CLAUDE.md "Commands" 表に `npm run test` 追加
- [x] `tests/README.md` に「自動テスト（vitest）と手動テスト（既存 *.md）の住み分け」を追記

### Acceptance Criteria

- [x] **D1**: `npm run test` が PASS（vitest 起動、新規テスト全 PASS）
- [x] **D2**: `npm run test:firestore-rules` が PASS（既存 15 ケース regression なし）
- [x] **D3**: `npm run lint`（tsc --noEmit）PASS
- [x] **D4**: `server/middleware/verifyIdToken.test.ts` で transient/permanent 全網羅（`ECONNREFUSED`, `EAI_AGAIN`, `app/network-error` 含む 9 種以上）
- [x] **D5**: `server/routes/users.test.ts` で D.4.1〜D.4.5 全 PASS、`tx.update` payload に `createdAt`/`plan` を含まないことが直接 assert される
- [x] **D6**: `AuthedRequest` 型が `server/middleware/verifyIdToken.ts` から export され、`server/routes/users.ts` で利用される
- [x] **D7**: `sanitizeForUpdate<T>(...)` の戻り値型が **値域 undefined フリー（optional キー許容）** で型表現される。具体的には `Partial<SanitizedForUpdate<T>>` = `{ [K in keyof T]?: Exclude<T[K], undefined> }` であり、ランタイムが「値が undefined のキーごと削除」する挙動と型表明が一致すること（旧版で Partial を外した修正は型とランタイムの乖離を招くため revert 済、PR-D /review-pr で確定）

### 手動検証手順

1. `npm install`（dev dependency 追加分）
2. `firebase emulators:start --only firestore` で Emulator 起動（別 terminal）
3. `npm run test` 実行 → 全 PASS 確認
4. `npm run test:firestore-rules` 実行 → 既存 15 ケース regression なし
5. `npm run lint` 実行 → 0 error

### 品質ゲート

- [x] `npm run lint`（tsc --noEmit）PASS
- [x] `npm run test` PASS
- [x] `npm run test:firestore-rules` PASS（regression なし）
- [ ] `/simplify`（reuse / quality / efficiency 3 並列）実行
- [ ] 5 ファイル以上の変更見込みのため `evaluator` agent による Acceptance Criteria 評価を別コンテキストで実行（rules/quality-gate.md 準拠）
- [ ] `/review-pr`（6 エージェント並列）実行

### リスク

- **R1**: vitest と Vite (FE) のバージョン競合 → 緩和: 公式 compat 表確認（vitest 1.x ↔ vite 5/6）。`vite@^6.2.0` なので `vitest@^2.x` 系を選定
- **R2**: server route テストで Firebase Admin SDK 初期化が test 間で leak → 緩和: 各 test で `getApps().forEach(deleteApp)` cleanup、または `vitest.config.ts` で `pool: 'forks'`
- **R3**: Firestore Emulator が test と並列起動するとポート競合 → 緩和: 既存 `firebase.json` で 8080 固定、テスト実行前に `firebase emulators:start --only firestore` を別プロセスで起動する運用（後続 PR で `firebase emulators:exec` 化検討）
- **R4**: `tx.update` payload の直接 assert は admin SDK transaction の spy が必要 → 緩和: `vi.spyOn(db, 'runTransaction')` 経由で transaction 関数を捕捉し、その中で呼ばれる `tx.update` の引数を記録する mock 構造を組む（実装時に詳細設計）

### PR-E 持越（PR-D /review-pr で発覚した残課題）

- **`FirebaseAuthError instanceof` の本物テスト**: `verifyIdToken.test.ts` は `vi.mock` でプレーンオブジェクト `{code, message}` を投げる経路のみ検証している。`isTransientAuthError` の `instanceof FirebaseAuthError` 分岐は本番の firebase-admin スロー時のみ発火する。emulator 経由の AI route 統合テスト（PR-E E4）で本物の `FirebaseAuthError` が transient/permanent 分類を通ることを確認すること
- **`auth/quota-exceeded` の transient 分類**: 現状 permanent (401) に落ちる。Firebase Admin SDK が quota 超過時にこの code を投げる場合があり、ユーザー再認証ループに入るリスクあり。PR-D で `console.error` (unexpected permanent) で観測性は確保したが、PR-E で公式仕様確認後 `TRANSIENT_AUTH_CODES` 追加を検討
- **`AuthedRequest` の handler 引数型化（type-design-analyzer T2 / code-reviewer S-2 指摘、rating 7）**: PR-D では `(req as AuthedRequest).user` のキャスト + `if (!user)` 二重防御の構造を維持。PR-E で `/api/ai/*` 全 route に middleware を適用するタイミングで `router.post('/init', verifyIdToken, (req: AuthedRequest, res) => ...)` の handler 引数型 + middleware mount-level 型強制に統一する（コードベース全体一貫性）

### PR-D で対応済み（/review-pr 指摘）

- **silent-failure-hunter F1 / type-design-analyzer T1**: `sanitize.ts` 戻り値型を `Partial<SanitizedForUpdate<T>>` に確定（ランタイムでキーが消える挙動と型表明を一致、silent partial update リスク解消）
- **silent-failure-hunter F2**: `verifyIdToken` permanent path を expected (warn) / unexpected (error) で分岐し、`auth/quota-exceeded` 等の分類漏れが Sentry に届くよう観測性を確保（test に spy 追加）

---

## PR-E: BE AI 認証ゲート + 起動 probe + handleApiError 共通化

ブランチ: `feature/m3-pr-e-ai-auth-gate`

### 背景

PR-D で確立した認証基盤 (`verifyIdToken` middleware + `AuthedRequest` 型 + vitest 基盤 31/31 PASS) を `/api/ai/*` 全 11 endpoint に拡張する。Cloud Run public 化 (PR-G) の前提条件として「BE 側で認証強制」を実現し、M2 持越 #3 (起動 probe) と PR-D /review-pr 持越 3 件を併せて消化する。

PR-E では実装変更を最小化するため、AI route 個別ファイルへの handler narrowing は PR-F (usage 集計時) に持越し、middleware の prefix mount のみ行う設計。

### タスク

#### E.1 mountAiRoutes 共通化 (server/aiRoutes.ts 新規)
- [x] `server/aiRoutes.ts` 新規: `mountAiRoutes(app, ...preMiddlewares)` 関数で `/api/ai/*` の middleware + 6 route mount を集約
- [x] `server/index.ts` から AI route 個別 import を削除し `mountAiRoutes(app, aiLimiter)` 1 行で置換
- [x] `server/routes/ai-auth.test.ts` と `tests/integration/ai-auth.test.ts` の test app も `mountAiRoutes(app)` で構築（drift 防止）

#### E.2 verifyIdToken middleware を /api/ai/* prefix に適用
- [x] `mountAiRoutes` 内で `app.use('/api/ai', ...preMiddlewares, verifyIdToken)` 形式
- [x] AI route ファイル (novel/character/world/image/utility/analysis) は無変更（handler narrowing は PR-F に持越）
- [x] 順序: aiLimiter → verifyIdToken → 各 route handler。認証エラー時も rate limit 消費で brute-force 防御

#### E.3 起動時 Firebase Auth probe (M2 持越 #3)
- [x] `server/startupProbe.ts` 新規: `probeFirebaseAuth()` + `isEmulatorMode()` re-export
- [x] `server/firebaseAdmin.ts` の `isEmulatorMode` / `hasEmulatorHost` を export 化（startupProbe との挙動乖離防止、`host:port` pattern 検証を共有）
- [x] `server/index.ts` の `startServer()` 先頭で `probeFirebaseAuth()` 呼出
- [x] emulator mode (FIREBASE_AUTH_EMULATOR_HOST or FIRESTORE_EMULATOR_HOST が host:port 形式で設定) は probe skip
- [x] non-emulator で ADC 未設定 → `applicationDefault()` 同期 throw → unhandled rejection で process 落ち (Cloud Run rollback トリガ)

#### E.4 handleApiError 汎用化 + users.ts 統合
- [x] `server/middleware/errorHandler.ts`: `handleApiError(error, fn, context: 'ai' | 'firestore' = 'ai')` シグネチャに拡張
- [x] gRPC transient (UNAVAILABLE/DEADLINE_EXCEEDED/4/14) を両 context で 503 に統一、文言だけ context-aware
- [x] Firestore context は AI 用 message ベース分類 (quota/API key/timeout) を適用しない（誤判定防止）
- [x] `server/routes/users.ts`: inline `formatFirestoreError` + `TRANSIENT_FIRESTORE_CODES` を削除、`handleApiError(error, 'users/init', 'firestore')` に置換
- [x] context default = 'ai' で既存 AI route 6 ファイルは無変更で動作

#### E.5 verifyIdToken auth/quota-exceeded 判断
- [x] 公式仕様確認: [Firebase Admin Auth エラーコード](https://firebase.google.com/docs/auth/admin/errors) で verifyIdToken の文書化された throw に `auth/quota-exceeded` 含まれず（SMS 送信経路のみ）
- [x] `EXPECTED_PERMANENT_AUTH_CODES` への追加は見送り、permanent 維持 + 観測継続。根拠を verifyIdToken.ts コメントに記録

#### E.6 テスト基盤
- [x] `tests/helpers/firestoreEmulator.ts` 新規: `teardownAllAdminApps`, `clearEmulatorCollection`, `isEmulatorReady`, `resolveEmulatorProjectId`
- [x] `tests/helpers/mockIdToken.ts` 新規: `getEmulatorIdToken` (admin SDK createUser → custom token → emulator REST signInWithCustomToken)、`clearEmulatorUsers`
- [x] `server/middleware/errorHandler.test.ts` 新規 (18 ケース): gRPC transient 両 context / CorsRejectError / AI message 分類 / Firestore 分類スキップ / fallback / default context / logging
- [x] `server/startupProbe.test.ts` 新規 (8 ケース): emulator skip 3 / non-emulator throw 2 / isEmulatorMode 3
- [x] `server/routes/ai-auth.test.ts` 新規 (15 ケース): 11 endpoint × Authorization なし → 401 + Bearer pass-through + transient 503
- [x] `tests/integration/ai-auth.test.ts` 新規 (3 ケース): emulator 経由 ID Token → 200 / 不正 token → 401 / Authorization 不在 → 401 (FirebaseAuthError instanceof 経路網羅、PR-D 持越 #1)
- [x] `package.json`: `test` を `tests/integration/**` 除外、`test:integration` script 追加 (`firebase emulators:exec --only auth,firestore`)

#### E.7 ドキュメント整備
- [x] `docs/spec/m3/tasks.md` 本ファイルの PR-E セクション ✅ 更新
- [x] `docs/handoff/LATEST.md` を M3 PR-E 完了状態に更新

### Acceptance Criteria

- [x] **E1**: 全 11 endpoint (`/api/ai/{novel/generate, character/{update,reply,image-prompt}, world/{update,reply}, image/generate, utility/{names,knowledge-name,extract-character}, analysis/import}`) で Authorization 不在 → 401 + `{success: false, error: ...}`（`server/routes/ai-auth.test.ts` で全 endpoint 網羅）
- [x] **E2**: emulator 未設定環境で ADC 未設定 → `startServer()` 内 `probeFirebaseAuth()` が `applicationDefault()` の throw を伝播し `app.listen()` 到達前に process 落ち（`server/startupProbe.test.ts` で同期 throw を assert）
- [x] **E3**: `handleApiError` が Firestore gRPC code を分類: UNAVAILABLE/14 → 503、DEADLINE_EXCEEDED/4 → 503、INVALID_ARGUMENT → 500、コードなし → 既存 AI 分類フォールバック（`server/middleware/errorHandler.test.ts` で網羅）
- [x] **E4**: Firebase Auth Emulator + 本物 `getAuth().verifyIdToken()` 経路で `/api/ai/utility/names` が ID Token 付き → 200、不正 token → 401、Authorization 不在 → 401（`tests/integration/ai-auth.test.ts`、`npm run test:integration` で実行）。emulator 停止状態の 503 動作は `server/routes/ai-auth.test.ts` の transient error 503 ケース（`auth/network-request-failed`）でカバー
- [x] **E5**: `users.ts` から `formatFirestoreError` + `TRANSIENT_FIRESTORE_CODES` 削除、handler 内 catch は `handleApiError(error, 'users/init', 'firestore')` 1 行に置換（`grep -rn formatFirestoreError server/` で 0 件）
- [x] **E6**: AI route 個別ファイルへの middleware 重複 mount なし、`server/aiRoutes.ts` の `mountAiRoutes` で prefix 単位一括 mount。AI route 6 ファイルは無変更（handler narrowing は PR-F で usage 集計と統合）
- [x] **E7**: `auth/quota-exceeded` は permanent 維持 + コメントに公式仕様確認結果を記録（`server/middleware/verifyIdToken.ts` 30-37 行）
- [x] **E8**: `npm run test` PASS (77/77、既存 31 + 新規 46)、`npm run test:firestore-rules` PASS (regression なし)、`npm run lint` PASS、`npm run build` PASS

### 手動検証手順

1. `npm install`（dev dependency 追加なし、scripts のみ変更）
2. `npm run lint` → 0 error
3. `npm run test` → 77/77 PASS
4. `npm run build` → vite build 成功
5. `npm run test:firestore-rules` → 既存 15 ケース regression なし
6. (任意) `npm run test:integration` → Firebase Emulator 起動 + 統合テスト 3 ケース PASS

### 品質ゲート

- [x] `npm run lint` PASS
- [x] `npm run test` PASS (77/77)
- [x] `npm run build` PASS
- [x] `npm run test:firestore-rules` PASS（regression なし）
- [x] `/simplify`（reuse / quality / efficiency 3 並列）実行 → 高優先度修正反映: isEmulatorMode 二重定義解消、mountAiRoutes 抽出、PR/agent 名コメント削除、resolveEmulatorProjectId 抽出、mockIdToken TOCTOU 修正
- [x] Evaluator 分離（5 ファイル+ かつ新機能 → rules/quality-gate.md 発動条件 ✅）→ AC E1-E8 全 PASS、LOW 指摘 1 件（mountAiRoutes コメント表現）反映済
- [ ] `/review-pr`（6 エージェント並列）→ PR 作成後に実行

### リスク

- **R1**: vitest 統合テスト (tests/integration) が `npm run test` から除外されているため CI で実行されない可能性。緩和: `npm run test:integration` を別 script として追加、PR-G で CI 統合を検討
- **R2**: `mountAiRoutes` factory と本番 `server/index.ts` の整合性が将来 drift する可能性。緩和: 単一関数に集約済 + テスト経路（ai-auth.test.ts）で同 factory を呼ぶ設計で drift 即検知
- **R3**: `handleApiError` の context default = 'ai' で新規呼出元が context 指定漏れすると AI 用文言を Firestore route から返す事故。緩和: 既存 AI route 6 ファイル backward compat の価値が大きいため default は維持、PR-F で usage 集計実装時に AI route も含めて全呼出元を明示 'ai' 指定にリファクタする方針

### PR-F 持越事項

- **AuthedRequest handler 引数 narrowing**: PR-D /review-pr 持越事項 #3。PR-E では AI route 無変更のため handler 引数の narrowing は未実施。PR-F で usage 集計実装時に `req.user.uid` を使う必要が出るため、その時点で全 AI route handler を `(req: AuthedRequest, res) => ...` 形式 + `if (!req.user) return 500` 二重防御に統一する
- **handleApiError context 明示化**: 既存 AI route 6 ファイルが context default = 'ai' に依存している。PR-F で AI route リファクタ時に明示 'ai' 指定 + default 撤廃を検討
- **ErrorContext を table-driven に拡張**: `'ai' | 'firestore'` 2 値の string union は PR-F で `'usage'` 追加時に `MESSAGES[context]` lookup table へ移行（type-design-analyzer 指摘）。`Record<ErrorContext, { transient: string; generic: string; useAiRegex: boolean }>` の satisfies で typed exhaustiveness を強制
- **mountAiRoutes 引数の名前付きオプション化**: 現状 `...preMiddlewares: RequestHandler[]` rest で `verifyIdToken` を二重渡せてしまう。PR-F で `mountAiRoutes(app, { rateLimit?: RequestHandler })` 形式に変更し、認証 middleware の二重 mount を type 段で禁止（type-design-analyzer 指摘）
- **PR-E /review-pr で見送った既存ロジック改善 (Issue 化候補)**:
  - `extractMessage` の `error?.error?.message` 優先順位が SDK update で容易に壊れる（silent-failure-hunter rating 8）— PR-D 由来既存ロジックのため本 PR スコープ外
  - CI (`.github/workflows/deploy.yml`) に `npm run test` step が無い（pr-test-analyzer rating 9）— deploy 経路の変更のため本 PR スコープ外

### PR-E で確定した設計判断

- **mountAiRoutes 抽出**: server/index.ts と test 2 ファイルで middleware mount 順序を二重管理する drift リスクを `server/aiRoutes.ts` 新規ファイルへの集約で解消（/simplify reuse-reviewer 指摘 P3）
- **isEmulatorMode 統一**: `server/firebaseAdmin.ts` の private function を export 化し `startupProbe.ts` で再利用。両者で挙動が乖離（前者は `host:port` pattern 検証あり、後者は lax な Boolean(env)）すると probe が誤って skip される silent failure リスクを排除（/simplify reuse-reviewer 指摘 P1）
- **handleApiError context 引数の default = 'ai' 維持**: 既存 AI route 6 ファイルの 2 引数呼び出しを保護する backward compat の価値が、誤指定リスクより大きいと判断。AI route リファクタは PR-F に統合
- **emulator 統合テストを `npm run test` から除外**: emulator 起動依存テストは別 script (`npm run test:integration`) で `firebase emulators:exec` 配下実行。CI 統合は PR-G で usage クォータ実装と一緒に検討

---

## PR-F: usage クォータ実装 + 持越/PR-E 反映 + Issue #40

ブランチ: `feature/m3-pr-f-usage-quota`

### 背景

PR-E で AI route 全 11 endpoint が `verifyIdToken` middleware 経由になり、`req.user.uid` が
取れる状態になった。本 PR で uid ベースの月間コストクォータを導入し、Cloud Run public 化
（PR-G）の前提となる「課金保護」を完成させる。Tier 1 (free) ユーザーが Vertex AI / Imagen の
課金を踏み倒さない構造を BE 側で強制する。

### タスク

#### F.1 errorHandler 改修（context table 化 + 'usage' 追加 + extractMessage 修正）
- [x] `ErrorContext` を `'ai' | 'firestore' | 'usage'` に拡張、`MESSAGES` table-driven 化（`as const satisfies` で exhaustive）
- [x] `handleApiError` から default context 撤廃（呼出元が必須引数で明示）
- [x] `extractMessage` を outer/inner 連結方式に変更し RESOURCE_EXHAUSTED 等の silent fallthrough を排除（Issue #40）
- [x] `errorHandlerMiddleware` は context='ai' 明示

#### F.2 usage 設定
- [x] `server/services/usageConfig.ts` 新規: `MONTHLY_LIMIT_SEN`, `ROUTE_COST_SEN`, `MAX_PROCESSED_IDS`, `Tier`, `AiRouteKey`
- [x] `docs/spec/m3/usage-cost-config.md` 新規: 上限値・固定コストの根拠記録

#### F.3 usageService 本体
- [x] `server/services/usageService.ts` 新規:
  - `reserve(uid, requestId, estimatedCost, limit, db?)`: transaction 内で重複 / 上限を check
  - `commit(uid, requestId, actualCost, db?)`: reservedCost → usedCost 移動、processedIds に追加
  - `cancel(uid, requestId, db?)`: reservation 解除、idempotent
  - `getUsage(uid, db?)`: 残量取得（PR-G で FE 残量バーに使用予定）
  - `QuotaExceededError` / `DuplicateRequestError` / `ReservationNotFoundError` カスタム例外

#### F.4 withUsageQuota ラッパ + AI route 全書き換え
- [x] `server/middleware/withUsageQuota.ts` 新規: AI route 用高階関数
  - reserve → handler → commit/cancel の 3 phase 統括
  - handler 引数を `AuthedRequest` に narrow（PR-D 持越 #3 解消）
  - `requestId` 必須化（8〜128 文字、未指定で 400 + INVALID_REQUEST_ID）
  - `QuotaExceededError` → 429 + `{code:'QUOTA_EXCEEDED', usage}`
  - `DuplicateRequestError` → 409 + `{code:'DUPLICATE_REQUEST'}`
  - reserve 成功後の AI 失敗 → cancel 経路で reservation 解除
- [x] AI route 6 ファイル (novel/character/world/image/utility/analysis) を `withUsageQuota` でラップ書き換え。各 route 内の `try/catch` + `handleApiError` 直呼びは withUsageQuota に集約

#### F.5 mountAiRoutes 名前付きオプション化
- [x] `mountAiRoutes(app, options: MountAiRoutesOptions)` 形式に変更
- [x] `MountAiRoutesOptions = { rateLimit?: RequestHandler }` で `verifyIdToken` 二重渡しを type 段で禁止
- [x] `server/index.ts` 呼出側を `mountAiRoutes(app, { rateLimit: aiLimiter })` に更新
- [x] `ai-auth.test.ts` の Middleware order contract test を新 API に追従（`mountAiRoutes(app, { rateLimit })`）

#### F.6 firestore.rules
- [x] `match /usage/{uidYyyymm}` 追加、`allow read, write: if false`（client 全拒否、admin SDK のみ書込み）
- [x] PR-G で client read 緩和予定（残量バー表示）の意図をコメント明記

#### F.7 テスト
- [x] `server/middleware/errorHandler.test.ts`: 49 ケース（既存 27 + 'usage' context + extractMessage 連結 + Issue #40 統合）
- [x] `server/services/usageService.test.ts` 新規: 28 ケース（reserve/commit/cancel/getUsage/lifecycle/境界値/UTC 月境界耐性 3）
- [x] `server/routes/ai-auth.test.ts` 拡張: 20 ケース（既存 16 + INVALID_REQUEST_ID + QUOTA_EXCEEDED + DUPLICATE_REQUEST + AI 失敗 cancel）
- [x] `tests/integration/ai-auth.test.ts` 拡張: 5 ケース（既存 3 + DUPLICATE_REQUEST + INVALID_REQUEST_ID）
- [x] `scripts/test-firestore-rules.ts`: usage コレクション 5 ケース追加（client 全拒否を 4 経路で）

#### F.8 ドキュメント整備
- [ ] `docs/spec/m3/tasks.md` 本セクション ✅ 更新
- [ ] `docs/handoff/LATEST.md` を PR-F 完了状態に更新

### Acceptance Criteria

- [x] **F1**: 新規 uid で reserve → `usage/{uid_yyyymm}` doc が `usedCost: 0, reservedCost: estimated, reservations: {requestId: estimated}, processedIds: []` で作成（usageService.test.ts）
- [x] **F2**: 同一 requestId で reserve を 2 回呼ぶと 2 回目は `DuplicateRequestError` → 409 + `{code:'DUPLICATE_REQUEST'}`（usageService.test.ts + ai-auth.test.ts）
- [x] **F3**: `usedCost + reservedCost + estimatedCost > limit` → `QuotaExceededError` → 429 + `{code:'QUOTA_EXCEEDED', usage:{used,reserved,limit}}`（usageService.test.ts + ai-auth.test.ts）
- [x] **F4**: AI service throw 時に cancel が呼ばれ `reservedCost -= estimatedCost`、`usedCost` 不変（ai-auth.test.ts + usageService.test.ts）
- [x] **F5**: client から `usage/{uid_yyyymm}` の read/write が rules で全拒否（test-firestore-rules.ts、未認証/自 uid/他 uid の 4 経路で確認）
- [x] **F6**: `extractMessage` が outer + inner 連結で RESOURCE_EXHAUSTED / UNAUTHENTICATED の silent fallthrough を排除（errorHandler.test.ts、Issue #40 シナリオで 429 / 401 にリクラス）
- [x] **F7**: `handleApiError` の context 引数が default 撤廃で必須化（`tsc --noEmit` で legacy 2 引数呼出が compile error）。`'usage'` context は `MESSAGES.usage` で文言切替
- [x] **F8**: AI route 6 ファイルが `withUsageQuota('<routeKey>', async (req) => ...)` 形式に統一、handler 引数が `AuthedRequest` で narrow（PR-D 持越 #3 解消）。`grep -n 'try {' server/routes/{novel,character,world,image,utility,analysis}.ts` で 0 件
- [x] **F9**: `mountAiRoutes(app, { rateLimit?: RequestHandler })` 名前付き化。旧 `...preMiddlewares: RequestHandler[]` rest 引数で `verifyIdToken` を二重に渡せた経路を構造的に排除（rateLimit 専用フィールドのみ受付）。`{ rateLimit: verifyIdToken }` という意図的誤用は型上は通るが、API 名称で意図が明確化されている
- [x] **F10**: `npm run lint` PASS、`npm run test` PASS（既存 89 + 新規 ~44 = 133 PASS）、`npm run test:firestore-rules` PASS（既存 15 + 新規 5 = 20 PASS）
- [x] **F11**: UTC 月境界跨ぎ耐性 — `reserve` の `ReservationHandle` を `commit`/`cancel` に持ち回り、reserve@4/30 23:59:59 → commit@5/1 00:00:01 のシナリオで同じ doc を確実に操作する（`usageService.test.ts` "UTC month boundary" 3 ケース）

### 手動検証手順

1. `npm install`（dev dependency 追加なし）
2. `npm run lint` → 0 error
3. `npm run test` → 130 PASS
4. `npm run test:firestore-rules` → 20 PASS
5. `npm run build` → vite build 成功
6. (任意) `npm run test:integration` → emulator 起動で 5 ケース PASS

### 品質ゲート

- [x] `npm run lint` PASS
- [x] `npm run test` PASS (130/130 + 5 skipped integration)
- [ ] `npm run build` PASS
- [x] `npm run test:firestore-rules` PASS (20/20)
- [ ] `/simplify`（reuse / quality / efficiency 3 並列）
- [ ] Evaluator 分離（10+ ファイル変更 + 新機能 → rules/quality-gate.md 発動 ✅）
- [ ] `/review-pr`（6 エージェント並列）
- [ ] CI deploy.yml の test job が PR push で PASS

### PR-G 持越事項

- **FE 側 Bearer 付与 + needsUserInit retry signal**: M2 持越 #2、PR-G で実装
- **FE 側 401/429/503/409 トースト**: PR-G
- **Cloud Run `--allow-unauthenticated` 復活**: PR-G
- **Tier 取得 (users.plan を Firestore から)**: PR-G or M5 で実装。PR-F では固定 'free'
- **client から usage doc の read 許可**: 残量バー表示と一緒に PR-G で rules 緩和
- **actual metadata 精算**: Vertex AI 応答の usage_metadata から token 数取得 → commit の actualCost 補正。observability 追加として M3 完了後に検討

---

## PR-G: FE 統合 + Cloud Run 公開

ブランチ: `feature/m3-pr-g-fe-integration`

> 詳細タスクは PR-F マージ後に拡充。骨子のみ記載。

### 概要

- `apiCall` (apiClient.ts) に `auth.currentUser.getIdToken()` 取得 + `Authorization: Bearer` 付与
- `authSlice` に `needsUserInit: boolean` flag 追加 (持越 #2)、users/init 失敗時 true セット
- AI 呼び出し前に `needsUserInit` チェック → true なら users/init 再試行
- 401/429/503 のレスポンスハンドリング (UI トースト)
- `.github/workflows/deploy.yml` で `--allow-unauthenticated` 復活（要確認: 現状は `--no-allow-unauthenticated` か `flags` から外されているか）
- ADR-0001 ロードマップ M3 ✅ 完了 + 振り返り追記
- CLAUDE.md "AI API 層" 表更新
- `docs/handoff/LATEST.md` を M3 完了状態に更新

### Acceptance Criteria（骨子）

- G1: `apiCall` が ID Token を `Authorization: Bearer` で付与
- G2: `needsUserInit=true` 状態の AI 呼び出しで users/init 再試行
- G3: 401/429/503 で適切なトースト
- G4: Cloud Run public + 直接アクセスが BE で 401
- G5: ADR / handoff / CLAUDE.md 同期

---

## M3 完了の定義

- [ ] PR-D AC 全 PASS、merge 済
- [ ] PR-E AC 全 PASS、merge 済
- [ ] PR-F AC 全 PASS、merge 済
- [ ] PR-G AC 全 PASS、merge 済
- [ ] ADR-0001 ロードマップ表 M3 ✅ 完了に更新
- [ ] `docs/handoff/LATEST.md` 更新（次マイルストーン M4 への申し送り）
