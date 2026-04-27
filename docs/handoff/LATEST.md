# Handoff: M4 マイルストーン完了 / 次フェーズ着手待機

- Session Date: 2026-04-28 (PR #48 M4 + 7件 review fix を同日中にマージ完了)
- Owner: yasushi-honda
- Status: ✅ 再開可能（M4 完了、Stripe 後送り戦略の P4 (M7-α 公開準備) または P5 (M6 E2EE) 着手待機）

## 今セッションの完了内容

| 区分 | 完了事項 | PR / 成果物 |
|---|---|---|
| 設計 | M4 impl-plan (Phase 2.7 で AC-1〜AC-11 定義) + schema v1 を M5/M6 で再利用する前倒し決定 | (impl-plan + ADR-0001) |
| 実装 | M4 全体: Export/Import 強化 + バックアップ警告 UI | PR #48 squash → main `d1b3e12` |
| 品質ゲート | /simplify (3 並列 reuse/quality/efficiency) → 7 件吸収 → /review-pr (6 並列) + /codex review でセカンドオピニオン → 追加 7 件 (B1/B2/H1/H3/H7/H8/H9) を本 PR で反映 | PR #48 内で完結 |
| 持越解消 | M3 申し送り「Export/Import + バックアップ警告 UI」を完了 | PR #48 |
| 起票 | rating ≥ 7 + confidence ≥ 80 を満たす follow-up 5 件を umbrella Issue 化 | Issue #49 (open 維持) |

**M4 マイルストーン完全完了**: backup schema v1 (`{ schemaVersion, exportedAt, appVersion, projects, tutorialState, analysisHistory }`) + Dexie transaction による atomic import + 衝突解決 UI (overwrite/duplicate/skip per-project) + 30 日 stale 警告バナー + IndexedDB の `backupMeta` ストア (DB v1→v2 migration) で永続化。ADR-0001 「端末紛失 = 小説喪失」リスクを Export/Import + 鮮度警告で構造的に緩和。

## 次セッション開始時の状態

- ブランチ: `main` clean、origin/main と同期済み (HEAD `d1b3e12`)
- Open Issue: 1 件（#49 M4 follow-up umbrella、能動的作業不要・monitor 対象として open 維持）
- Open PR: 0 件（本セッションで作る handoff PR を除き、全 PR merge 済）
- グローバル `~/.claude/` への変更なし（プロジェクト CLAUDE.md §1 遵守）
- main 直 push なし、feature ブランチ + PR 運用維持（プロジェクト CLAUDE.md §2 遵守）
- 自動テスト: vitest 204/204 PASS / firestore-rules 20/20 PASS (前 M3 セッション時点)
- 本番 Cloud Run: HTTP/2 401 確認済（無認証 access が BE で拒否される、課金保護機能）

## 次のアクション（推奨順）

### 1. 本 handoff PR をレビュー → merge
- `gh pr view <number>` で内容確認
- ユーザー明示認可後 `gh pr merge <number> --squash --delete-branch`

### 2. 次マイルストーン着手前の cleanup PR (任意)
- Issue #49 (M4 follow-up 5 件) を 1 PR or 1 ファイル 1 PR の小粒で進めるか判断
- triage 基準上は close 必須ではない（rating 7-8 だが UX 改善・テスト充実中心、機能ブロッカーなし）

### 3. 次マイルストーン: P4 (M7-α 公開準備) または P5 (M6 E2EE)
- Stripe 後送り戦略 (PM/PL 合意) の通り、Stripe (M5) は最後に回す
- P4 (M7-α 公開準備、Stripe 不要範囲) は利用規約 Tier 0/1 / 特商法 stub / プライバシーポリシー / 観測性 / エラー報告で 4〜6h 想定
- P5 (M6 E2EE バックアップ) は ADR-0001 で Tier 2 前提と明記、Stripe 後送り推奨。本 PR (M4) で確定した backup schema v1 を AES-GCM 暗号化対象として再利用予定
- 着手時に `/impl-plan` で詳細計画を立てる

## 申し送り事項（重要）

### M4 累積実績

| PR | 内容 | merge 日 | 行数 |
|---|---|---|---|
| #48 | M4 全体 + 品質ゲート 7 件 review fix | 2026-04-28 | +1547/-98 |

### M5 以降への申し送り (Issue #49 経由)

#### Issue #49 (M4 follow-up umbrella) で集約管理する 5 件:

1. **H2 prepareImport flushSave 失敗 UX**: 本 PR で flushSave 先行実装したが transient failure 時の UX 未確定。失敗を user-visible にするか / retry をかけるか要検討
2. **H4 setImportResolution 通しテスト**: prepareImport → setImportResolution → executeImport の通しテスト未整備、純関数 resolveImportProjects の単体テストのみで AC-3 通し検証が不完全 (rating 8)
3. **H5 TOCTOU 再 read テスト**: PR description の主要設計判断を実装したが回帰検知ゼロ。`readSnapshot.mockResolvedValueOnce` を 2 回切り替えるテストで担保 (rating 8)
4. **H6 isBackupStale 境界値**: exact 30 日 0 ms の挙動が未テスト、CLAUDE.md「境界値必須」MUST 違反、`vi.setSystemTime` で時刻固定して assert (rating 7)
5. **H10 Dexie v1→v2 BlockedError**: 複数タブ運用で v1 オープン中に v2 upgrade すると永続的に block。`getDb()` lazy init で `instance.on('blocked', ...)` ハンドラ追加 (rating 7)

#### 持越事項 (rating 5-6, 本 PR スコープ外、M5 着手前 cleanup PR で吸収):

- **Cheap polish**: comment-analyzer の `readFileAsText.ts` ヘッダー削除、`sanitizeForImport` コメント整理
- **Schema v2 への seam**: 現状 `parseBackup` は `schemaVersion === 1` strict equality。v2 リリース時は `PARSERS: Record<number, parser>` table に refactor
- **AC ドキュメント不在**: `docs/spec/m4/acceptance-criteria.md` を起こさず、AC は impl-plan + PR description + test describe ラベルのみ。次セッションで M5/M6/M7 spec と一緒に
- **個別 export の triggerDownload 5 重実装**: App.tsx / App.mobile.tsx / Header.tsx の `handleExportProject` / `handleExportTxt` が手書き blob ダウンロードを 4 重実装、`utils/download.ts` への集約は M4 スコープ外
- **TutorialFlags 型統一**: `BackupV1.tutorialState` インライン型と `db/tutorialRepository.ts` の `TutorialFlags` を共通化
- **ImportConflictResolution 4th union への対応**: `(['overwrite', 'duplicate', 'skip'] as const)` リテラル配列を `Object.keys(RESOLUTION_LABELS)` 化
- **legacy compat の deprecation**: parseBackup の bare project / `{ project: {...} }` envelope 経路を pre-M4 ユーザー消滅後に削除候補化
- **DB v1→v2 migration 自動テスト**: fake-indexeddb 等の導入が必要、Issue #49 H10 と同時対応

### Stripe 後送り戦略（PM/PL 合意、進捗反映）

| Phase | スコープ | Stripe 依存 | 推定工数 | 状態 |
|---|---|---|---|---|
| ~~P3 (M4)~~ | Export/Import 強化 + バックアップ警告 UI | なし | 4〜6h | ✅ 完了 (PR #48) |
| **次**: P4 (M7-α) | 公開準備（利用規約 Tier 0/1、特商法 stub、プライバシーポリシー、観測性、エラー報告） | なし | 4〜6h |
| P5 (M6) | E2EE バックアップ（**判断ポイント**: ADR で Tier 2 前提のため Stripe 後送り推奨） | あり | 6〜10h |
| P6 (M5) | Stripe Subscription + Webhook + 法務 Tier 2 | 本体 | 8〜12h |
| P7 (M7-β) | 公開最終チェック（Tier 2 込み） | あり | 2〜3h |

### 環境状況

- `.envrc` 設定済（GH_TOKEN 自動取得 + GCP `novel-writer-dev`）
- `cd ~/Projects/学校/yamashita/novel-writer && claude` で起動すれば direnv 経由で正しいアカウントが有効化される
- Cloud Run URL: `https://novel-writer-ramnh3ulya-an.a.run.app`
- 本番 Firebase project: `novel-writer-dev`
- IndexedDB schema: v2 (M4 で `backupMeta` ストア追加)

### 主要コマンド

```bash
npm run dev                # 開発サーバー起動（Express + Vite HMR, port 3000）
npm run dev:emu            # dev + Firebase Emulator 並列（auth:9099 / firestore:8080）
npm run lint               # 型チェック（tsc --noEmit）
npm run test               # vitest run（204 ケース、admin SDK は vi.mock、tests/integration 除外）
npm run test:integration   # firebase emulators:exec で integration test
npm run test:firestore-rules  # firebase emulators:exec で rules unit test（20 ケース）
npm run build              # FE ビルド（dist/）+ サーバーコンパイル（dist-server/）

# 全データバックアップの動作確認 (DoD)
# Settings → 全データバックアップ → 全データをエクスポート ボタン押下
# → JSON ダウンロード、{ schemaVersion: 1, exportedAt, appVersion, projects, tutorialState, analysisHistory } 確認
# → ファイル選択で再 import → ImportConflictModal で衝突解決 → 復元成功

# Legacy single-project JSON (pre-M4) も import 可
curl -X POST -d @legacy-export.json '...'  # ※開発時参考、UI は Settings 経由で
```

## Issue Net 変化

- Close 数: 0 件
- 起票数: 1 件 (#49 M4 follow-up umbrella、5 件集約)
- **Net: +1 件**

進捗の質: 起票した #49 は triage 基準 (rating ≥ 7 + confidence ≥ 80) を厳格に満たす follow-up を 1 つの umbrella で集約管理する形で、rating 5-6 の review agent 提案は機械的に Issue 化せず PR コメント / 持越事項として扱った。マイルストーン (M4) 完了 + 持越管理の質を保つため Net +1 は妥当な進捗と判断。

## ドキュメント整合性

| 項目 | 状態 | 備考 |
|---|---|---|
| `docs/adr/0001-local-first-architecture.md` ロードマップ M4 | ✅ 完了 (PR #48 2026-04-28) | M4 振り返り追加済 |
| `docs/adr/0001-local-first-architecture.md` 振り返り | ✅ M4 振り返り追加 | "うまくいった点" "課題・M5 以降への申し送り" 各 5 項目 |
| `CLAUDE.md` Architecture | ✅ M4 機能 (backup schema, refreshFromIndexedDb, BackupWarningBanner) を反映 | (本 handoff PR で更新) |
| `CLAUDE.md` Zustand スライス表 | ✅ backupSlice 行追加 | (本 handoff PR で更新) |

## 残留プロセス

✅ 残留 Node プロセスなし
