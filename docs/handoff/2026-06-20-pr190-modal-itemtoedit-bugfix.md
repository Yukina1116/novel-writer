# Handoff: PR #190 完走 (プロットボード編集モーダル itemToEdit 経由再オープン抑止バグ修正)

- Session Date: 2026-06-20
- Owner: yasushi-honda
- Status: ✅ **PR #190 main マージ完了、Cloud Run dev デプロイ成功、実機 OK**
- Previous: [LATEST → 2026-06-19b PR #187 + #188 完走](./2026-06-19b-pr187-188-issue181-phase3-completion.md)

## 本セッション PR / Issue

| 種別 | # | 内容 | 状態 |
|------|---|------|------|
| **PR** | **#190** | fix(plotboard): itemToEdit 経由の編集モーダル再オープン抑止 (useEffect 分割 + ref ガード) | ✅ Squash merged (`ab08569`) |
| Issue | (未起票) | uiSlice.ts:121 / dataSlice.ts:323 の温床 2 件 | ⏸ 起票見送り (triage 基準未充足、本 doc に記録) |

## ユーザー報告バグ

> タイムラインで編集して、そしてプロットにもどったとき、編集モーダルに戻り、保存が押せない状況になっている。ここでキャンセルをして、別のプロットの編集モーダルが開かれると、その以前の未保存のものが勝手に入ってしまう。

## 本セッション達成内容

### 1. PR #190 (バグ #1「保存できない」+ バグ #2「前データ混入」)

#### 原因

`components/PlotBoardModal.tsx:349-372` の単一 `useEffect` が `[isOpen, plotItems, relations, nodePositions, initialColors, itemToEdit]` を全部 deps に持ち、`if(itemToEdit) { ... setEditingCard(card); }` を毎回実行していた。

1. **保存ボタンが押せない**: PlotListPanel.edit / navigateToPlot で開いた編集モーダルで保存 → `upsertPlotItem` が store の plotBoard 参照を変える → useEffect 再発火 → `itemToEdit` 残留で `setEditingCard(card)` が即時再オープン
2. **キャンセル後の前データ混入**: 古い `itemToEdit` が `modalPayload` に残り、別カードを開いた瞬間に他要因で useEffect が走ると `editingCard` が元 plotA に上書きされ、`CardEditorModal` の useEffect が plotA データで再初期化

#### 修正 (Codex セカンドオピニオン承認の (b) 案)

useEffect を 2 つに分割:
1. **store→local 同期**: `plotItems / relations / positions / colors` の追随。`editingCard` には触れない。
2. **itemToEdit→editingCard 初期表示**: `handledItemToEditIdRef` で ID 単位 1 回ガード。`!isOpen || !itemToEdit` 時に ref をリセット。

加えて `plotItems.find` が undefined を返す経路を分離:
- **racing-load** (`plotItems.length === 0`): ref を進めず再評価を許容
- **permanent miss** (length > 0 で find undefined): `showToast` 通知 + ref 前進で「クリックしても無反応」+「永久リトライ ループ」のサイレント失敗を防止

#### コミット履歴

- `890a81d` 初回修正 (useEffect 分割 + ref ガード)
- `1eab0d7` レビュー指摘対応 (silent-failure + comment 規律 + ref reset 拡張)
- `ab08569` main マージ (squash)

#### 検証

- npm run lint (tsc --noEmit): PASS
- npm run test: **55 files / 836 tests PASS** (新規 8 件 含む)
- Playwright MCP 実機確認 (dev):
  - PlotListPanel.edit→保存後にモーダルが正しく閉じる (旧バグ #1 解消)
  - サイドパネル / カードに新タイトル反映
- Cloud Run dev デプロイ: 3m15s で success、`https://novel-writer-ramnh3ulya-an.a.run.app`
- ユーザー実機テスト: OK

### 2. レビュープロセス

PR #190 は 2 段階レビュー:

1. **Codex セカンドオピニオン** (実装着手前): バグ #1 分析が正しいことを確認、修正案として「ref ガード単一 effect」より「effect 分割 + ref ガード」を推奨。バグ #2 も同 root cause で発生する経路を独立確認。`uiSlice.ts:121` と `dataSlice.ts:323` の関連温床も指摘。
2. **pr-review-toolkit 4 エージェント並列レビュー** (PR 作成後):
   - **code-reviewer**: Critical/Important 0、マージ可
   - **comment-analyzer**: Critical 1 + Important 3 (CLAUDE.md MUST 違反「Codex セカンドオピニオン (b) 案」表記等)
   - **silent-failure-hunter**: Critical 1 (find→undefined のサイレントスキップ) + Important 3
   - **pr-test-analyzer**: Important 3 (構造 grep のみで挙動 pin が間接的)

レビュー指摘のうち Critical 2 + Important 4 を本 PR で対応、振る舞いテスト追加 (pure helper 抽出) は別 PR に分離。

## Architectural Lesson (本プロジェクト固有の pitfall 記録)

### 全自動保存方針 (Phase 3) と modalPayload を扱う useEffect の衝突

**症状**: モーダルが保存後に閉じない / キャンセル後に別アイテムを開くと前データが混入する。

**原因パターン**:
- Phase 3 自動保存方針 (mutation 都度 store に upsert) により、保存操作のたびに store のリスト参照が変化する
- 単一 `useEffect([..., plotItems, ..., modalPayload])` 内で `modalPayload` から内側モーダルの state (editingCard 等) を初期化する処理を書くと、保存→store更新→useEffect再発火→modalPayload 再注入の無限ループになる
- `forceCloseModal` 経由でモーダルを閉じても、`modalPayload` がクリアされない状態 (`uiSlice.ts:121` の `if (activeModal === type) return;` 経路など) で他要因の useEffect 発火が起きると state が復元される

**対策パターン**:
- modalPayload 由来の state injection は **「ID 単位 1 回」ガード必須**
  - `useRef<string | null>(null)` で「処理済 ID」を保持
  - `!isOpen || !itemToEdit` 時に ref をリセット (次回 open 許容)
  - ID 一致時は早期 return
- effect の責務分離: 「store→local 同期」と「modalPayload→inner state 初期化」は別 effect に分ける
- `find` が undefined を返す経路は **racing-load** と **permanent miss** を分離して扱う (permanent miss は通知 + ref 前進でサイレント失敗を防ぐ)

**今後類似実装が想定されるモーダル**:
- `SettingItemModal` (character / world) — `itemToEdit` パターンを使用、同種バグの可能性
- `KnowledgeModal` — 同上
- `ChapterSettingsModal` — `modalPayload` 経由でデータ受け取り

これらが今後 Phase 3 と同等の全自動保存に統合される際は、同じ ref ガードパターンを適用する必要がある。

## 残置 (decision-maker 領分、本セッションでは起票見送り)

### 温床 A: `store/uiSlice.ts:121` の payload 残留経路

```ts
openModal: (type, payload = null) => {
    const { activeModal, isModalDirty } = get();
    // ...
    if (activeModal === type) return;  // ← payload を更新せず無視
    // ...
}
```

同じ modal type への `openModal('plot', otherPlot)` で payload が更新されない。`navigateToPlot` は事前に `closeModal()` を呼ぶので多くは回避できているが、新しい呼び出し経路を追加した場合に潜在バグの温床。

**triage 評価**: rating 不明、再現未確認、「設計温床」止まり → 起票見送り。次回類似バグ発生時に併合 fix を検討。

### 温床 B: `store/dataSlice.ts:323` の `upsertPlotItem` が `syncDialog` を発火する UX 衝突可能性

```ts
} else if (syncResult.syncDialog) {
    openModal('syncDialog', syncResult.syncDialog);
}
```

`activeModal === 'plot'` 中の保存で title/summary 差分 sync が発生すると、`openModal('syncDialog', ...)` が 50ms 遅延で発火し、plot 保存 UX と衝突する可能性。

**triage 評価**: 仮説段階、実害観測なし → 起票見送り。実害発見時に再評価。

### 残置タスク

- **pure helper 抽出 + 振る舞いテスト追加** (pr-test-analyzer 提案): 現プロジェクトは Node 環境 + grep スタイルで意図的に RTL 非採用。テスト基盤刷新が必要なため別 PR スコープ。
- 上記 2 温床の Issue 化判断 (再現条件確認 → triage)

## 次セッションの起点

main は clean / CI 緑 / unpushed なし / postponed なし / 本 PR の active follow-up なし。

直近着手候補は変わらず:
- promptSafety 系 5 Issue (#137 / #147 / #152 / #155 / #156) — decision-maker の番号単位指示待ち
- 新規テーマ → `/brainstorm` 起点

## セッション終了可否

✅ **終了可**

根拠:
- main clean、PR #190 merge 完了
- Cloud Run dev デプロイ success、実機テスト OK
- レビュー指摘の Critical/Important すべて本 PR 内で対応済み
- 残置タスクは decision-maker 領分のみ
