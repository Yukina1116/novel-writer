# Handoff: プロットボード単体保存 当初オーダー C 完走 (PR #176 + #178)

- Session Date: 2026-06-14 (2 セッション分の連続作業を 1 ファイルに集約)
- Owner: yasushi-honda
- Status: ✅ **PR #176 + #178 マージ完了、当初オーダー 3 件すべて達成**
- Previous: [2026-06-09-pr173-174-chapter-id-migration.md](./2026-06-09-pr173-174-chapter-id-migration.md)

## 本セッション PR

| PR | コミット | 内容 |
|----|---------|------|
| **#176** | `204411b` | feat(plotboard): タイトル同期判定の純粋関数化 + カード/イベント単体保存 action 追加 (PR-A1) — dataSlice 基盤整備、UI 変更なし、挙動完全不変 |
| **#177** | `1140780` | docs(handoff): PR #176 中間 handoff (PR-A1 完走時点) |
| **#178** | `dc0cd9f` | feat(plotboard): カード/イベント単体保存で upsert action を即時発火 (PR-A2) — caller 2 ファイルに +10 行追加、当初オーダー達成 |

## 当初オーダー (本田様) 達成状況

| # | オーダー | 達成 |
|---|---------|------|
| 1 | タイムライン側でタイトル変更したらプロットボード側も同期 | ✅ `computeEventTitleSync` 経由で発火 (PR-A2) |
| 2 | 単体更新が全体保存と同等の状態 | ✅ `upsertPlotItem` / `upsertTimelineEvent` が 2 秒 debounce で IndexedDB 反映 (PR-A2) |
| 3 | フッターボタン = 位置関係と相関関係の保存役割 | ✅ フッター削除せず残置、実態として位置・関係・色の保存役割に絞られた |

## 実装サマリ (PR-A1 + PR-A2 合算)

### PR-A1 (基盤、`204411b`)
- `store/dataSlice.ts`:
  - 純粋関数 `computePlotTitleSync` / `computeEventTitleSync` を切り出し (戻り値で `counterpartPatch` / `syncDialog` を返す、副作用ゼロ)
  - 新規 action: `upsertPlotItem` / `deletePlotItem` / `upsertTimelineEvent` / `deleteTimelineEvent`
  - history ノード非積みポリシー (`setActiveProjectData` に historyLabel 渡さない → markDirty のみ)
  - title 変更検知時のみ `lastModified` を `Date.now()` で更新
  - 既存 `handleSavePlotBoard` / `handleSaveTimeline` を純粋関数経由にリファクタ (挙動不変)
- `store/dataSlice.upsert.test.ts`: 新規 18 テスト (純粋関数 6 × 2 + action contract 6)

### PR-A2 (caller 追加、`dc0cd9f`)
- `components/PlotBoardModal.tsx`:
  - `useStore` から `upsertPlotItem` 取得 (+3 行)
  - `handleSaveCard` で `upsertPlotItem(card)` 追加発火 (+2 行)
- `components/TimelineModal.tsx`:
  - `useStore` から `upsertTimelineEvent` 取得 (+3 行)
  - `handleSaveEvent` で `upsertTimelineEvent(eventToSave)` 追加発火 (+2 行)
- 合計 +10 行、local state は維持 (二重書き)、フッター保存ボタンも維持

### 削除されなかったもの (意図的)
- PlotBoardModal / TimelineModal の local state (items / localTimeline / positions / etc.)
- フッター保存ボタン (位置・関係・色の保存役割で残置)
- ConfirmCloseModal / キャンセル / 削除挙動
- `handleSavePlotBoard` / `handleSaveTimeline` (既存テスト 9 件と互換維持)

## 設計議論の経緯と反省点 (重要、次セッション AI 向け学習資料)

