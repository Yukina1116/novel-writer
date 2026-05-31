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
| GlobalSearchModal | 390px | 検索プレースホルダ末尾が切れる（"...(Escで閉じ"）。機能影響なし | **受容**（placeholder ヒントの truncation は許容範囲の mobile UX、コード `GlobalSearchModal.tsx:225`）|
| KnowledgeBaseModal | 390px | ヘッダータイトル「ナレッジベース」が「新規項目を追加」ボタンに押され 2 行折返し（`flex justify-between` のみ・CharacterChart と同根、軽度版）| ✅ **Round 3 で修正**（後述）|

> KnowledgeBase は当初「要再確認」としていたが、チュートリアル overlay を dismiss して再キャプチャした結果、h2 が height 56px=2 行に wrap していることを確認（`evidence/knowledgeBase-390-before.png`）。CharacterChart と同じ `flex justify-between` 脆弱パターンのため Round 3 で同じ proven fix を適用。

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

---

# Round 2 追記（2026-05-31・カバレッジ補完）

Round 1 で未カバーだった component を補完監査。ModalManager 経由で開けない modal（フォーム内ローカル state 起動）・panel view・静的 HTML を対象に追加 16 component をキャプチャ・レビュー。

## Round 2 カバレッジ

| カテゴリ | 結果 |
|---|---|
| 静的HTML: `public/dev/index.html` | ✅ clean。**issue #35 の Mermaid 横はみ出し懸念を否定**（390px で `documentElement.scrollWidth === 390`, overflow 0px）|
| 静的HTML: `public/legal/{terms,privacy,tokushou}.html` | ✅ clean（3ページとも overflow 0px、単一カラムで mobile 可読）|
| `tutorialModeSelection` / `chapterSettings` | ✅ clean（store `openModal` 経由）|
| `displaySettings` | N/A（`displayMenuButtonRef` 依存のデスクトップ専用 popover。モバイルに該当 trigger なし）|
| panel view ×7（settings/characters/worlds/knowledge/plots/outline/history）| ✅ mobile(390)/desktop(1440) とも clean（L2: 7タブのタブバーは横スクロール、標準的なモバイルパターン）|
| **CharacterGenerationModal** | 🔴 **L1 → 本 PR 修正** |
| **WorldGenerationModal** | 🔴 **L1 → 本 PR 修正** |
| **ImageGenerationModal** | 🔴 **L1 → 本 PR 修正** |

未捕捉（低リスク・defer）: `CharacterHelpModal` / `WorldHelpModal`（テキスト中心、`generalHelp@390` が clean で同レイアウトパターン健全）、`ImportConflictModal` / `ImportPassphraseModal`（state 前提、M4/M6 で responsive 構築済）。

## 🔴 Round 2 L1（3件・同一根本原因 → 本 PR 修正済）

生成系3 modal が **2カラムレイアウト（`w-1/2` + `w-1/2`）を全幅で強制**し、レスポンシブ分岐がなかった。390px で左ペイン（チャット / フォーム）が極端に圧縮され、**「送信」ボタンが縦書き化**（証跡 `evidence/characterGeneration-390-2col-before.png`）。

これは **meta-issue 発端の `ImportTextModal` バグ（スコープ表 #1: `w-1/2 + w-1/2` がモバイル幅に潰される）と完全に同根**。

| component | 該当行 |
|---|---|
| `CharacterGenerationModal.tsx` | 337（行コンテナ）/ 338, 421（`w-1/2` ペイン）|
| `WorldGenerationModal.tsx` | 256 / 257, 334 |
| `ImageGenerationModal.tsx` | 260 / 261, 262 |

**修正（3 modal 共通パターン）**:
- 行コンテナ: `flex` → `flex flex-col md:flex-row`（< 768px は縦 stack、≥ 768px は従来の 2 カラム）
- 各ペイン: `w-1/2` → `w-full md:w-1/2`
- 区切り線: `border-r` → `border-b md:border-b-0 md:border-r`（stack 時は下境界、横並び時は右境界）

