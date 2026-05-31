# Handoff: NameGenerator 集約 + レスポンシブ全体監査(#113)完遂 + #49 検証クローズ

- Session Date: 2026-05-31
- Owner: yasushi-honda
- Status: ✅ 再開可能（main clean `7af9d34`、Cloud Run デプロイ 4 PR 全 success、**Open Issue 0 件**）
- Previous handoff: [2026-05-31c-pr125-character-chat-fix.md](./2026-05-31c-pr125-character-chat-fix.md)

## 今セッションのトリガー

前セッション handoff の「次のアクション」: ①進行中の未コミット作業（NameGenerator カテゴリ集約）の完了 ②Issue #113（レスポンシブ全体監査）の着手判断。ユーザー指示で「優先順にすすめて」→ 順次消化し、最終的に **open issue を 0 件**まで削減。

## 完了 PR (4 件、全 main マージ + Cloud Run デプロイ success)

| PR | 内容 | 規模 | merge |
|---|---|---|---|
| #127 | refactor(name-generator): カテゴリ定数を `components/nameCategories.ts` に一元集約 + `initialCategory` を `NameCategory` 型に厳格化 | 4 files, +51/-8 | `45fe7b4` |
| #128 | fix(chart): CharacterChart ヘッダーの狭幅縦書き化修正 + #113 監査 round1（report + 証跡）| 4 files, +92/-4 | `241afbd` |
| #129 | fix(generation): 生成系3 modal の 2カラム強制をモバイル縦stackに + #113 round2 | 6 files, +58/-9 | `15fb239` |
| #130 | fix(knowledge): KnowledgeBase ヘッダーの2行折返し修正 + #113 round3 | 4 files, +37/-6 | `7af9d34` |

## クローズ Issue (2 件)

| Issue | 内容 | クローズ理由 |
|---|---|---|
| #49 | [M4 follow-up] PR #48 持越 5 件 | **全項目（H2/H4/H5/H6/H10 + 各 followup）が後続 PR #51-#58 で消化済み**を grep + git log + テスト実行（84 tests green）で検証。umbrella decay |
| #113 | [meta] レスポンシブ全体網羅監査 | **L0/L1 全解消**（L1×5 修正、coverage 34/36）。close 条件達成 |

## #113 レスポンシブ監査の成果（核心）

### 監査方法（再現手順は report に記載）
Playwright MCP + dev 限定の store 露出 harness（`window.__novelStore = useStore`、commit 前に必ず revert）で `openModal` 起動 + UI 駆動。3 breakpoint（390 / 768 / 1440）。**port 3000 は Docker/Open WebUI が IPv6 占有のため `PORT=3100` + `127.0.0.1` 明示で回避**。

### 発見・修正した L1（5件・全て同根）
全て meta-issue 発端の `ImportTextModal` バグ（`w-1/2 + w-1/2` がモバイルで潰れる）と同じクラスがコードベースに横展開していたもの:

| component | 症状 | PR |
|---|---|---|
| CharacterChart ヘッダー | タイトル1文字ずつ縦書き化 | #128 |
| CharacterGenerationModal | 2カラム強制・送信縦書き化 | #129 |
| WorldGenerationModal | 2カラム強制 | #129 |
| ImageGenerationModal | 2カラム強制（入れ子 grid）| #129 |
| KnowledgeBaseModal ヘッダー | タイトル2行折返し | #130 |

修正パターン: 生成系 = `flex` → `flex flex-col md:flex-row` + `w-1/2` → `w-full md:w-1/2`。ヘッダー系 = `flex-wrap` + `whitespace-nowrap` + `flex-shrink-0`。全て mobile 視覚検証 + desktop 回帰なし確認済み。

### clean だった項目 / L2
- 静的HTML（dev portal の Mermaid #35・legal×3）overflow 0px、panel view×7、tutorialModeSelection/chapterSettings: 全 clean
- L2: GlobalSearch placeholder 切れ = **受容**（cosmetic）

### 監査成果物
`docs/responsive-audit/2026-05-31/`（report.md + evidence/ に L1 証跡 before/after）。**全54枚スクショはローカルのみ**（リポジトリ肥大化回避、再生成手順は report 末尾）。

## 検証（実数字）

- `tsc --noEmit` → **0 errors**（各 PR で確認）
- `vitest run` → **509 passed / 5 skipped**（全 PR 共通、最終も同値）
- 全 4 PR の Cloud Run デプロイ = **success** 確認済

## レビュー方式