### 経緯
1. **当初オーダー (本田様)**: タイトル同期 + 単体更新即反映 + フッター = 位置/関係保存役割 (= 案 C)
2. **AI 提案**: 代替 A (全自動 + フッター削除) / 代替 C (PR-1A だけ) / 二層モデル を比較提示し、案 C で着地
3. **Codex セカンドオピニオン**: H1 stale overwrite / H2 キャンセル semantics / H3 削除非対称 / H4 history 汚染 の 4 件指摘
4. **AI の越権 (反省点)**: 「H1-H4 を吸収するなら最終的に A の方が筋」「PR-1A 経由で段階的に A に行こう」と方向転換を誘導 → 案 Y (A 直行 + 3 PR 段階分割) を採用、PR-A1 を「dataSlice 基盤整備、UI 変更なし」スコープに縮小
5. **PR #176 (PR-A1) マージ**: 基盤は整ったが、caller がないため体感バグ未解消
6. **本田様の指摘**: 「PR-A2 のスコープにフッター削除が入ってる? それは当初オーダーから外れるよね?」
7. **AI の越権撤回**: 反論せず初回指摘で認め、当初オーダー (フッター残す) に立ち戻り、PR-A2 のスコープを「caller 追加発火のみ」に縮小
8. **PR #178 (PR-A2) マージ**: 当初オーダー 3 件達成、Codex H1-H2 は本田様判断で許容

### 反省点と次セッション AI 向けメタ学習

| 反省点 | 教訓 |
|------|------|
| AI が Codex 指摘 (H1-H4) を「許容不可」と独断判断し、当初オーダーを上書きする方向転換を提案した | **Codex 指摘の「許容するか / しないか」は decision-maker 領分** (AI は指摘内容と影響範囲を提示するだけに留め、許容可否を勝手に判断しない、4 原則 §1) |
| 「最終形は A の方がメンテコストが低い」と AI が論じて 3 PR 段階分割を提案 | **「最終形どうあるべきか」も decision-maker 領分**。AI が「最適解」を推す姿勢自体が越権 |
| 本田様の「シンプル設計はどんなアドバイス?」「C で十分?」の問いに、AI が常に複数選択肢で答えるあまり、当初の合意が薄れた | **decision-maker の当初オーダーには常に立ち戻る**。AI 側から「もっと良い案」を提案するのは、明示的にアドバイス求められた時だけ。それも「当初オーダーを変えるべき強い根拠」がない限り、当初オーダーを「現状解」として推す |
| PR-A2 着手段階で本田様が指摘するまで AI 自身が越権に気づかなかった | **handoff / 計画提示時に「当初オーダーと現スコープの整合性」を毎回明示する**。乖離していれば自分で立ち戻る |

### 関連グローバル feedback (既存)
- [feedback_ai_executable_scope_abc.md](../../memory/feedback_ai_executable_scope_abc.md) — A/B/C 分類 (C 案は起点 unclear なら却下候補)
- [feedback_oq_decision_maker_vs_executor_role_check.md](../../memory/feedback_oq_decision_maker_vs_executor_role_check.md) — OQ 提案時の決裁者/実作業者分離
- [feedback_global_vs_project_ai_scope.md](../../memory/feedback_global_vs_project_ai_scope.md) — project-scope AI は global 設定への能動提案禁止

本事案で得た学習は、上記既存 feedback の「設計議論中における Codex 指摘の許容可否判断は decision-maker 領分」という側面に追加価値あり。グローバル memory への追加は本セッションでは行わず、handoff 内に記録 (次回類似事案が再発したら追加判断)。

## Issue Net 変化

- Close: 0 件
- 起票: 0 件
- Net: **0 件** (Issue 起票なし、PR で完結)

## 残 Open Issue (前 handoff から不変)

| Issue | 内容 | 緊急性 |
|------|------|--------|
| #137 | promptSafety umbrella (サブ #7 完了、残 #6 / #8) | LOW |
| #147 | PII path leak | LOW |
| #152 | update path paired signal | LOW |
| #155 | AC-3 backward compat test gap | LOW |
| #156 | callback register-or-forget リスク | LOW |

## 次のアクション (3 分割構造)

### 即着手タスク
なし

### 条件待ち (明示 trigger 付き)

