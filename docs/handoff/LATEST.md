# Handoff: Issue #49 rating ≥ 7 全消化 / 次フェーズ着手待機

- Session Date: 2026-04-28（午後セッション、Issue #49 follow-up 集中対応）
- Owner: yasushi-honda
- Status: ✅ 再開可能（M4 完了 + Issue #49 rating ≥ 7 全消化、Stripe 後送り戦略の P4 (M7-α 公開準備) または P5 (M6 E2EE) 着手待機）

## 今セッションの完了内容

| PR | 内容 | merge | 行数 |
|---|---|---|---|
| #51 | H6 isBackupStale 境界値テスト + `vi.setSystemTime` 固定（CLAUDE.md MUST 違反解消） | ✅ | +57 |
| #52 | H4 setImportResolution → executeImport 通しテスト + H5 TOCTOU 再 read 回帰テスト | ✅ | +287 |
| #53 | H6-followup-1/2 isBackupStale 状態空間テスト（unknown × non-null + 空文字列）+ 文言修正 | ✅ | +60 |
| #54 | H10 Dexie blocked-event ハンドラ + bootstrap-gap pending queue + 例外 swallow + 二度発火抑制 | ✅ | +267 |
| #55 | H10-followup-1 `wireBlockedHandler` 契約テスト（Codex セカンドオピニオン取得済） | ✅ | +158 |
| #56 | H10-followup-2/3 payload-bearing BlockedHandler + MockDexie 強化 + Readonly payload + 例外 wrapper | ✅ | +300 |
| #57 | H2 旧設計（flushSave catch + retry）→ silent-failure-hunter Critical で **close**（root-cause 誤認） | ❌ closed | - |
| #58 | H2 再設計（flushSaveBlocking 新 API + BackupPreflightError）+ Evaluator 分離 APPROVE | ✅ | +549 |

**Issue #49 rating ≥ 7 項目すべて消化完了**: H2 (#58) / H4 (#52) / H5 (#52) / H6 (#51) / H10 (#54) + follow-up 系 H6-followup-1/2 (#53) / H10-followup-1 (#55) / H10-followup-2/3 (#56)。

### PR #57 → #58 の設計やり直し（重要事例）

PR #57 で `prepareImport` の `flushSave` rejection を catch して abort する設計を採ったが、`/review-pr` の silent-failure-hunter が **致命的欠陥** を指摘:

> 既存 `flushSave` は `saveStatus === 'saving'` 中に **throw せず即 resolve**（`syncSlice.ts:37-40`）。`prepareImport` の catch wrapper では in-flight failure を観測できず、silent edit-loss path 残存。

→ PR #57 を close、`syncSlice` 側に新 API `flushSaveBlocking` が必要と判明し、PR #58 で再設計。Codex GPT-5.2 + Evaluator subagent でセカンドオピニオン取得、APPROVE 判定後マージ。

**教訓**: 既存実装の挙動（`flushSave` の silent resolve 設計）を見落として fix を組むと、表面的に解決した気になっても silent path が残存する。`silent-failure-hunter` の Critical 指摘は前提崩壊レベルとして扱い、設計ごとやり直す判断が必要。

## 次セッション開始時の状態

- ブランチ: `main` clean、origin/main と同期済み（HEAD `e7ce98f`）
- Open Issue: 1 件（#49 follow-up umbrella、能動的作業不要・monitor 対象として open 維持）
- Open PR: 0 件（本セッションで作る handoff PR を除き、全 PR merge 済 + #57 close 済）
- グローバル `~/.claude/` への変更なし（プロジェクト CLAUDE.md §1 遵守）
- main 直 push なし、feature ブランチ + PR 運用維持（プロジェクト CLAUDE.md §2 遵守）
- 自動テスト: vitest 259/259 PASS（13 ファイル: 前 M4 終了時 204 → +55 ケース追加）
- 型チェック: `tsc --noEmit` 0 errors / build OK

## 次のアクション（推奨順）

### 1. 本 handoff PR をレビュー → merge

- `gh pr view <number>` で内容確認
- ユーザー明示認可後 `gh pr merge <number> --squash --delete-branch`

### 2. P4 (M7-α 公開準備) または P5 (M6 E2EE) 着手