- #127: `/safe-refactor`（型強度向上）→ `/code-review low` → `/review-pr`（3 agent、型境界リーク指摘を反映）
- #128/#129/#130: `/code-review low`（CSS className のみ、proven pattern）
- 各マージは「PR #番号 — タイトル (N files, +X/-Y)」要約付き番号単位明示認可後に実行

## flaky テスト調査（authSlice.test.ts）— 投機的修正は見送り

Round 1 で観察したフルスイート稀 fail を調査:
- vitest `pool: 'forks'` + `singleFork: false` で**ファイルごとプロセス隔離** → `global.fetch` stub の cross-file 汚染は原理的に不可能（当初仮説否定）
- フルスイート **6 回連続 PASS**、再現せず（< 1/7）
- 結論: 再現不能な低頻度 flake への投機的修正は cost-benefit 非該当 → **monitor 継続**（report Round 3 に記録）

## 残課題 (本セッション外・継続)

1. **モバイル実機確認**: PR #100 等 + 今回の #128-#130 レスポンシブ修正を iPhone 実機で 1 サイクル（特に生成系 modal の縦stack・KnowledgeBase ヘッダー）。
2. **法務確認 (継続)**: 顧問弁護士確認 → `public/legal/*.md` 文言確定 + LEGAL_REVIEW_REQUIRED 一斉削除 PR (M7-β)。
3. **#125 多ターン E2E の積み残し**: 「それで」継続 + intent 引き継ぎの実トラフィック実証（コードでは確認済）。
4. **#113 残カバレッジ（低リスク・必要時）**: Help×2（テキスト中心）/ Import 系×2（M4/M6 監査済）の補完キャプチャ。
5. **authSlice flaky**: monitor 継続（CI で再発したら timing-sensitive async テストを精査）。
6. **GlobalSearch placeholder（受容済 L2）**: 気になれば placeholder 短縮。

## 次セッション開始時の状態

- ブランチ: `main` clean（`7af9d34` = PR #130 マージ後）
- **Open Issue: 0 件**（#49・#113 をクローズ、新規起票なし）
- 型チェック: `tsc --noEmit` 0 errors / 全テスト 509 pass
- CI/CD: 4 PR とも Cloud Run デプロイ **success**
- 環境: dev サーバ停止済（ゾンビ tsx 0）/ Docker Open WebUI(port 3000) は本田様の別サービスで非干渉

## 知見メモ (本セッションで得た教訓)

### A. umbrella issue は着手前に「grep + git log + テスト実行」で実態確認（再確認）
#49 H4/H5/H6 のテスト追加を選んだが、grep したところ**全て後続 PR #51-#58 で実装済み**だった（umbrella decay）。重複テストを書かず、84 tests green を確認して issue をクローズ（Net -1）。「指示されたタスクが既に done」は珍しくない。

### B. レスポンシブ監査は store 露出 harness + Playwright スクリプト一括ループが高効率
26+ modal × 3 breakpoint を個別 UI 操作で回すのは非現実的（150+ ツール呼び出し）。dev 限定で `window.__novelStore` を露出し、`browser_run_code_unsafe` で modal type をループして `openModal→screenshot→closeModal` すれば 1 breakpoint = 1 スクリプト。harness は commit 前に必ず revert（本セッション 3 回とも 0 件確認）。

### C. `w-1/2` 2カラム / `flex justify-between` ヘッダーはモバイル縦折れの2大パターン
ImportTextModal バグの根本（`w-1/2 + w-1/2`）と CharacterChart の根本（`flex justify-between` + CJK タイトル）が、それぞれ生成系3 modal・KnowledgeBase に横展開していた。**今後 modal 追加時は「mobile で 2カラム強制していないか」「justify-between ヘッダーに whitespace-nowrap + flex-wrap があるか」をチェック**（PR #92 の whitespace-nowrap 規律の延長）。

### D. `isMobile` 切替境界は 1280px（768px=iPad も App.mobile）
レスポンシブ監査時、768px は tablet 専用レイアウトではなく App.mobile（広いモバイル）が描画される。modal 内の `md:`(768) breakpoint との二重構造に注意。

## Issue Net 変化

- Open Issue 開始時: 2 件 (#113, #49)
- Open Issue 終了時: **0 件**
- Close 数: **2 件** (#49, #113)
- 起票数: 0 件
- Net: **-2 件**（2 → 0）
- 備考: #49 は umbrella decay（既存実装を検証してクローズ）、#113 は L0/L1 全解消でクローズ。新規起票ゼロ（発見した L1 は sub-issue 化せず即修正 PR で完結、net 増を回避）。rating 5-6 の機械起票なし。