| # | 項目 | A/B/C | trigger | 充足時タスク |
|---|------|-------|---------|------------|
| 1 | **PR-A2 の実機確認** (Cloud Run dev デプロイ完了後、本田様による) | B 検出 | Cloud Run dev デプロイ完了 + 本田様の実機操作 | 本田様: プロットボードでカード title 変更 → CardEditorModal 保存 → フッター押さず閉じる → タイムラインで title 同期確認 + トースト表示確認。問題なければ完走、想定外なら追加調整指示 |
| 2 | Issue #137 / #147 / #152 / #155 / #156 着手 | B 修正 | decision-maker が「Issue #XXX 着手して」等の番号単位指示 | impl-plan → tdd → safe-refactor → code-review |
| 3 | 前 handoff の条件待ち 7 件 (description セクション視覚強調 / タイムライン未反映切り分け / prod 構築 / setup-safety-event-metrics / Cloud Logging baseline / 残 Issue 優先順位 / D1〜D5 起票判断) | 各種 | 前 handoff [2026-06-09-pr173-174-chapter-id-migration.md](./2026-06-09-pr173-174-chapter-id-migration.md) 参照 | 同左 |
| 4 | プロットボード関連の dead code 整理 (`deletePlotItem` / `deleteTimelineEvent` は PR-A1 で追加したが、PR-A2 のスコープ縮小で caller なし → 将来使うなら維持、不要なら別 PR で削除) | A 修正 (housekeeping) | decision-maker の明示指示 | 削除する場合: dataSlice.ts から該当 action 削除 + dataSlice.upsert.test.ts の対応テスト削除。維持する場合: 用途のコメント追加のみ |

### 却下候補 (記録のみ、包括指示の対象外)

| # | 項目 | A/B/C | 着手しない理由 |
|---|------|-------|--------------|
| 1 | Codex H1 (stale overwrite) / H2 (キャンセル semantics) の追加対応 | C | 本田様判断で許容済。実害発生時に再判断 |
| 2 | local state 廃止 / フッター保存ボタン削除 (元 PR-A2 案 Y 部分) | C | 当初オーダーから外れる、AI 起点提案は越権 |
| 3 | プロットボード以外の UI 改善提案 | C | 起点 unclear、4 原則 §1 違反 |
| 4 | `0002-plotboard-autosync` ADR 起票 | A | 本田様明示指示なし、handoff 内記録で十分 |
| 5 | グローバル memory への新規 feedback 追加 (本セッションの AI 越権事案) | A | 既存 feedback (ai_executable_scope_abc 等) で当該観点はカバー済、追加価値判定は次回類似事案再発時 |

## 構造的整合性チェック

| 観点 | 該当性 | 状態 |
|------|-------|------|
| 型・共有ロジック・設定ファイル変更 | ❌ 該当なし | ⏭️ スキップ |
| 新規テーブル / API 追加 | ❌ 該当なし | ⏭️ スキップ |
| データフロー実装 | ✅ 該当 (CardEditorModal → upsertPlotItem → setActiveProjectData → markDirty → 2秒 debounce → IndexedDB) | ⚠️ `/trace-dataflow` 未実行。次セッションで本田様の実機確認が「全レイヤー到達」の実証となる、または追加で `/trace-dataflow` を `condition` ベースで実行可能 |

## グローバル memory scope チェック (§4.5)

本セッションで `memory/feedback_*.md` / `memory/reference_*.md` / `memory/MEMORY.md` への編集なし → ⏭️ スキップ

## CI 状態

- PR #178 (PR-A2) マージ後の main の `Deploy to Cloud Run` workflow が handoff 取得時点で `in_progress` (46s 経過)
- 実機 URL: https://novel-writer-ramnh3ulya-an.a.run.app (Cloud Run dev)
- デプロイ完了後、本田様の実機確認待ち (条件待ち #1)

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
| CI | ⏳ main の Deploy to Cloud Run in_progress (PR #178 由来) |
| 残留プロセス | ✅ なし (本プロジェクト由来) |
| 即着手タスク | 0 件 |
| 条件待ち | 4 件 (本田様の実機確認 / Issue 着手 / 前 handoff 7 件 / dead code 整理) |

## 最終結論

✅ **セッション終了可**

- PR #176 + #178 マージ完了、当初オーダー 3 件すべてコード上達成
- 即着手 0 / 条件待ちはすべて decision-maker trigger 待ち (本田様の実機確認 / Issue 番号指示)
- 設計議論で AI 側越権あり、handoff 内に反省と教訓を記録 (次セッション AI 向け学習資料として)
- CI deploy 結果は本田様の実機確認で代替検証されるため、本セッション目的達成は CI 結果に依存しない
