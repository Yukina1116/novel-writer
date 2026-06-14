# Handoff: プロットボード単体保存基盤 PR-A1 完走 (PR #176)

- Session Date: 2026-06-14
- Owner: yasushi-honda
- Status: ✅ **PR #176 マージ (squash → `204411b`)、挙動完全不変の基盤整備のみ完了**
- Detail: 本ファイル (詳細はそのまま記載、必要に応じて将来分離)
- Previous: [2026-06-09-pr173-174-chapter-id-migration.md](./2026-06-09-pr173-174-chapter-id-migration.md)

## 本セッション成果

| PR | 内容 | 状態 |
|----|------|------|
| **#176** | feat(plotboard): タイトル同期判定の純粋関数化 + カード/イベント単体保存 action 追加 (PR-A1) | ✅ `204411b` |

### 変更内容

- `store/dataSlice.ts`:
  - 純粋関数 `computePlotTitleSync` / `computeEventTitleSync` を切り出し (戻り値で `counterpartPatch` / `syncDialog` を返す、副作用ゼロ)
  - 新規 action: `upsertPlotItem` / `deletePlotItem` / `upsertTimelineEvent` / `deleteTimelineEvent`
    - history ノード非積みポリシー (`setActiveProjectData` に historyLabel 渡さない → markDirty のみ)
    - title 変更検知時のみ `lastModified` を `Date.now()` で更新 (無変更保存で同期優先権を奪わない)
  - 既存 `handleSavePlotBoard` / `handleSaveTimeline` を純粋関数経由にリファクタ (挙動不変、`store/dataSlice.titleSync.test.ts` 既存 9 件全 PASS)
- `store/dataSlice.upsert.test.ts`: 新規 18 テスト (純粋関数 6 ケース × 2 方向 + action contract 6 件)
- 全 test 744/744 PASS

### caller 状況 (重要)

新 action `upsert*` / `delete*` は本 PR ではどこからも呼ばれない。PR-A2/A3 で UI 経由で呼ばれることで初めて体感バグ (タイトル同期がフッター保存待ち) が解消される。**PR-A1 単独では挙動完全不変**。

## 設計議論と判断経緯

### 当初オーダー (本田様)
1. タイムライン側でタイトル変更したらプロットボード側も同期して変わるようにしたい
2. プロットボードに単体保存と全体保存の概念があるのか
3. 単体更新が全体保存と同等の状態であってほしい
4. フッターボタンは「位置関係と相関関係の保存」役割

### 検討した選択肢
- 代替 A: 全自動保存 + フッター削除 (境界線なし、最終形シンプル)
- 代替 B: 全自動 + フッターは別の価値に転用
- 代替 C: 当初の PR-1A だけで止める (タイトル同期問題解消のみ、UI 変更ゼロ)
- 二層モデル: 自動 (データ系) / 手動 (レイアウト系) を境界分け

### Codex セカンドオピニオン (plan-review モード) の High 4 件指摘
| # | 指摘 | 案 C への影響 |
|---|------|--------------|
| H1 | 二重書きの stale overwrite (local state と Redux の競合) | 案 C で局所最適だが残る |
| H2 | キャンセル semantics 破壊 (モーダル内保存がキャンセルしても残る) | 案 C で残る (仕様変更) |
| H3 | 削除ケース非対称 (upsert だけ即時、delete は旧経路) | 案 C で残る |
| H4 | history label では 10 件上限問題は解決しない | 案 C で残る |

### 最終判断: 案 Y (A 直行) + 3 PR 段階分割
- 案 C で進むと H1〜H4 を吸収するためスコープが拡大、最終的に案 A と同じコストになる
- 案 A 直行の方が最終メンテコストが低い (Codex 6 論点回答でも確認)
- ただし局所リスク管理のため 3 PR に分割:

| PR | スコープ | 状態 |
|----|---------|------|
| **PR-A1 (本セッション完了)** | dataSlice 基盤整備、UI 変更なし | ✅ `204411b` |
| PR-A2 | PlotBoardModal local state 廃止 + フッター削除 | 条件待ち |
| PR-A3 | TimelineModal 対称化 | 条件待ち (PR-A2 後) |

### Codex 指摘の吸収状況 (PR-A1 で実装済み)
- ✅ H3: `deletePlotItem` / `deleteTimelineEvent` action 追加
- ✅ H4: upsert/delete は history ノード非積み (markDirty のみ)
- ✅ M: `Date.now()` は title 変更検知時のみ付与
- ✅ M: `syncLinkedTitle` を `{ counterpartPatch, syncDialog }` 戻り値の純粋関数化
- H1/H2 は PR-A2/A3 で local state 廃止することで解消予定 (本 PR スコープ外)

## Issue Net 変化 (本セッション)

- **Close 数**: 0 件
- **起票数**: 0 件
- **Net**: **0 件**

## 残 Open Issue (前 handoff から不変)

| Issue | 内容 | 緊急性 |
|------|------|--------|
| #137 | promptSafety umbrella (サブ #7 完了、残 #6 / #8) | LOW |
| #147 | PII path leak (codex review 由来) | LOW |
| #152 | update path paired signal | LOW |
| #155 | AC-3 backward compat test gap | LOW |
| #156 | callback register-or-forget リスク | LOW |

## 次のアクション (3 分割構造)

### 即着手タスク

なし

