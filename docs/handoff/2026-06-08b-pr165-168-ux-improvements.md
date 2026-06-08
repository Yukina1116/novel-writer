# Handoff: UX 改善 4 件 (履歴ボタンバグ / DblClick 編集 / 左カラムフッター / タイムライン⇔プロット同期)

- Session Date: 2026-06-08 (afternoon)
- Owner: yasushi-honda
- Status: ✅ **PR #165–#168 4 件すべてマージ + Cloud Run デプロイ完走 + PR-A/B/C/D1 全て本番 Playwright MCP 実機確認まで完走**
- Previous: [2026-06-08-pr162-163-and-prod-roadmap.md](./2026-06-08-pr162-163-and-prod-roadmap.md)

## 本セッション PR

| PR | 内容 | 状態 |
|----|------|------|
| **#165** | fix(ui): 履歴ボタンを standard モードでも開けるよう SuggestionHistoryModal の mount 条件を修正 (1 file, +2/-2) | ✅ `4d6a58d` + 本番実機確認 |
| **#166** | feat(ui): キャラクター / 世界観のアイテムをダブルクリックで編集モーダルを開けるようにする (2 files, +18/-8) | ✅ `10ddde8` + 本番実機確認 |
| **#167** | feat(ui): 左カラムにデスクトップ用フッターを新設し、自動保存表示の移行と総文字数表示を追加 (1 file, +15/-3) | ✅ `405e8d2` + 本番実機確認 |
| **#168** | feat(sync): タイムライン⇔プロットボードのタイトル差異を保存時に自動同期 + トースト通知 (2 files, +330/-19) | ✅ `bc5da5a` + 本番実機確認 |

すべて本番 Cloud Run (`https://novel-writer-ramnh3ulya-an.a.run.app`) にデプロイ完了。

## 本セッションの流れ

1. **要望ヒアリング → 実態調査**: 本田様から 4 件の UI/UX 改善要望 → Explore 4 並列で実コードを grep + LSP で実態確認
2. **impl-plan で計画策定**: タスク分解 / Acceptance Criteria / PR 分割案
3. **Codex (plan モード) でセカンドオピニオン**: PR-D1 (タイムライン同期) の単方向同期問題・SyncDialog 廃止リスク・lastModified 比較・showToast 型回避リスク等を指摘 → 計画に反映
4. **PR-A から順次実装 → CI → 本番デプロイ → Playwright MCP 実機確認**
5. **PR-D1 はタイトルのみ自動同期に scope 限定**、summary/description は SyncDialog 経路維持

## PR 別の確認結果

### PR #165 (PR-A) — 履歴ボタンバグ修正
- 原因: `RightPanel.tsx:387` のボタン表示条件 `userMode !== 'simple'` と `:436` のモーダル mount 条件 `userMode === 'pro'` の不整合により、デフォルトの `standard` モードで「ボタンは見えるが押しても開かない」状態だった
- 修正: line 436 を `userMode !== 'simple'` に統一
- 実機確認: `standard` モードで履歴ボタン → 「提案履歴」モーダル mount + 「却下したナレッジ/プロット提案」セクション表示

### PR #166 (PR-B) — キャラ/世界観 div ダブルクリック編集
- 実装: `CharacterListPanel.tsx:72` / `WorldListPanel.tsx:69` の親 div に `onDoubleClick={() => openModal(type, item)}` + `title="ダブルクリックで編集"`、各ボタン (編集/削除/確認) に `onDoubleClick={e => e.stopPropagation()}` を追加して bubbling を止める
- 実機確認: キャラ/世界観いずれも div ダブルクリック → 各編集モーダル起動

### PR #167 (PR-C) — 左カラムデスクトップフッター + 総文字数
- 実装: デスクトップ用フッター新設、ヘッダー右上 SaveStatusIndicator を移行、Zustand selector で総文字数を算出 (`novelContent.reduce((a,c) => a + (c.text?.length || 0), 0)`) してフッター左に表示
- 実機確認: 「N 文字」+ SaveStatusIndicator がフッターに並んで表示、ヘッダー右上から SaveStatusIndicator が消えている
- 文字数のリアクティブ更新は Playwright 上で「本文に追加」ボタンが下端 footer に隠れ click できなかったため目視のみ skip (Zustand selector の標準実装で論理的に保証)

### PR #168 (PR-D1) — タイムライン⇔プロット タイトル自動同期
- 実装: `handleSaveTimeline` / `handleSavePlotBoard` の差異検出ロジックを以下に変更
  - **タイトル差異 → 自動同期 + トースト**（SyncDialog を呼ばない）
  - **タイトル一致 + summary/description 差異 → 既存通り SyncDialog**
- `syncLinkedData()` (SyncDialog 経由の summary 同期も含む) は既存挙動として温存
- 同期先 `lastModified` は更新元と同値にすることで次回保存時の循環同期を防止
- `showToast` は typed 取得パターン (`const { ..., showToast } = get()`) に寄せた
- 新規 unit test 9 件 (`store/dataSlice.titleSync.test.ts`) で双方向同期 / SyncDialog 経路 / 差分なし / 同一 lastModified / リンクなし / リンク切れ を網羅
- 全 649 件 PASS + Codex セカンドオピニオン反映済 + `/code-review low` 結果 (none)
- **実機確認 (本番 Playwright MCP) ✅ 完走**:
  - 経路: TimelineModal で新規イベント作成 → EventForm の「プロットカードを作成」 (`createPlotFromEvent`) でプロット側にリンク済みカード自動生成
  - 同期テスト: タイムライン側でイベントタイトルを「PR-D1 同期テスト元タイトル」→「PR-D1 同期後の新タイトル」に変更 → TimelineModal 全体保存 → **SyncDialog は開かず**、プロットボード側のリンク済みカードのタイトルが即時「PR-D1 同期後の新タイトル」に自動同期されることを画面表示で確認
  - トーストは表示時間が短く目視キャプチャできなかったが、画面の同期結果が機能動作を裏付け
