# M3: AI 認証ゲート + クォータ タスク表

- Status: 🚧 In Progress (PR-D 着手中)
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
| PR-D | テスト基盤 (vitest + supertest) + 持越 #1, #4, #5 | 中 | 3〜4 時間 | 🚧 着手中 |
| PR-E | `/api/ai/*` 全ルートに `verifyIdToken` 適用 + handleApiError 共通化 + 持越 #3 (起動 probe) | 中 | 2〜3 時間 | ⏳ 未着手 |
| PR-F | usage クォータ実装 (transaction 予約 + requestId 冪等 + コスト上限) + firestore.rules `usage` コレクション追加 | 大 | 4〜6 時間 | ⏳ 未着手 |
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

> 詳細タスクは PR-D マージ後に拡充。骨子のみ記載。

### 概要

- 全 `/api/ai/*` 経路に `verifyIdToken` middleware 適用（`server/index.ts` で route mount 時に `app.use('/api/ai', verifyIdToken, ...)` 形式）
- `startServer()` 内で `getFirebaseAuth()` 呼出を行い ADC 未設定なら同期 fail-fast (持越 #3)
- `handleApiError` を Firestore code (`UNAVAILABLE`/`DEADLINE_EXCEEDED` など) に対応汎用化
- `users.ts` の inline `formatFirestoreError` を削除し共通化
- AI route ごとに supertest 契約テスト追加 (Authorization なし → 401 / 期待形式)

### Acceptance Criteria（骨子）

- E1: 全 `/api/ai/*` で Authorization なし → 401
- E2: ADC 未設定環境で server 起動が同期 fail
- E3: `handleApiError` が Firestore code を 503/500 に分類するテスト PASS
- E4: emulator フローで AI 経路 (例: `/api/ai/utility/names`) が ID Token 付きで 200

---

## PR-F: usage クォータ実装

ブランチ: `feature/m3-pr-f-usage-quota`

> 詳細タスクは PR-E マージ後に拡充。骨子のみ記載。

### 概要

- `server/services/usageService.ts` 新規（`reserve` / `commit` / `cancel`、transaction 予約 + requestId 冪等）
- 各 AI route で reserve → 実行 → commit / 失敗時 cancel のラップ
- `firestore.rules` に `usage/{uidYyyymm}` を追加（client read/write 全拒否、admin SDK のみ）
- rules unit test 追加
- 月間コスト上限超過 → 429 with `{ code: 'QUOTA_EXCEEDED', usage, limit }`

### Acceptance Criteria（骨子）

- F1: `usage/{uid_yyyymm}` ドキュメントが新規月で 0 から開始
- F2: 同一 requestId で 2 度呼ぶと 2 回目は加算しない
- F3: 上限到達時 429 + `code: 'QUOTA_EXCEEDED'`
- F4: AI 失敗時 cancel で予約取消、二重課金なし
- F5: client から usage への直接アクセスは rules で全拒否

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