Stripe 後送り戦略（PM/PL 合意）の通り、Stripe (M5) は最後に回す。

- **P4 (M7-α 公開準備、Stripe 不要範囲)** 推奨: 利用規約 Tier 0/1 / 特商法 stub / プライバシーポリシー / 観測性 / エラー報告で 4〜6h 想定
- **P5 (M6 E2EE バックアップ)**: ADR-0001 で Tier 2 前提と明記、Stripe 後送り推奨。M4 で確定した backup schema v1 を AES-GCM 暗号化対象として再利用予定

着手時に `/impl-plan` で詳細計画を立てる。

### 3. Issue #49 follow-up（rating ≤ 6、能動的作業不要、monitor 対象）

`memory/feedback_issue_postpone_pattern.md` に従い、open 維持で監視。再開条件:

- 上記 follow-up のいずれかが本番障害として再現（ユーザー報告 / Sentry エラー）
- M5 以降で同一コードパスを触る必要が生じた
- review agent による rerating で `rating ≥ 7` への昇格

## 申し送り事項（重要）

### Issue #49 follow-up（open 維持、rating ≤ 6）

| ID | rating | 内容 |
|---|---|---|
| H10-followup-4 | 5-6 | `IDBVersionChangeEvent` の `oldVersion === undefined` polyfill 防衛 |
| H10-followup-5 | 3 | 静的検査（`useLocalSync.test.ts`）の脆さ緩和 |
| H10-followup-6 | 2-3 | observability（pendingBlockedCount / Sentry 連携） |
| H2-followup-1 | 5 | `flushSaveBlocking` の `timeoutMs` domain 制約（負数/0 ガード） |
| H2-followup-2 | 6 | 5 秒 retry timer の `_savingPromise` 連携 |
| H2-followup-3 | 6 | `flushSaveBlocking` timeout 後の遅延 settle 整理 |
| H2-followup-4 | 5 | 並行 flushSave / `_savingPromise` race のテスト |
| H2-followup-5 | 5 | legacy fallback の rejection path テスト |

### M4 累積実績

| PR | 内容 | merge 日 | 行数 |
|---|---|---|---|
| #48 | M4 全体 + 品質ゲート 7 件 review fix | 2026-04-27 | +1547/-98 |
| #50 | docs(handoff) M4 完了記録 | 2026-04-27 | - |
| #51-#56, #58 | Issue #49 rating ≥ 7 follow-up 消化（7 PR） | 2026-04-28 | +1678 |

### 主要 API 拡張（今セッション）

- `db/dexie.ts`: `setBlockedHandler(BlockedHandler \| null)` + `BlockedEventPayload` (`Readonly<{ oldVersion, newVersion }>`) + bootstrap-gap pending queue + 例外 wrapper
- `hooks/useLocalSync.ts`: `wireBlockedHandler(): () => void` 純粋関数 + `DB_BLOCKED_MESSAGE` export
- `store/syncSlice.ts`: `_savingPromise: Promise<void> \| null` + `flushSaveBlocking(timeoutMs?: number)` 新 API + `SAVE_RETRY_DELAY_MS` / `FLUSH_SAVE_BLOCKING_DEFAULT_TIMEOUT_MS` 定数 export
- `utils/backupSchema.ts`: `BackupPreflightError` 新エラー型（`BackupValidationError` と分離）
- `store/backupSlice.ts`: `prepareImport` を `flushSaveBlocking` 経由 + retry/abort + `BackupPreflightError`

### Stripe 後送り戦略（PM/PL 合意、進捗反映）