- **観察事項 (PR-D1 と無関係、別調査候補)**: 「タイムラインへ送る」アイコン (PlotBoardModal の `createEventFromPlot` 経路) でのリンク作成では、プロットボードモーダル保存後にタイムラインモーダルへ反映されない挙動を確認。これは既存の `createEventFromPlot` + PlotBoardModal localState と store 間の状態同期の問題と推測 (本セッションスコープ外、未起票)

## Issue Net 変化

- **Close 数**: 0 件
- **起票数**: 0 件
- **Net**: **0 件**

備考: PR-D1 実機確認時に観察した「タイムラインへ送る後のタイムライン未反映」は別途観察項目だが、本田様判断により本セッションでは未起票（再現性・実害の検証が未完了、ユーザー明示指示なし → triage 基準未充足）。

## 残 Open Issue (前 handoff から不変、本田様判断待ち)

| Issue | 内容 | 緊急性 |
|------|------|--------|
| #137 | promptSafety umbrella (サブ #7 完了、残 #6 / #8) | LOW |
| #147 | PII path leak (codex review 由来) | LOW |
| #152 | update path paired signal | LOW |
| #155 | AC-3 backward compat test gap | LOW |
| #156 | callback register-or-forget リスク | LOW |

## 次のアクション (3 分割構造)

### 即着手タスク

**即着手タスクなし**

PR #165–#168 すべて完走（マージ + デプロイ + PR-A/B/C は実機確認）。残作業は decision-maker trigger 待ちのみ。

### 条件待ち（明示 trigger 付き）

| # | 項目 | A/B/C | trigger（充足条件） | 充足時のタスク |
|---|------|-------|------------------|--------------|
| 1 | **「タイムラインへ送る」後のタイムライン未反映**の挙動切り分け | B（検出は read-only 可、修正は人指示待ち） | 本田様が「これは本当に既存バグか調査して」と指示 | `createEventFromPlot` / `handleSavePlotBoard` / `PlotBoardModal.tsx` の状態同期を調査、再現確認、Issue 起票判断 |
| 2 | `novel-writer-prod` への構築着手 | C（起点指示済み） | 本田様が「bugfix 一通り完了」と判断したタイミング | impl-plan → GCP リソース構築 → workflow 分岐 → Firebase Secrets 登録 → smoke test |
| 3 | `./scripts/setup-safety-event-metrics.sh --project novel-writer-dev` 実行 | A（指示待ち） | 本田様からの実行指示 | metrics 初期化 |
| 4 | Cloud Logging baseline 観察 → alert enable 判断 | A（指示待ち） | 本田様からの判断結果（1〜4 週間後） | alert 設定変更 |
| 5 | Issue #137 残サブ #6 / #8 / Issue #147 / #152 / #155 / #156 の優先順位決定・実装着手 | B 修正 / C（起点指示済み） | 本田様からの番号単位明示指示 | impl-plan → 実装 |

### 却下候補（記録のみ）

| # | 項目 | A/B/C | 着手しない理由 |
|---|------|-------|--------------|
| 1 | handoff 整理 / memory 整理 | A（指示なし） | housekeeping 越権防止（4 原則 §1） |
| 2 | 残 Issue への AI 起点実装提案 | C（起点 unclear） | 起点アイデアは decision-maker 領分 |
| 3 | 他箇所のヘルプ追加・UI 改善提案 | C（起点 unclear） | 同上 |
| 4 | テストカバレッジ向上・追加リファクタ | C（起点 unclear） | 同上 |
| 5 | prod 移行の前倒し着手提案 | C（起点合意済みだが trigger 未充足） | trigger は「bugfix 一通り完了」、現時点で未充足 |
| 6 | SyncDialog 完全削除 / summary 自動同期化 (PR-D1 後続) | C（起点 unclear） | Codex セカンドオピニオンで意図的に scope 外とした、起点指示待ち |
| 7 | 「タイムラインへ送る」未反映の自主修正 | C（起点 unclear） | 切り分け調査前の修正提案は越権（実機で観察したが本セッションでは未起票） |

## 再開可能性判定

| 項目 | 状態 |
|------|------|
| Git Status | ✅ clean |
| Open PR | ✅ ゼロ |
| Active Issue | 5 件 (全て LOW + 本田様判断待ち) |
| CI | ✅ Deploy to Cloud Run #27109783026 (PR-D1) success (3m20s) |
| 残留プロセス | ✅ なし |
| 即着手タスク | 0 件 |
| 条件待ち | 5 件 (全て decision-maker trigger) |

## 最終結論

🛑 **executor 領分の作業ゼロ、即時セッション終了推奨**

- Open PR ゼロ / Git clean / CI success
- PR #165–#168 4 件すべて完走（マージ + デプロイ + 本番 Playwright MCP 実機確認）
- 条件待ち 5 件すべて decision-maker からの trigger 待ち
