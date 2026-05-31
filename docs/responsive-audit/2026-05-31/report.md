# レスポンシブデザイン監査レポート — 2026-05-31

Issue [#113](https://github.com/Yukina1116/novel-writer/issues/113) Phase 1（screenshot 収集）+ Phase 2（L0/L1/L2 分類）の成果。

## 監査方法

- **ツール**: Playwright MCP（`browser_run_code_unsafe` で 1 ブレークポイント = 1 スクリプト一括キャプチャ）
- **モーダル起動**: dev 限定で Zustand `useStore` を `window.__novelStore` に一時露出し、`openModal(type)` でプログラム起動（トリガーボタン探索を回避）。露出コードはレンダリングに影響せず、commit 前に revert 済み（store/index.ts は原状復帰）。
- **ブレークポイント**: iPhone 12 Pro `390×844` / iPad `768×1024` / Desktop `1440×900`
- **対象データ**: 標準モードの新規プロジェクト「監査用プロジェクト」（空状態）。空フォームはフォーム要素のレイアウト確認に最適。

### `isMobile` 切替の前提（監査上の重要事実）

`App.tsx` は `window.innerWidth < 1280px` で `App.mobile.tsx`（モバイル UI）に切替（ヒステリシス: 1340px 未満で mobile 維持）。したがって:

| ブレークポイント | 描画される View | 位置づけ |
|---|---|---|
| 390px | **App.mobile** | 標準モバイル |
| 768px (iPad) | **App.mobile** | 「広いモバイル」（768 < 1280 のため tablet 専用レイアウトは存在しない） |
| 1440px | **App.tsx**（3パネル） | デスクトップ |

→ issue #28 が懸念した「tablet 中間幅での破綻」は、768px が App.mobile を描画するため該当せず（広いモバイルとして正常表示）。デスクトップ↔モバイルの遷移帯は 1280–1340px。

## カバレッジ

本セッションは **ModalManager 経由で `openModal` 起動できる 16 モーダル + メインビュー 2 種 = 18 component × 3 breakpoint = 54 枚**をキャプチャ・レビュー。

| カテゴリ | カバー済 | 未カバー（Phase 1 残） |
|---|---|---|
| ModalManager 経由 modal | character, world, knowledge, plot, aiSettings, preview, generalHelp, **characterChart**, htmlExport, timeline, nameGenerator, knowledgeBase, globalSearch, syncDialog, importText, exportEncrypt | chapterSettings（payload 必要）, displaySettings（popover anchor 依存） |
| View | mainApp（mobile/desktop）, projectSelection | LeftPanel 各 list panel, RightPanel, Header BentoMenu 展開時 |
| フォーム内ローカル state 起動 modal | — | CharacterGenerationModal, WorldGenerationModal, ImageGenerationModal, CharacterHelpModal, WorldHelpModal |
| 状態前提 modal | — | ImportConflictModal, ImportPassphraseModal, TutorialModeSelectionModal |
| 静的 HTML | — | public/dev/index.html, public/legal/*.html（別経路で確認推奨） |

> 未カバー分は「フォーム操作起点」「特定 state 前提」のため次セッションで UI 駆動 or state seed して補完する。**全 36 component の網羅は未完**（本レポートは 18/36）。

## 分類結果

### L0（致命的・操作不能） — 0 件

なし。

### L1（UX 悪化・はみ出し/縦書き化/クリック困難） — 1 件（本 PR で修正済）

| component | breakpoint | 症状 | 状態 |
|---|---|---|---|
| **CharacterChart**（キャラクター相関図） | 390px | ヘッダーが `flex justify-between` のみで折返し制御なし。狭幅でツールバー（移動/追加/削除 + help + X）が幅を食い、**タイトル「キャラクター相関図」が 1 文字ずつ縦書き化**、モード切替ボタン（追加/削除）も縦折れ | ✅ **本 PR 修正** |

- **証跡**: `evidence/characterChart-390-before.png`（修正前・縦書き化）/ `evidence/characterChart-390-after.png`（修正後）
- **根本原因**: PR #92（whitespace-nowrap 規律）が CharacterChart ヘッダーに未展開
- **修正**: ヘッダーに `flex-wrap gap-2`（幅不足時ツールバーを 2 行目に graceful 折返し）、タイトル h2 に `whitespace-nowrap`、ツールバーに `flex-shrink-0`、モードボタンに `whitespace-nowrap` を追加。768px / 1440px は変更前と同一表示（回帰なし、加算的修正）。

### L2（軽微・見た目のみ） — 2 件

| component | breakpoint | 症状 | 対応 |
|---|---|---|---|
| GlobalSearchModal | 390px | 検索プレースホルダ末尾が切れる（"...(Escで閉じ"）。機能影響なし | 任意（placeholder 短縮 or `text-ellipsis`）|
| KnowledgeBaseModal | 390px | ヘッダータイトル「ナレッジベース」が「新規項目」ボタンに押され truncate 気味（チュートリアル overlay 越しの暫定観察、要再確認） | 要再確認後に判断 |

> preview@390 の空表示は仕様（総文字数 0 の新規プロジェクト）であり不具合ではない。

## 良好だった主な component（抜粋）

- **importText@390**: ✅ PR-A 修正済を確認（単一カラム・縦書き化なし）
- **nameGenerator@390**: ✅ PR #127 の「+キャラクター名」プリセット表示・デフォルト選択を視覚確認
- character / world / knowledge フォーム, aiSettings, htmlExport, timeline, plot, exportEncrypt, syncDialog: 全 breakpoint で適切に stack/折返し
- mainApp（mobile 390/768, desktop 1440）, projectSelection: clean

## 既知の別件（本 PR 対象外）

- `store/authSlice.test.ts` がフルスイート並列実行時に稀に 1 件 fail（単独実行は 37/37 PASS）。並列 race の疑い。本 PR の変更（CSS のみ）とは無関係。観察として記録（要 triage 判断）。

## Phase 3 / 4 への申し送り

- L1 は 1 件のみで本 PR で直接修正したため、sub-issue 起票は不要（net issue 増を回避）。
- 未カバー 18 component の補完キャプチャ（フォーム起点 modal / panel view / 静的 HTML）。
- L2 2 件は本 meta-issue のチェックリストで追跡（即時修正は任意）。
- Phase 4（visual regression test）は CharacterChart ヘッダーの `whitespace-nowrap` を grep pin する軽量テストから着手可。

## screenshot 再生成手順（harness）

1. `PORT=3100 npm run dev`（port 3000 は Docker/Open WebUI が IPv6 占有のため別ポート + `127.0.0.1` 明示）
2. store/index.ts 末尾に dev 限定で `if (typeof window !== 'undefined') (window as any).__novelStore = useStore;` を一時追加
3. Playwright で `127.0.0.1:3100/?skip-terms=1` → `createProject(...,'standard')` → 各 breakpoint で `setViewportSize` → modal type をループして `openModal`→`screenshot`→`closeModal`
4. 完了後 harness を revert

> 全 54 枚はローカル収集済み。リポジトリ肥大化回避のため、リポジトリには L1 証跡（`evidence/`）と本レポートのみ commit。全件 commit を希望する場合は指示ください（約 +3.9MB）。