| Phase | スコープ | Stripe 依存 | 推定工数 | 状態 |
|---|---|---|---|---|
| ~~P3 (M4)~~ | Export/Import 強化 + バックアップ警告 UI | なし | 4〜6h | ✅ 完了 (PR #48) |
| ~~Issue #49 rating ≥ 7~~ | follow-up 消化（H2/H4/H5/H6/H10 系） | なし | 5h | ✅ 完了 (PR #51-#56, #58) |
| **次**: P4 (M7-α) | 公開準備（利用規約 Tier 0/1、特商法 stub、プライバシーポリシー、観測性、エラー報告） | なし | 4〜6h | 着手待機 |
| P5 (M6) | E2EE バックアップ | あり | 6〜10h | 後送り |
| P6 (M5) | Stripe Subscription + Webhook + 法務 Tier 2 | 本体 | 8〜12h | 後送り |
| P7 (M7-β) | 公開最終チェック（Tier 2 込み） | あり | 2〜3h | 後送り |

### 環境状況

- `.envrc` 設定済（GH_TOKEN 自動取得 + GCP `novel-writer-dev`）
- `cd ~/Projects/学校/yamashita/novel-writer && claude` で起動すれば direnv 経由で正しいアカウントが有効化される
- Cloud Run URL: `https://novel-writer-ramnh3ulya-an.a.run.app`
- 本番 Firebase project: `novel-writer-dev`
- IndexedDB schema: v2（M4 で `backupMeta` ストア追加）

### 主要コマンド

```bash
npm run dev                # 開発サーバー起動（Express + Vite HMR, port 3000）
npm run dev:emu            # dev + Firebase Emulator 並列（auth:9099 / firestore:8080）
npm run lint               # 型チェック（tsc --noEmit）
npm run test               # vitest run（259 ケース、admin SDK は vi.mock、tests/integration 除外）
npm run test:integration   # firebase emulators:exec で integration test
npm run test:firestore-rules  # firebase emulators:exec で rules unit test（20 ケース）
npm run build              # FE ビルド（dist/）+ サーバーコンパイル（dist-server/）

# H2 マニュアル検証（マージ後ユーザー側で実施推奨）
# 1. dev server 起動、editor で編集中（saveStatus='saving' を DevTools で確認）
# 2. Settings → 全データバックアップ → Import 試行
# 3. 期待: in-flight save 完了まで待機 → 完了後 import flow
# 4. IDB を強制 locked（DevTools → Application → IndexedDB → Delete database 等）にして
#    Import 試行 → toast「未保存の編集が...」+ 中止確認

# H10 マニュアル検証
# 1. 2 タブで dev server を開く
# 2. 片方を v1 のままに保つ（DevTools → Application → IndexedDB → version 確認）
# 3. もう一方で schema upgrade をトリガー
# 4. 期待: blocked toast「他のタブで古いバージョン...」表示
```

## Issue Net 変化

- Close 数: 0 件（Issue #49 は umbrella で open 維持）
- 起票数: 0 件（rating ≤ 6 follow-up は #49 にコメント追記のみ、別 Issue 化せず）
- **Net: 0 件**

進捗の質: **Issue #49 内の rating ≥ 7 項目（H2/H4/H5/H6/H10 系）すべて消化** + ADR-0001「端末紛失 = 小説喪失」リスクへの構造的対策（H2 silent edit-loss path の真の閉鎖）が最大の質的進捗。Issue 数の Net 変化はゼロだが、`memory/feedback_issue_postpone_pattern.md` に従い umbrella issue を open 維持して rating ≤ 6 follow-up の monitor 対象とする運用判断は妥当。次セッション以降で follow-up が rating ≥ 7 へ昇格 or 本番障害再現したら個別 Issue 化する。

## ドキュメント整合性

| 項目 | 状態 | 備考 |
|---|---|---|
| `docs/adr/0001-local-first-architecture.md` | ✅ M4 振り返り反映済（前セッションで完了） | 変更なし |
| `CLAUDE.md` Architecture | ✅ M4 機能反映済（前セッションで完了） | 今セッションで `flushSaveBlocking` / `BackupPreflightError` / `setBlockedHandler` API 追加分の記述なし → P4 着手時に併せて追記推奨 |
| `CLAUDE.md` Zustand スライス表 | ✅ backupSlice 行追加済 | `syncSlice._savingPromise` / `flushSaveBlocking` の追記は P4 で OK |
| `CLAUDE.md` 型定義 | ✅ M4 主要型反映済 | `BackupPreflightError` の追記は P4 で OK |

**メモ**: `CLAUDE.md` への新 API 反映は次セッション (P4 着手時) で集約する方が PR 数を減らせるため、本 handoff PR では LATEST.md のみ更新。

## 残留プロセス

✅ 残留 Node プロセスなし