### 条件待ち (明示 trigger 付き)

| # | 項目 | A/B/C | trigger | 充足時タスク | 想定工数 |
|---|------|-------|---------|------------|---------|
| 1 | **PR-A2: PlotBoardModal local state 廃止 + フッター削除** | C (起点指示済み = 本セッションで合意) | decision-maker が「PR-A2 着手して」「A 直行で進めて」と明示指示 | impl-plan → tdd (CardEditorModal の upsertPlotItem 直結、handleSaveCard 廃止、フッター保存ボタン削除、キャンセル→閉じる統一、confirmDeleteCard を deletePlotItem 経由) → /safe-refactor → /code-review medium → 実機確認 → PR | 1.5-2 時間 |
| 2 | **PR-A3: TimelineModal 対称化** | C (PR-A2 と同じ起点指示) | PR-A2 マージ完了 | PR-A2 と対称な手順 (TimelineModal の handleSaveEvent を upsertTimelineEvent 直結、handleDeleteEvent を deleteTimelineEvent 経由) | 1 時間 |
| 3 | Issue #137 / #147 / #152 / #155 / #156 着手 | B 修正 (write) | decision-maker が「Issue #XXX 着手して」等の番号単位指示 | impl-plan → tdd → safe-refactor → code-review | 各 30 分〜2 時間 |
| 4 | 前 handoff の条件待ち 7 件 (description セクション視覚強調 / タイムライン未反映切り分け / prod 構築 / setup-safety-event-metrics / Cloud Logging baseline / 残 Issue 優先順位 / D1〜D5 起票判断) | 各種 | 前 handoff [2026-06-09-pr173-174-chapter-id-migration.md](./2026-06-09-pr173-174-chapter-id-migration.md) §「次のアクション」参照 | 同左 | 同左 |

### 却下候補 (記録のみ、包括指示の対象外)

| # | 項目 | A/B/C | 着手しない理由 |
|---|------|-------|--------------|
| 1 | PR-A1 マージ後の memory / docs 整理 | A | housekeeping、明示指示なし (4 原則 §1) |
| 2 | PR-A2 を待たず PR-A1 で UI 部分先行実装 | C | スコープ変更は decision-maker 領分 |
| 3 | プロットボード以外の UI 改善提案 (例: タイムライン UX 改善) | C | 起点 unclear、AI 起点アイデアは 4 原則 §1 違反 |
| 4 | ADR (`docs/adr/0002-plotboard-autosync.md`) を本セッションで起票 | A | PR-A2 着手時に「local state 廃止」の正式判断と同時起票が筋。PR-A1 単独では設計判断の主役ではない |
| 5 | Issue #137 等の `enhancement` 群を AI 起点で優先順位提案 | C | rating / urgency 判断は decision-maker 領分 (CRITICAL: postponed パターン参照) |

## 構造的整合性チェック

| 観点 | 該当性 | 状態 |
|------|-------|------|
| 型・共有ロジック・設定ファイル変更 | ❌ 該当なし (action 追加のみ、既存型は触らず) | ⏭️ スキップ |
| 新規テーブル / API 追加 | ❌ 該当なし | ⏭️ スキップ |
| データフロー実装 | ⚠️ 部分該当 (upsert action は新規データフロー)。ただし caller なしのため実フロー未稼働 → PR-A2/A3 着手時に `/trace-dataflow` 実施 | 条件待ち |

## グローバル memory scope チェック (§4.5)

本セッションで `memory/feedback_*.md` / `memory/reference_*.md` / `memory/MEMORY.md` への編集なし → ⏭️ スキップ

## CI 状態

- PR #176 マージ済 (`204411b`)
- main の `Deploy to Cloud Run` workflow が本 handoff 時点で `in_progress` (24s 経過時点)
- PR-A1 は挙動完全不変なので deploy 失敗時も regression 影響なし
- 次セッション側で `gh run list` 等で結果確認推奨

## 残留プロセス

| プロセス | 所属プロジェクト | 扱い |
|---------|--------------|------|
| firebase emulators (`demo-visitcare` project) | visitcare-shift-optimizer | 本プロジェクト外、kill 提案なし (越権回避) |
| cloud-firestore-emulator-v1.20.2.jar | 同上 | 同上 |

本プロジェクト由来の残留プロセスは ✅ なし。

## 再開可能性判定

| 項目 | 状態 |
|------|------|
| Git Status | ✅ clean (本 handoff ブランチを除く) |
| Open PR | 本 handoff PR のみ |
| Active Issue | 5 件 (全て LOW + decision-maker 判断待ち、前 handoff から不変) |
| CI | ⏳ main の Deploy to Cloud Run in_progress (PR-A1 マージ直後) |
| 残留プロセス | ✅ なし (本プロジェクト由来) |
| 即着手タスク | 0 件 |
| 条件待ち | 3 系列 (PR-A2 / PR-A3 / 残 Issue 群) + 前 handoff 7 件 |

## 最終結論

✅ **セッション終了可**

- PR #176 マージ完了 (squash → `204411b`)、Git clean
- 即着手 0 / 条件待ちはすべて decision-maker trigger 待ち
- CI deploy 結果は PR-A1 が挙動不変のため、結果がどうあれ本セッションの目的達成は変わらない
- PR-A2 着手は「PR-A1 を運用に出して挙動確認後に判断」が前提、本セッションでの着手は不要
