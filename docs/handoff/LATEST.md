# Handoff: テキストインポート解析モーダルの bundle 修正 + レスポンシブ網羅 meta-issue 起票

- Session Date: 2026-05-24
- Owner: yasushi-honda
- Status: ✅ 再開可能（main clean、Cloud Run デプロイ success、Open Issue 2 件すべて monitor / spec 検討対象）
- Previous handoff: [2026-05-17b-issue-cleanup-and-text-import-bugs.md](./2026-05-17b-issue-cleanup-and-text-import-bugs.md)

## 今セッションのトリガー

1. `/catchup` で前セッション残 Open Issue 確認 → `#106` + `#107` (両方 `components/ImportTextModal.tsx` を touch) を bundle 着手と判断
2. 実装 Phase 4 中にユーザーからスクリーンショット添付 (iPhone 12 Pro 390px) で **ImportTextModal の 2-col レイアウトが縦書き化** している致命的 UX 不良を報告 → PR scope を拡張してモバイルレスポンシブ修正を統合 + 全モーダル/view 網羅監査の meta-issue を別途起票
3. 4 段階レビュー方式 (`Codex (impl-plan)` → `/code-review medium (3-finder)` → `Evaluator agent (AC 検証)` → `Codex (最終 diff)`) で各段階で実害ある指摘を 1 件以上検出 → 全て修正 → 1 PR で main マージ

## 完了 PR (1 件、main 反映済 + Cloud Run デプロイ success)

| PR | 内容 | Closes | merge commit | デプロイ |
|---|---|---|---|---|
| #114 | fix(import): default-OFF checkboxes + source text panel + mobile responsive | #106, #107 | `f508934` | ✅ success (3m1s) |

## PR #114 要点 (Issue #106 + #107 bundle + モバイルレスポンシブ緊急対応)

### #107 修正 (チェックボックスのデフォルト OFF 化)

**根本原因**: `components/ImportTextModal.tsx:302` の `checked={selectedTerms[termObj.name]?.action !== 'ignore'}` で `undefined !== 'ignore' = true` となり、未操作の用語・世界観候補が全部 ON 表示。`line 351` 右ペイン「この項目を反映する」も同じ pattern で latent bug。

**修正**:
- `components/importTextModalHelpers.ts` (新規 pure helper) に `isSelectedCharacterAction` / `isSelectedTermAction` を切出
- `line 302` (用語 list) + `line 351` (右ペイン character / term 両方) を helper に置換 → undefined → false で OFF 初期化
- 登場人物候補 (line 248, 272) は元から `=== 'link'` / `=== 'create'` で正しく OFF 初期だったため変更なし (`line 270` で一度 helper 化したが `&& === 'link'` が冗長と /code-review で指摘され元に戻し)
- `components/importTextModalHelpers.test.ts` (新規) で 8 件の vitest pin (undefined→false / 各 action → 期待値)

### #106 追加 (投入元テキスト表示)

**追加**: reflect step 左サイドメニュー末尾に「投入元テキスト」collapse セクション

**型・データ拡張**:
- `types.ts`: `AnalysisResult.sourceText?: string` 追加 (optional、backward compatible)
- `analysisApi.ts`: `analyzeTextForImport` 成功時に `enriched = { ...result.data, sourceText: importedText }` を組み立て、`saveAnalysisHistory(enriched)` + return `{ success: true, data: enriched }` 早期 return で履歴 + `lastAnalysisResult` 両経路に反映
- Codex 事前相談で「`saveAnalysisHistory` 経路の見落とし」を指摘 → dataSlice 側でなく `analysisApi.ts` 側で enrich する設計に変更

**UI**:
- `aria-expanded` 付き collapse button + `<pre>` で `max-h-64 overflow-y-auto whitespace-pre-wrap break-words font-sans` 表示
- 旧履歴 (sourceText 未保存) は fallback 文言「(この履歴データには投入元テキストが含まれていません。次回以降の解析から記録されます)」
- **Evaluator 指摘 (AC-106-5 FAIL)**: 当初 `(currentAnalysisResult?.sourceText || inputText)` で fallback 表示していたが、「ユーザーが input → analyze → 戻る → 旧履歴を開く」シナリオで textarea 残骸 `inputText` が誤表示される問題 → `inputText` fallback を削除し `currentAnalysisResult?.sourceText` のみで判定 (新規解析は必ず enrich されるため副作用なし)

### モバイルレスポンシブ修正 (緊急対応、PR scope 拡張)

