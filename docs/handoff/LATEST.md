# Handoff: M3 PR-D 完了 / テスト基盤 + 持越 #1/#4/#5 消化 / PR-E 待機

- Session Date: 2026-04-27
- Owner: yasushi-honda
- Status: ✅ 再開可能（M3 PR-D 完了、PR-E 着手待機）

## 今セッションの完了内容

| 区分 | 完了事項 | 成果物 |
|---|---|---|
| 運用 | 本番 Firestore rules デプロイ (`novel-writer-dev`) | rules release (firestore.rules unchanged) |
| インフラ | GitHub Actions actions を Node 24 対応版へ bump (`actions/checkout@v5`, `google-github-actions/{auth,setup-gcloud,deploy-cloudrun}@v3`) | PR #36 / commit `da69984` / deploy run 24975901271 success |
| 設計 | M3 spec 新規作成 (`docs/spec/m3/tasks.md`)、M2 spec フォーマット踏襲、PR-D 詳細 + PR-E/F/G 骨子 + 持越事項 | PR #37 |
| 実装 | M3 PR-D: vitest + supertest 導入、`verifyIdToken` transient コード拡張 (持越 #5)、`AuthedRequest` export + `sanitizeForUpdate` 型強化 (持越 #4)、`/api/users/init` Partial Update assertion テスト (持越 #1) | PR #37 / commit `592abf4` |
| 品質ゲート | `/impl-plan` (ユーザー承認) → 実装 → `evaluator` (D7 FAIL → 訂正) → `/review-pr` 4 並列 (rating 8 silent failure 検出 → 再訂正 + 観測性向上) | 多段レビュー記録 |
| 修正サイクル | sanitize 戻り値型を `Partial<X>` → `X` (evaluator 指摘) → `Partial<SanitizedForUpdate<T>>` (silent-failure-hunter / type-design-analyzer 一致指摘で revert) で確定 | 同 PR #37 (commit `02b3f6a` → `2609cfe`) |
| 観測性 | `verifyIdToken` permanent path を expected (warn) / unexpected (error) で分岐、`auth/quota-exceeded` 等の分類漏れが Sentry に届くよう改善 + spy アサート追加 | 同 PR #37 |
| マージ | PR #36 / PR #37 ともに squash merge → Cloud Run デプロイ success (run 24975901271 / 24976846671) | 2 件マージ |
| ドキュメント | ADR-0001 ロードマップ表 M3 を 🚧 進行中に更新、PR-D 完了情報を反映 | 本ハンドオフ PR |

**M3 PR-D マイルストーン完了**（テスト基盤確立 + M2 持越 5 項目のうち #1/#4/#5 消化、PR-E 着手準備完了）。

## 次セッション開始時の状態

- ブランチ: `main` clean、origin/main と同期済み (commit `592abf4`)
- 進行中の feature ブランチ: `docs/handoff-m3-pr-d-completed` — 本ハンドオフ用
- Open Issue: 0 件
- Open PR: 1 件（本セッションで作る handoff PR）
- グローバル `~/.claude/` への変更なし（プロジェクト CLAUDE.md §1 遵守）
- main 直 push なし、feature ブランチ + PR 運用維持（プロジェクト CLAUDE.md §2 遵守）
- 自動テスト: vitest 31/31 PASS (`server/middleware/verifyIdToken.test.ts` 20 + `server/routes/users.test.ts` 11) + rules unit test 15 ケース PASS

## 次のアクション（推奨順）

### 1. 本ハンドオフ PR をレビュー → merge
- `gh pr view <本 PR>` で内容確認
- ユーザー明示認可後 `gh pr merge <PR#> --squash --delete-branch`

### 2. M3 PR-E 着手（BE AI 認証ゲート + 起動 probe + handleApiError 共通化）
- `git checkout main && git fetch && git reset --hard origin/main`
- `git checkout -b feature/m3-pr-e-ai-auth-gate`
- `docs/spec/m3/tasks.md` PR-E セクションを骨子から詳細タスクへ拡充
- 主要実装:
  - 全 `/api/ai/*` 経路に `verifyIdToken` middleware 適用（`server/index.ts` mount）
  - `startServer()` 内で `getFirebaseAuth()` 呼出 → ADC 未設定で同期 fail-fast (持越 #3)
  - `handleApiError` を Firestore code (`UNAVAILABLE`/`DEADLINE_EXCEEDED`) 対応に汎用化
  - `users.ts` の inline `formatFirestoreError` 削除 + 共通化
  - AI route ごとに supertest 契約テスト追加
- **`/impl-plan` 起動時、本ハンドオフの「PR-D /review-pr 持越事項（3 件）」を計画に組み込むこと**:
  1. `FirebaseAuthError instanceof` の本物テスト（emulator 経由の AI route 統合テストで検証）
  2. `auth/quota-exceeded` の transient 分類検討（Firebase 公式仕様確認後 `TRANSIENT_AUTH_CODES` 追加）
  3. `AuthedRequest` の handler 引数型化（`router.post('/init', verifyIdToken, (req: AuthedRequest, res) => ...)` でコードベース全体統一、type assertion 廃止）

### 3. M3 PR-F 着手（usage クォータ実装）
- ブランチ: `feature/m3-pr-f-usage-quota`
- `server/services/usageService.ts` 新規（transaction 予約 + requestId 冪等）
- `firestore.rules` に `usage/{uidYyyymm}` 追加（client read/write 全拒否）
- rules unit test 追加
- 月間コスト上限超過 → 429 with `{ code: 'QUOTA_EXCEEDED', usage, limit }`

### 4. M3 PR-G 着手（FE 統合 + Cloud Run public）
- ブランチ: `feature/m3-pr-g-fe-integration`
- `apiCall` に Bearer 付与 + `needsUserInit` retry signal (持越 #2)
- 401/429/503 トーストハンドリング
- `--allow-unauthenticated` 復活（`.github/workflows/deploy.yml`）
- ADR-0001 M3 ✅ 完了マーク + 振り返り追記

## 申し送り事項（重要）

### M2 持越項目 5 件の進捗

| # | 項目 | 担当 PR | 状態 |
|---|---|---|---|
| 1 | `/api/users/init` route Partial Update assertion テスト未整備 | PR-D | ✅ 完了 (PR #37) |
| 2 | FE 側 users/init 失敗 retry signal (`needsUserInit` flag) | PR-G | ⏳ 未着手 |
| 3 | `applicationDefault()` eager init (起動時 probe で fail-fast) | PR-E | ⏳ 未着手 |
| 4 | 型強化 (`AuthedRequest` export / `sanitizeForUpdate` undefined フリー戻り値) | PR-D | ✅ 完了 (PR #37) |
| 5 | `verifyIdToken` transient エラーコード拡張 | PR-D | ✅ 完了 (PR #37) |

### M3 PR-D /review-pr で発覚した PR-E 持越事項 3 件

PR-D 内では対応せず PR-E でコードベース全体一貫の対応を行う:

1. **`FirebaseAuthError instanceof` の本物テスト**: PR-D は `vi.mock` でプレーンオブジェクト経路のみ検証。`isTransientAuthError` の `instanceof FirebaseAuthError` 分岐は本物の firebase-admin スロー時のみ発火するため、PR-E E4 の emulator 経由 AI route 統合テストで本物の `FirebaseAuthError` が transient/permanent 分類を通ることを確認すること
2. **`auth/quota-exceeded` の transient 分類**: 現状 permanent (401) に落ちる。PR-D で `console.error` (unexpected permanent) で観測性は確保したが、Firebase Admin SDK 公式仕様確認後 `TRANSIENT_AUTH_CODES` 追加を検討
3. **`AuthedRequest` の handler 引数型化**: PR-D では `(req as AuthedRequest).user` キャスト + `if (!user)` 二重防御の構造を維持。PR-E で `/api/ai/*` 全 route に middleware を適用するタイミングで `router.post('/init', verifyIdToken, (req: AuthedRequest, res) => ...)` の handler 引数型 + middleware mount-level 型強制に統一する（codebase 全体一貫性、type-design-analyzer T2 / code-reviewer S-2 指摘）

### PR-D で確定した重要設計判断

- **`sanitizeForUpdate` 戻り値型は `Partial<SanitizedForUpdate<T>>`**: ランタイムが「値が undefined のキーごと削除」する挙動と、型表明「optional キー + 値域 undefined フリー」を一致させた。evaluator が D7 で `Partial` を外せと指摘したが、silent-failure-hunter / type-design-analyzer の独立レビューで「`Partial` を外すと型がランタイム不一致 → silent partial update リスク」と発覚し revert。AC D7 文言も「optional キー許容、値域 undefined フリー」と明確化
- **`verifyIdToken` permanent path の log level 分岐**: expected (`auth/argument-error`/`id-token-expired`/`id-token-revoked`/`invalid-id-token`) は warn、それ以外 (分類漏れ・SDK breaking・設定ミス可能性) は error。Sentry で観測可能に
- **テスト方針: admin SDK は `vi.mock` で差し替え**: emulator を使わない高速単体・契約テスト。emulator 統合テストは PR-E で AI 経路と一緒に追加する設計（PR-D で emulator helper 整備を見送ったのは spec で N/A 明記）

### 環境状況

- `.envrc` 設定済（GH_TOKEN 自動取得 + GCP `novel-writer-dev`）
- `cd ~/Projects/学校/yamashita/novel-writer && claude` で起動すれば direnv 経由で正しいアカウントが有効化される
- 自動テスト基盤: vitest@^2.1.9 / supertest@^7.2.2 / @types/supertest@^7.2.0
- `npm run test` で 31 ケース、`npm run test:firestore-rules` で rules unit 15 ケース
- 残留 Node プロセスなし（doc-split 別プロジェクトの firebase emulator が動作中だが本プロジェクトとは無関係）

## Issue Net 変化

- Close 数: 0 件
- 起票数: 0 件
- Net: 0 件
- **進捗の質**: Net = 0 だが「進捗ゼロ扱い」ではない。本セッションでは:
  - PR #36 (GH Actions Node 24 対応) を merge し、Node 20 deprecation (2026-06-02 強制) リスク解消
  - PR #37 (M3 PR-D テスト基盤 + 持越 #1/#4/#5) を merge し、自動テスト 31 ケース確立 + M2 持越 5 項目のうち 3 件を消化
  - `/review-pr` 4 並列で rating 8 の silent failure (sanitize 型不一致) を発見し同 PR 内で訂正、`verifyIdToken` 観測性も向上
  - PR-E 持越 3 件は `docs/spec/m3/tasks.md` と本ハンドオフに集約済で、CLAUDE.md triage 基準（rating ≥ 7 + confidence ≥ 80 / 実害 / 再現バグ / CI 破壊 / ユーザー明示指示）を満たさないため Issue 化していない（過剰起票防止、`feedback_issue_triage.md` 準拠）

## ドキュメント整合性

| 項目 | 状態 | 備考 |
|---|---|---|
| `docs/spec/m3/tasks.md` PR-D タスク全 [x] | ✅ | テストヘルパー 2 行は [N/A] 注記で PR-E 持越と明示 |
| `docs/spec/m3/tasks.md` PR-D AC (D1-D7) | ✅ 全 [x] | D7 文言は「optional キー許容・値域 undefined フリー」と明確化 |
| `docs/spec/m3/tasks.md` PR-D 品質ゲート | ✅ lint / test / firestore-rules / `/review-pr` 完了 | `/simplify` / `evaluator` も実施済 (evaluator は D7 訂正サイクルで貢献) |
| `docs/spec/m3/tasks.md` PR-E 持越事項 | ✅ 3 件記載 | FirebaseAuthError instanceof / auth/quota-exceeded / AuthedRequest 引数型化 |
| ADR-0001 ロードマップ表 M3 | ✅ 🚧 進行中に更新 | 本ハンドオフ PR で更新 |
| `CLAUDE.md` "Commands" 表 | ✅ 更新済（PR #37） | npm run test / test:watch / test:firestore-rules + テスト住み分け説明 |
| `tests/README.md` テスト住み分け | ✅ 更新済（PR #37） | vitest ↔ rules unit ↔ 手動 QA の 3 段階 |
| 本番 Firestore rules デプロイ | ✅ 実行済（2026-04-27） | `novel-writer-dev` に release |
| GitHub Actions Node 24 対応 | ✅ 完了（PR #36） | deploy run success で動作確認済 |

## 残留プロセス

⚠️ **3 プロセス検出（ただし全て別プロジェクト `doc-split` の firebase emulator）**

- PID 18240/18242/18282: `firebase emulators:exec --only firestore --project doc-split-test ...`
- 本プロジェクト (novel-writer) のプロセスではない → **本プロジェクトのハンドオフ範囲外、本セッションでは停止しない**
