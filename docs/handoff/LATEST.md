# Handoff: M2 PR-A 実装 + 全品質ゲート完了 → 実機検証待ち

- Session Date: 2026-04-26
- Owner: yasushi-honda
- Status: ✅ 再開可能（PR #24 open、ユーザー側手動 AC 検証待ち）

## 今セッションの完了内容

| 区分 | 完了事項 | 成果物 |
|---|---|---|
| 実装 | M2 PR-A の A.0〜A.9 全タスク。永続化レイヤーを Firestore（`/api/projects`/`/api/data`/`/api/tutorial`/`/api/analysis-history`）から ブラウザ IndexedDB（Dexie 4.4.2）に切替 | feature ブランチ `feature/m2-indexeddb-migration`（8 commits / 16 files / +304 / -156） |
| 新規モジュール | `db/dexie.ts`（schema v1, 3 stores）、`db/projectRepository.ts`（whitelist + recursive `_*` strip + 型 tripwire）、`db/tutorialRepository.ts`、`db/analysisHistoryRepository.ts`、`hooks/useLocalSync.ts` | - |
| 既存改修 | `App.tsx` import 切替、`components/Header.tsx` Export 経路置換、`store/{projectSlice,syncSlice,tutorialSlice,analysisHistorySlice}.ts` の永続化先置換、`store/uiSlice.ts` showToast の error 通知強制、`store/syncSlice.ts` `_pendingFlush` 経路 + 5秒再試行 | - |
| 削除 | `projectApi.ts`（FE ラッパー）、`hooks/useFirestoreSync.ts`（rename 統合） | - |
| 品質ゲート | `npm run lint` PASS / `/simplify` 3エージェント / `/safe-refactor` / `evaluator`（HIGH 3 / MEDIUM 3 修正）/ `/codex review`（Critical 1 / Major 1 修正）/ `/review-pr` 6エージェント並列（Critical 4 / Important 5 → A〜E 採用、F〜H 別 Issue 化に振分） | PR #24 |
| PR 作成 | https://github.com/Yukina1116/novel-writer/pull/24 | Test plan に AC A1〜A10 + AR1〜AR5 を明記、Out of scope セクションに deferred 11 件を列挙 |

## 次セッション開始時の状態

- ブランチ: `main` clean、origin/main と同期済み
- 進行中の feature ブランチ:
  - `feature/m2-indexeddb-migration` — PR #24 open、コード変更完了
  - `feature/m2-pra-handoff` — 本ハンドオフ用ブランチ（このコミットを含む）
- Open Issue: 0 件（前回 #23 ハンドオフから変動なし）
- グローバル `~/.claude/` への変更なし（プロジェクト CLAUDE.md §1 遵守）
- main 直 push なし、feature ブランチ + PR 運用維持（プロジェクト CLAUDE.md §2 遵守）

## 次のアクション（推奨順）

### 1. PR #24 の状態確認（最優先）
- `gh pr view 24` で マージ済 / レビューコメント / open のいずれかを確認
- 本ハンドオフ PR は `gh pr list --state open` で別途確認

### 2A. PR #24 が未マージ かつ 検証未完了 → 手動 AC 検証セッション
- ユーザーがブラウザ操作、Claude が結果解釈・tasks.md 更新支援
- **最優先**: AR1（`_pendingFlush` 経路 DevTools 検証、codex Critical 修正の妥当性）/ AR2（save-failure 5秒再試行、silent-failure-hunter CRIT-1 修正の妥当性）/ AR3（大型データ往復、spec R8）
- spec PR-A 切替手順：手元プロジェクトを Export → ブランチ切替 → Import 復元 → AC 確認

### 2B. PR #24 が未マージ かつ 検証完了 PASS → tasks.md 更新コミット
- `docs/spec/m2/tasks.md` PR-A セクション AC A1〜A9 を `[x]` に更新
- 本 PR と同じブランチに追加コミット → push → マージ

### 2C. PR #24 がマージ済 → main 同期 + PR-B 着手準備
- `git checkout main && git pull --rebase`
- `docs/spec/m2/tasks.md` の PR-A AC を `[x]` 更新（マージ前にやれていなければ）
- ADR-0001 ロードマップ表で M2 を ⏳ → 部分完了マーク
- PR-B（Firebase Auth FE）着手: ブランチ `feature/m2-firebase-auth-fe`、impl-plan 起動、grep `firebase` `auth` で現状確認

