# Handoff: M3 PR-E 完了 / 持越 #3 消化 + /review-pr 対応 / PR-F 待機

- Session Date: 2026-04-27
- Owner: yasushi-honda
- Status: ✅ 再開可能（M3 PR-E 完了、PR-F 着手待機）

## 今セッションの完了内容

| 区分 | 完了事項 | 成果物 |
|---|---|---|
| 設計 | M3 PR-E 詳細タスク化（PR-D 骨子から拡充）、AC E1-E8 定義、PR-F 持越事項記録 | `docs/spec/m3/tasks.md` PR-E セクション |
| 実装 | `/api/ai/*` 全 11 endpoint に `verifyIdToken` middleware を prefix 単位で適用 (`mountAiRoutes` 抽出) | `server/aiRoutes.ts` 新規 / `server/index.ts` 修正 |
| 実装 | `startServer()` 先頭で Firebase Auth credential を eager 評価、ADC 未設定で fail-fast (M2 持越 #3 消化) | `server/startupProbe.ts` 新規 |
| 実装 | `handleApiError(error, fn, context: 'ai' \| 'firestore')` で Firestore gRPC code 分類を統合 | `server/middleware/errorHandler.ts` 修正 |
| 実装 | `users.ts` から `formatFirestoreError` + `TRANSIENT_FIRESTORE_CODES` 削除 | `server/routes/users.ts` 修正 |
| 実装 | `firebaseAdmin.ts` の `isEmulatorMode` / `hasEmulatorHost` を export 化、startupProbe と挙動共有 | `server/firebaseAdmin.ts` 修正 |
| 実装 | `verifyIdToken.ts` に `auth/quota-exceeded` 公式仕様確認結果コメント (PR-D /review-pr 持越 #2 消化) | `server/middleware/verifyIdToken.ts` 修正 |
| テスト | vitest 89/89 PASS (元 31 + 新規 58: errorHandler 28 + startupProbe 8 + ai-auth 16 + integration 3 + users +1 + helpers) | 5 test ファイル |
| テスト | emulator 統合テスト追加で本物 `FirebaseAuthError instanceof` 経路網羅 (PR-D /review-pr 持越 #1 消化) | `tests/integration/ai-auth.test.ts` 新規 |
| 品質ゲート | `/impl-plan` → 実装 → `/simplify` (3 並列) → `evaluator` (5 ファイル+ かつ新機能発動) → `/review-pr` (6 並列) | PR #39 内で全対応 |
| 観測性向上 | gRPC string code 正規化 (trim+uppercase)、users/init forensic uid log、emulator host invalid warn、`auth/quota-exceeded` unexpected log 経路明記 | review fix commit `8796842` |
| 設計簡素化 | `mountAiRoutes` 抽出で本番と test の middleware mount drift 防止、`isEmulatorMode` 二重定義解消、`hasEmulatorHost` の env var を `EmulatorEnvVar` literal union に narrowing | 同 PR #39 |
| マージ | PR #39 squash merge → main 5280c40 | 1 件マージ |
| Issue 起票 | #40 (extractMessage 優先順位、P1) / #41 (CI deploy.yml test step、P0) | triage 基準 (rating ≥ 7 + confidence ≥ 80) を満たす 2 件 |
| ラベル整備 | P0/P1/P2 labels を新規作成（CLAUDE.md 規範実装） | リポジトリラベル |
| ドキュメント | `docs/spec/m3/tasks.md` PR-E セクション ✅ 詳細化、PR-F 持越事項追記 | 同 PR #39 |

**M3 PR-E マイルストーン完了**（BE 認証ゲート + 起動 probe + handleApiError 共通化、M2 持越 5 項目のうち #3 消化、PR-D /review-pr 持越 3 件のうち #1 #2 消化、PR-F 着手準備完了）。

## 次セッション開始時の状態

- ブランチ: `main` clean、origin/main と同期済み (commit `5280c40`)
- 進行中の feature ブランチ: `docs/handoff-m3-pr-e-completed` — 本ハンドオフ用
- Open Issue: 2 件（#40 P1 bug, #41 P0 enhancement、両方 PR-F or 別途で対応予定）
- Open PR: 1 件（本セッションで作る handoff PR）
- グローバル `~/.claude/` への変更なし（プロジェクト CLAUDE.md §1 遵守）
- main 直 push なし、feature ブランチ + PR 運用維持（プロジェクト CLAUDE.md §2 遵守）
- 自動テスト: vitest 89/89 PASS + rules unit 15 PASS

## 次のアクション（推奨順）

### 1. 本ハンドオフ PR をレビュー → merge
- `gh pr view <本 PR>` で内容確認
- ユーザー明示認可後 `gh pr merge <PR#> --squash --delete-branch`

### 2. M3 PR-F 着手（usage クォータ実装）
- `git checkout main && git fetch && git reset --hard origin/main`
- `git checkout -b feature/m3-pr-f-usage-quota`
- 詳細タスク: `docs/spec/m3/tasks.md` PR-F セクション（骨子から詳細タスクへ拡充するのが最初の作業）
- **`/impl-plan` 起動時、PR-E から繰越された以下を計画に組み込むこと**:
  - PR-D /review-pr 持越事項 #3: `AuthedRequest` handler 引数型化（usage 集計で `req.user.uid` を使うため）
  - PR-E /review-pr 反映: `handleApiError` context 明示化 + default 撤廃（既存 AI route 6 ファイルを `'ai'` 明示にリファクタ）
  - PR-E /review-pr 反映: `ErrorContext` を table-driven (`MESSAGES[context]` lookup) に拡張（PR-F で `'usage'` 追加見込み）
  - PR-E /review-pr 反映: `mountAiRoutes` 引数の名前付きオプション化 (`{ rateLimit?: RequestHandler }`)

### 3. Issue #41 (CI deploy.yml test step) 対応
- M3 PR-G の Cloud Run public 化前に解消が望ましい
- 規模小なので PR-F と並行 or 単独 PR で対応
- 内容: deploy.yml に test job 追加、`needs: test` で deploy をガード、`pull_request` trigger 拡張

### 4. Issue #40 (extractMessage 優先順位) 対応
- 単独 PR、規模小（errorHandler.ts のロジック修正 + テスト追加）
- PR-F のスコープ外でも実施可能

### 5. M3 PR-G 着手
- 詳細は `docs/spec/m3/tasks.md` PR-G セクション参照（PR-F マージ後に骨子を詳細化）
- 大筋: FE 統合 (apiCall に Bearer 付与 + 持越 #2) + 401/503/429 トースト + Cloud Run `--allow-unauthenticated` 復活 + ADR-0001 M3 ✅ 完了マーク

## 申し送り事項（重要）

### M2 持越項目 5 件の進捗

| # | 項目 | 担当 PR | 状態 |
|---|---|---|---|
| 1 | `/api/users/init` route Partial Update assertion テスト未整備 | PR-D | ✅ 完了 (PR #37) |
| 2 | FE 側 users/init 失敗 retry signal (`needsUserInit` flag) | PR-G | ⏳ 未着手 |
| 3 | `applicationDefault()` eager init (起動時 probe で fail-fast) | PR-E | ✅ 完了 (PR #39) |
| 4 | 型強化 (`AuthedRequest` export / `sanitizeForUpdate` undefined フリー戻り値) | PR-D | ✅ 完了 (PR #37) |
| 5 | `verifyIdToken` transient エラーコード拡張 | PR-D | ✅ 完了 (PR #37) |

### M3 PR-D /review-pr 持越事項 3 件の進捗

| # | 項目 | 状態 |
|---|---|---|
| 1 | `FirebaseAuthError instanceof` の本物テスト | ✅ 完了 (PR #39 `tests/integration/ai-auth.test.ts`) |
| 2 | `auth/quota-exceeded` の transient 分類検討 | ✅ 完了 (PR #39 公式仕様確認 → permanent 維持 + 観測継続をコメント記録) |
| 3 | `AuthedRequest` の handler 引数型化 | ⏳ PR-F に持越（usage 集計で `req.user.uid` を使うタイミングで実施） |

### M3 PR-E /review-pr で発覚した PR-F 持越事項

PR-E 内では対応せず PR-F でコードベース全体一貫の対応を行う:

1. **`handleApiError` context 明示化 + default 撤廃**: 既存 AI route 6 ファイル (novel/character/world/image/utility/analysis) が context default = 'ai' に依存。PR-F で AI route リファクタ時に明示 'ai' 指定 + default 撤廃を実施（誤指定で Firestore route から AI 文言が漏れる silent failure 排除）
2. **`ErrorContext` table 化**: `'ai' | 'firestore'` 2 値の string union を `Record<ErrorContext, { transient: string; generic: string; useAiRegex: boolean }>` の satisfies で typed exhaustiveness に変更。PR-F で `'usage'` context 追加時に強制
3. **`mountAiRoutes` 引数の名前付きオプション化**: 現状 `...preMiddlewares: RequestHandler[]` rest で `verifyIdToken` を二重渡せてしまう。PR-F で `mountAiRoutes(app, { rateLimit?: RequestHandler })` 形式に変更し、認証 middleware の二重 mount を type 段で禁止

### Issue 化 2 件 (本セッションで起票)

| # | タイトル | ラベル | 概要 |
|---|---|---|---|
| #40 | fix: extractMessage の優先順位が SDK update で壊れる silent failure リスク | P1 / bug | `error?.error?.message` 優先で外側 `error.message` の RESOURCE_EXHAUSTED 等を見逃す経路。PR-D 由来既存ロジック |
| #41 | ci: deploy.yml に npm run test step を追加 | P0 / enhancement | CI に test step なし、regression を検知できない構造的問題。PR-G の Cloud Run public 化前に解消推奨 |

### PR-E で確定した重要設計判断

- **`mountAiRoutes` factory 抽出**: 本番 `server/index.ts` と test 2 ファイルで middleware mount 順序の drift を `server/aiRoutes.ts` への集約で解消。preMiddleware → verifyIdToken の call order assertion で順序契約を test として固定（brute-force 防御の根幹）
- **`isEmulatorMode` 単一実装**: `server/firebaseAdmin.ts` から export 化し `startupProbe.ts` で再利用。`host:port` pattern 検証ロジックを共有して、開発者が port 忘れた時に silent に production fallback する経路を排除（warn ログで可視化）
- **`handleApiError` context default = 'ai' 維持**: 既存 AI route 6 ファイル backward compat の価値が、誤指定リスクより大きいと判断。AI route リファクタは PR-F に統合（理由は上記持越事項参照）
- **gRPC string code 正規化**: `isTransientGrpcError` で `trim().toUpperCase()` 適用。SDK が ' UNAVAILABLE' / 'unavailable' / 'UNAVAILABLE\\n' を返した場合の silent permanent fallthrough を排除（test で 4 variants 網羅）
- **`startServer().catch(process.exit(1))` 明示**: probeFirebaseAuth fail-fast の意義を Node バージョン非依存で保証。Cloud Run rollback 判定を確実化
- **Emulator 統合テスト分離**: `npm run test` から `tests/integration/**` を除外、`npm run test:integration` を `firebase emulators:exec --only auth,firestore` 配下で実行。CI 統合は Issue #41 で別対応

### 環境状況

- `.envrc` 設定済（GH_TOKEN 自動取得 + GCP `novel-writer-dev`）
- `cd ~/Projects/学校/yamashita/novel-writer && claude` で起動すれば direnv 経由で正しいアカウントが有効化される
- 自動テスト基盤: vitest@^2.1.9 / supertest@^7.2.2 + emulator helpers (`tests/helpers/{firestoreEmulator,mockIdToken}.ts`)

### 主要コマンド

```bash
npm run dev                # 開発サーバー起動（Express + Vite HMR, port 3000）
npm run dev:emu            # dev + Firebase Emulator 並列（auth:9099 / firestore:8080、env 注入済）
npm run lint               # 型チェック（tsc --noEmit）
npm run test               # vitest run（89 ケース、admin SDK は vi.mock、tests/integration 除外）
npm run test:watch         # vitest watch モード
npm run test:integration   # firebase emulators:exec で integration test (3 ケース、本物 verifyIdToken)
npm run test:firestore-rules  # firebase emulators:exec で rules unit test（15 ケース）
npm run build              # FE ビルド（dist/）+ サーバーコンパイル（dist-server/）
```

- 残留 Node プロセスなし（doc-split 別プロジェクトの firebase emulator は無関係）

## Issue Net 変化

- Close 数: 0 件（開始時 0 件、終了時 2 件 open）
- 起票数: 2 件（#40 P1 bug / #41 P0 enhancement）
- Net: **+2 件**（一見 KPI 悪化だが下記参照）
- **進捗の質**: Net = +2 だが、本セッションでは:
  - PR #39 (M3 PR-E) を merge し、`/api/ai/*` 全 11 endpoint への BE 認証ゲート + 起動 probe + handleApiError 統合を完了
  - M2 持越 5 項目のうち #3 を消化（applicationDefault eager init）
  - PR-D /review-pr 持越 3 件のうち #1 #2 を消化（FirebaseAuthError instanceof 経路 + auth/quota-exceeded 公式仕様確認）
  - `/review-pr` 6 並列で Critical 1 (silent failure) + High 4 を発見し同 PR 内で訂正、観測性も大幅向上
  - 起票した 2 件はいずれも triage 基準（rating ≥ 7 かつ confidence ≥ 80 / CI 破壊リスク）を厳格に満たす Critical 級。本来 Net は KPI として進捗を測るが、これらは PR-E スコープ外の構造的問題（PR-D 由来 + deploy 経路）で、起票しなかった場合は次セッションで失われていた知見
  - P0/P1/P2 ラベル新規作成で CLAUDE.md 規範を実装（次セッション以降の triage 効率化に寄与）

## ドキュメント整合性

| 項目 | 状態 | 備考 |
|---|---|---|
| `docs/spec/m3/tasks.md` PR-E タスク全 [x] | ✅ | E.1〜E.7 全完了、AC E1〜E8 全 [x] |
| `docs/spec/m3/tasks.md` PR-E 品質ゲート | ✅ | lint / test / firestore-rules / `/simplify` / evaluator / `/review-pr` 全完了 |
| `docs/spec/m3/tasks.md` PR-F 持越事項 | ✅ 5 件記載 | AuthedRequest narrowing / context 明示化 / table 化 / mountAiRoutes 名前付き化 / 既存ロジック改善 Issue 化候補 |
| `docs/spec/m3/tasks.md` 状態 | ✅ "PR-E 完了、PR-F 着手待機" | 行 3 |
| ADR-0001 ロードマップ表 M3 | 🚧 進行中（PR-D 完了時に更新済、PR-G 完了で ✅ に更新予定） | 変更不要 |
| `CLAUDE.md` "Commands" 表 | ✅ 更新不要（PR-D で `npm run test` 系追加済、PR-E で `npm run test:integration` 追加） | 本ハンドオフ PR で `npm run test:integration` 追記検討（任意） |
| `tests/README.md` テスト住み分け | ✅ 更新不要（PR-D で住み分け表追加済） | 必要なら integration test の存在を追記 |
| GitHub ラベル P0/P1/P2 | ✅ 新規作成 | CLAUDE.md 規範実装 |

## 残留プロセス

⚠️ **3 プロセス検出（ただし全て別プロジェクト `doc-split` の firebase emulator）** — 本プロジェクトとは無関係、停止しない。