**問題**: iPhone 12 Pro (390px) で `max-w-6xl` Modal 内の `flex` 2-col (`w-1/2 + w-1/2`) が 195px に潰れ、ボタンテキスト・説明文・textarea が縦書き化

**修正**:
- **input phase**: `flex` → `flex-col md:flex-row` + 各カラムを `w-full md:w-1/2`、右側 hero panel は `hidden md:flex` でモバイル非表示、textarea に `min-h-[200px]` 確保
- **reflect phase**: モバイルは「候補リスト」「プレビュー」の 2-tab 切替に再構成
  - `mobileReflectView: 'list' | 'preview'` state 追加
  - `flex md:hidden` の tab switcher (`role="tablist"` + 各ボタン `role="tab"` / `aria-selected` / `aria-controls`)
  - 左右パネルに `role="tabpanel"` / `aria-labelledby`
  - `showPreview()` で `setMobileReflectView('preview')` 自動切替
  - `handleBackToInput()` で `setMobileReflectView('list')` リセット
- **ボタン**: `whitespace-nowrap min-w-0` + `text-sm md:text-base truncate` で縦書き化防止 (PR #92 の規律を本モーダルに展開)
- **preview pane radio row** (Codex 最終 diff レビュー指摘 Medium): `flex items-center gap-4` → `flex-col items-start gap-3 md:flex-row md:items-center md:gap-4 md:flex-wrap` で長文ラベル overflow 解消 (追加 commit `69641b7`)

### レビュー結果 (4 段階)

| Phase | 検出 | 対応 |
|---|---|---|
| Codex (impl-plan 段階) | `saveAnalysisHistory` 経路の見落とし | `analysisApi.ts` で enrich する設計に変更 |
| `/code-review medium` (3-finder × verify) | 8 候補 → dedup 後 2 件採用 | `line 270` 冗長 `&&` 削除 + mobile tab WAI-ARIA 追加 |
| Evaluator agent (5 ファイル変更で Evaluator 分離プロトコル発動) | AC-106-5 FAIL (旧履歴 fallback の textarea 残骸誤表示) | `inputText` fallback 削除 |
| Codex (最終 diff レビュー) | Medium: preview pane radio row が mobile overflow | `flex-col → md:flex-row` + `md:flex-wrap` で対応 (追加 commit `69641b7`) |

## 起票 Issue (1 件、本セッションで発見、ユーザー明示指示 = triage 基準 #5)

### #113 [P1, meta-enhancement] (OPEN)

レスポンシブデザイン全体網羅監査 + 修正 meta-issue。本セッションの ImportTextModal 縦書き化を契機に、全 modal (27 件) + view / screen (9 件) のレスポンシブを Playwright MCP で 3 breakpoint (iPhone 12 Pro / iPad / Desktop) で screenshot 収集 → L0/L1/L2 分類 → 個別 sub-issue 化 → 順次 PR 提出する Phase 1〜4 spec を body に明記済

**triage 基準**: ✅ #5 ユーザー明示指示 + ✅ #1 実害あり (iPhone 12 Pro でモーダル操作不能、本セッション ImportTextModal で実証)

**着手判断**: spec 規模大、次セッションでユーザーと優先順位協議

## 残課題 (本セッション外)

1. **#113 着手判断**: Phase 1 (Playwright MCP で 36 component の 3 breakpoint screenshot 収集) から開始可能。spec 大規模のため、ユーザーが「P1 で全体監査やる」か「個別優先で都度 issue 切る」かを判断
2. **モバイル実機確認 (継続)**: PR #100 / #110-#112 / #114 を iPhone 実機で 1 サイクル
3. **法務確認 (継続)**: 顧問弁護士確認 → md 文言確定 + LEGAL_REVIEW_REQUIRED + `<!-- TODO -->` 一斉削除 PR (M7-β)
4. **#49 [M4 follow-up]**: monitor 継続 (変化なし)
5. **Firebase Auth `popup.closed` polling の COOP console error** — SDK 仕様 (前セッションから継続)
6. **タッチ操作 / 仮想キーボード挙動** (モバイル実機) — 前セッションから継続

## 次セッション開始時の状態

- ブランチ: `main` clean (`f508934` = PR #114 マージ後)
- Open Issue: 2 件
  - #49 [M4 follow-up] PR #48 持越 5 件 (monitor、変化なし)
  - **#113 [meta][P1] レスポンシブ全体網羅監査** (本セッション起票)
- 自動テスト: vitest **482 / 482 PASS** (前 474 → +8: importTextModalHelpers 8 件)
- 型チェック: `tsc --noEmit` 0 errors
- CI/CD: PR #114 マージ後の Cloud Run デプロイ ✅ success (3m1s、`actions/runs/26349493732`)

## 次のアクション (推奨順)

1. **#113 着手判断**: ユーザーと「全体監査 spec を実行するか」「個別観察ベースで都度 issue 化するか」を協議
2. **本番実機確認**: https://novel-writer-ramnh3ulya-an.a.run.app/ で iPhone 12 Pro エミュレーション → テキストインポート解析モーダルが縦書き化していないことを確認 (#114 の最も重要な修正点)
3. **#106/#107 動作確認**: 同 URL で AI 解析実行 → reflect step で「用語・世界観候補」が全部 OFF 初期 + 投入元テキスト section が機能することを確認

## 主要参照

- 関連 PR: **#114** (本セッション、squash merge `f508934`)
- 関連 Issue: **#106 / #107 (CLOSED)**, **#113 (OPEN、本セッション起票)**
- 主要修正ファイル:
  - `types.ts` (sourceText optional 追加)
  - `analysisApi.ts` (enrich + 早期 return)
  - `components/ImportTextModal.tsx` (helper 適用 + 投入元テキスト UI + モバイルレスポンシブ + WAI-ARIA tabs + radio row 折返し)
  - `components/importTextModalHelpers.ts` / `importTextModalHelpers.test.ts` (新規 pure helper + 8 vitest)

## 知見メモ (本セッションで得た教訓)

### A. 4 段階レビュー方式は大規模 PR で各段階別の検出力を発揮する

本 PR では:
- **Codex (impl-plan 段階)**: 設計段階の経路見落とし (`saveAnalysisHistory` で sourceText が enrich されない) を検出 → 実装前に設計修正できた
- **/code-review medium (3-finder × verify)**: 実装後の重複・冗長コード (`&&` 冗長) + WAI-ARIA 欠落を検出 → 実装中に対応
- **Evaluator agent (AC 検証)**: 表示ロジックの edge case (旧履歴 + textarea 残骸) を検出 → 仕様レベルの FAIL 発見
- **Codex (最終 diff)**: コード変更で誘発された別の overflow リスク (preview pane radio row) を検出 → マージ前に追加 commit で対応

各段階で **重なる指摘がほぼなかった** ことが重要。Generator + 4 種の Evaluator の組合せは「同じ層を異なる角度で見る」だけでなく「異なる層を異なる時点で見る」効果がある。**5+ ファイル / 200+ 行の PR ではこの 4 段階を全部走らせる規律を継続**

### B. PR scope の途中拡張は「同ファイル touch」で正当化される

ユーザーから ImportTextModal の縦書き化指摘を受けた時点で、すでに同ファイルを Phase 4 で編集中だった。**別 PR に切り出す方が「PR は単一目的」原則には沿うが、同ファイル並行編集による merge conflict + dev review 往復のコストを考えると、scope 拡張 + meta-issue 起票 (#113) で大規模監査を別管理する判断が ROI 高い**。`feedback_multi_pr_file_conflict.md` の教訓と整合

### C. 「実機目視 Test plan に明記してユーザー本人に委ねる」は妥当な妥協点

Playwright MCP で LeftPanel → Settings タブ → 「テキスト解析」モーダル経路に到達するのに UI 操作で手間取った。Build/lint/482 unit test/Evaluator AC が全 PASS している状況で「実機目視まで AI が完遂する」のは ROI が悪い。**PR Test plan にチェックボックス形式でユーザー本人実機確認を明記** → マージ判断時にユーザーが端末で確認、という分業が現実的

ただし、致命的な修正 (今回の縦書き化) は AI 側で 1 枚でも screenshot 取れていれば自信が増した。**次回以降は Zustand store を dev build で window 露出する hack (もしくは URL hash で modal open する dev-only API) を持つと、Playwright で直接モーダルを開けて目視できる**

## Issue Net 変化

- Open Issue 開始時: 3 件 (#106, #107, #49)
- Open Issue 終了時: 2 件 (#113, #49)
- Close 数: 2 件 (#106, #107、いずれも PR #114 auto-close)
- 起票数: 1 件 (#113、ユーザー明示指示 + 実害発見 = triage 基準 #5 + #1)
- Net: **-1 件** (3 → 2)
- 備考: 起票 1 件 (#113) は meta-issue で、内部に Phase 1〜4 spec + 36 component リストを抱えているため「実質的には 36 個分の懸念を 1 件に束ねた」状態。L0/L1 個別 sub-issue 化は Phase 2 で実施予定。**rating 5-6 の review agent 提案を機械起票していない** ことを再確認済