### 3. /review-pr deferred の triage（マージ後に着手可能）
- PR #24 description「Out of scope」に列挙した 11 件のうち、CLAUDE.md triage 基準（rating ≥ 7、実バグ、CI 破壊、ユーザー明示指示）を満たすものを `gh issue create`
- **起票候補（rating ≥ 7 相当）**:
  - silent-failure-hunter CRIT-2: validation throw vs DB I/O error 区別不能（typed error class hierarchy）
  - silent-failure-hunter HIGH-1: `getProject(p.id).catch(() => null)` で個別 corrupted record が握りつぶされ、`activeProjectId` が壊れた project を選ぶ可能性
  - silent-failure-hunter HIGH-2: Dexie module-level construction throw が `useLocalSync` の try/catch に届かない（Dexie の lazy open に依存）
- **起票しない**（PR description 記録で十分）:
  - silent-failure-hunter MED-1〜3、type-design-analyzer Important×2 / Suggestion×3、pr-test-analyzer Important（refactor 規模 / 設計判断系）
  - LOW pre-existing bugs（`App.tsx:163` typo、`importProject` の `reader.onerror` 欠如、Export の `historyTree` 残存）

## 申し送り事項（注意点）

### 本セッションで実機検証は未実施
- ユーザーのブラウザ操作（Chrome DevTools 含む）が必要なため、本セッションでは検証していない
- AC A1〜A10 + AR1〜AR5（合計 15 項目）の DevTools 操作手順は PR #24 description に詳細記載
- マージ前に必ず実機検証を完了させる（プロジェクト CLAUDE.md MUST「Test plan に記載した項目は全てマージ前に実行」）

### M2 spec で確定した重要設計判断（PR-A 実装で具現化）
- **IndexedDB は uid に紐付けない** — login/logout でデータ保持。`db/dexie.ts` の DB 名は固定 `novelWriterDb`、uid セグメントなし
- **`historyTree` は永続化しない** — `db/projectRepository.ts` の `PERSISTABLE_KEYS` から除外、`_coverageCheck` 型 tripwire で意図を compile-time に固定
- **未知フィールド除去**: top-level whitelist + recursive `_*` strip の二段防御（codex Major 修正）。AC A6 の根本対策
- **保存中編集の再 flush**: `_pendingFlush` flag + flushSave catch の 5秒再試行（codex Critical / silent-failure-hunter CRIT-1 の合算修正）
- **error toast の必達性**: `showToastNotifications=false` でも `type='error'` は表示（silent-failure-hunter HIGH-3）

### M1 から踏襲の既知問題（PR-A スコープ外、follow-up issue 化推奨）
- `tutorialSlice` / `analysisHistorySlice` の `console.error` のみ catch — IndexedDB 移行で意味が変質（ローカル DB 失敗 = 通知すべき）
- `App.tsx:163` cleanup typo（`addEventListener` を `removeEventListener` に修正すべき）
- `importProject` の `reader.onerror` 未定義
- Export 時の `historyTree` 残存（ファイルサイズ）

### 環境状況
- `.envrc` 設定済（GH_TOKEN 自動取得 + GCP `novel-writer-dev`）
- `cd ~/Projects/学校/yamashita/novel-writer && claude` で起動すれば direnv 経由で正しいアカウントが有効化される
- 残留 Node プロセスなし

## Issue Net 変化

- Close 数: 0 件
- 起票数: 0 件
- Net: 0 件
- **進捗の質**: コードベースで M2 PR-A の実装と全品質ゲートを完了。PR #24 が open（コード完成、検証待ち）。Issue Net = 0 だが、PR-A は M2 の最大規模タスクであり、次セッションで検証通過 → マージ → PR-B 着手の準備が整った状態。/review-pr deferred 11 件のうち triage 基準を満たすもの（推定 3 件）は次セッションで起票予定で、その時点で Net が変動する

## ドキュメント整合性

| 項目 | 状態 | 備考 |
|---|---|---|
| `docs/spec/m2/tasks.md` PR-A セクション | AC `[ ]` のまま | 実機検証後に `[x]` 化する運用（CLAUDE.md MUST と整合） |
| `docs/spec/m2/tasks.md` PR-B / PR-C | `⏳` のまま | PR-A 後に着手 |
| ADR-0001 ロードマップ表 | M2 `⏳` のまま | M2 全 PR 完了時に更新 |
| `CLAUDE.md` "AI API層" 表 | 未更新 | PR-C 着手時に `/api/projects` 削除 + `/api/users/init` 追加（spec C.5） |
| `CLAUDE.md` "状態管理" セクション | 未更新 | PR-C 着手時に `syncSlice` の保存先を IndexedDB に修正、`authSlice` 追記 |

## 残留プロセス

✅ なし