**検証**: `CharacterGenerationModal` を 390px（縦 stack・送信ボタン横並びに改善）/ 1440px（2 カラム維持・回帰なし）で視覚確認（証跡 `evidence/characterGeneration-390-stacked-after.png`）。`WorldGenerationModal` / `ImageGenerationModal` は同一の className 変更（コード parity）で、CharacterGeneration を代表検証とする（両者は AI ボタンが name 未入力 / 操作前提で実 UI 起動が gate されるため）。

## カバレッジ最終: 約 34/36 component

Round 1（18）+ Round 2（16）。残り未捕捉は Help 2 種（低リスク）+ Import 系 2 種（state 前提・M4/M6 監査済）のみ。meta-issue #113 の主要 modal / view / 静的ページはほぼ網羅。

## Round 2 で得た知見

- **2カラム強制パターンは横展開していた**: ImportTextModal（修正済）と同根の `w-1/2 + w-1/2` が生成系3 modal に残存。今後 modal 追加時は「mobile で 2 カラムを強制していないか」を規律としてチェックすべき（PR #92 の whitespace-nowrap 規律と並ぶ責務分界）。
- **isMobile 切替は 1280px 境界**のため、768px (iPad) でも生成系 modal は `md:`(768) breakpoint で 2 カラムに戻る。iPad では 2 カラム各ペイン約 340px で実用上問題なし。

---

# Round 3 追記（2026-05-31・L2 再確認 + flaky 調査）

## KnowledgeBaseModal ヘッダー折返し（本 PR 修正）

Round 1 で「要再確認」としていた L2 を、チュートリアル overlay を dismiss して再キャプチャ・計測した結果、**h2「ナレッジベース」が height 56px=2 行に折り返し**、「新規項目を追加」ボタンも 2 行折返しすることを確認（`evidence/knowledgeBase-390-before.png`）。`KnowledgeBaseModal.tsx:349` の `flex justify-between` のみで折返し制御がなく、CharacterChart と同根（軽度版）。

**修正**（CharacterChart と同じ proven pattern）:
- ヘッダー: `flex justify-between items-center` → `flex flex-wrap justify-between items-center gap-2`
- h2: `whitespace-nowrap` 追加
- ツールバー: `flex-shrink-0` 追加
- 新規項目を追加ボタン: `whitespace-nowrap` 追加

検証: 390px で h2 height 56→28px（1 行）に改善、ツールバーは 2 行目に graceful 折返し（`evidence/knowledgeBase-390-after.png`）。1440px は title height 28px（1 行）で回帰なし。

## flaky テスト調査（`store/authSlice.test.ts`）— 投機的修正は見送り

Round 1 で観察したフルスイート並列実行時の稀な fail を調査:

- **vitest は `pool: 'forks'` + `singleFork: false`**（`vitest.config`）でテストファイルごとに別プロセス隔離。→ authSlice の `global.fetch` stub が他ファイルを汚染する経路は**原理的に存在しない**（当初の cross-file 汚染仮説を否定）。
- フルスイートを **6 回連続実行して全て PASS**（509 passed | 5 skipped）。再現せず（観察された fail は < 1/7 の極低頻度）。
- 根本原因は並列 CPU 負荷下の timing-sensitive な async テスト（`authSlice.test.ts` の手動 microtask 操作 / 手動 promise 制御）が濃厚だが、再現不能なため確定不可。
- **結論**: 再現不能な低頻度 flake への投機的修正は cost-benefit に見合わない（rabbit hole）。観察として記録し monitor 継続。`afterEach` での `global.fetch` 復元追加は防御的衛生として将来検討可だが、forks 隔離下では cross-file 効果はなく優先度低。

## L2 据え置き

- **GlobalSearchModal** placeholder 末尾切れ（`GlobalSearchModal.tsx:225`）は **受容**。placeholder ヒントの truncation は標準的な mobile UX で機能影響なし。
