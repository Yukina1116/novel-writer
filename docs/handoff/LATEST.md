# Handoff: 取扱説明書削除 + ヘッダー UI 整理 + ナレッジ初期空化 + tooltip 統一 + 人名抽出強化 (5 PR 連続マージ)

- Session Date: 2026-05-24 (2nd session)
- Owner: yasushi-honda
- Status: ✅ 再開可能（main clean、Cloud Run デプロイ進行中、Open Issue 2 件すべて monitor 対象）
- Previous handoff: [2026-05-24-import-modal-bundle-fix.md](./2026-05-24-import-modal-bundle-fix.md)

## 今セッションのトリガー

ユーザーから連続して 5 件の UI / UX / AI prompt 改善要求がスクリーンショット付きで投入された:

1. **要求 (取扱説明書)**: HelpModal 左サイドバーの「7. UIリファレンス」「8. テストケース」「9. テストシナリオ」 3 セクションを削除
2. **要求 B**: ヘッダー右上アバター横の email 全文表示 (`hy.unimail.11@gmail.com`) を非表示化
3. **要求 C**: 新規プロジェクトの初期ナレッジ (「ヘルプ: テキスト解析」等 約 15 件の自動投入カード) を空に
4. **要求 D**: 「プロモード」tooltip が英語 + tech 表記 (engineer 寄り) になっていたのを「標準モード」と統一 (小説家向け表記)
5. **要求 A**: テキストインポート解析の「登場人物候補」セクションが空欄になる問題 → AI prompt を強化し呼称・代名詞も抽出対象に

各要求を独立した小 PR (1-6 ファイル / +5〜+73 行) に分割し、ユーザー番号単位明示認可 → squash merge → main 同期を 5 サイクル連続実行。

## 完了 PR (5 件、すべて main マージ済)

| PR | 内容 | 規模 | merge commit |
|---|---|---|---|
| #116 | docs(manual): remove sections 7-9 (UI ref / test cases / test scenarios) | 6 files, +5/-429 | `513bb82` |
| #117 | ui(auth): hide email text from header avatar button (keep in dropdown) | 1 file, +3/-2 | `e939a87` |
| #118 | chore(knowledge): remove auto-seed of help entries on new project | 1 file, +0/-28 | `ce16d2d` |
| #119 | ui(tooltip): fall back pro mode to standard tooltip (novelist-friendly text) | 1 file, +2/-1 | `5579a0b` |
| #120 | feat(analysis): extract appellations and pronouns as character candidates | 2 files, +73/-1 | `5493647` |

Cloud Run デプロイ: PR #120 main マージ後のデプロイが本ハンドオフ作成時点で `in_progress` (1m13s 経過、PR-time deploy は ✅ success 50s)。

## PR 別要点

### PR #116 (manual sections 7-9 削除)

- `components/HelpModals.tsx`: `siteMapContent` 定数 (60 行) + `manualContent` 7-9 エントリ + `docTitles` 7-9 エントリ + `index.md` 目次 7 番リンク + `<pre>` 専用分岐をすべて削除し、通常 markdown render に統一
- `manual/07-ui-reference.md` / `08-test-cases.md` / `09-user-acceptance-test.md` 物理削除
- `manual/index.md` / `manual/full-documentation.md`: 削除ファイル参照を除去 (リンク切れ防止)
- code-review 3-angle 並列レビュー: 全 angle CONFIRMED 候補ゼロ
- `manual/full-documentation.md` 内に残存する `## 07. テストとデバッグ` 章は内部 numbering で削除 manual/07 とは衝突なし

### PR #117 (ヘッダー email 削減)

- `components/AuthButton.tsx:69` の `<span>{displayLabel}</span>` (sm 以上で email 全文表示) を削除
- 代わりに button に `aria-label={\`アカウントメニュー (${displayLabel})\`}` + `title={displayLabel}` を追加 → accessibility (screen reader) + hover tooltip で email アクセスを保持
- button のレイアウト: `gap-2 px-2` → `px-1` で詰めて視覚ノイズ削減
- ドロップダウンメニュー内 email 表示 (line 73-75) は不変、アカウント切替時の確認用として保持
- Mobile (sm 未満) は元から `hidden sm:inline` で email 非表示だったため UX 不変

### PR #118 (ナレッジ初期空化)

- `App.tsx` の旧 l.142-167 `useEffect`: 新規プロジェクト初回オープン時に `helpTexts` を元に「ヘルプ: テキスト解析」等のナレッジカードを `existingKnowledge.length === 0` ガード下で自動投入していた処理を全削除
- `App.tsx:13` の `import { helpTexts } from './helpTexts'` も削除 (App.tsx 内では本 useEffect でしか使用していなかった)
- `helpTexts` 本体は `components/Tooltip.tsx` で UI tooltip 用に使われているため温存
- **既存プロジェクトへの影響ゼロ**: 旧 useEffect は `existingKnowledge.length > 0` で skip していたため、ヘルプを持つ既存プロジェクトには元々再投入していなかった → migration 不要・破壊なし
- ユーザーが既存プロジェクトでヘルプを消したい場合は従来通り手動で削除可能

### PR #119 (pro tooltip → standard フォールバック)

- `components/Tooltip.tsx:22`: `helpTexts[helpId]?.[userMode]` → `helpTexts[helpId]?.[userMode === 'pro' ? 'standard' : userMode]` (1 行 + コメント追加)
- 例: 「相関図を表示」tooltip
  - 旧 (pro): "Relation Chart" / "Ctrl+Shift+C" / dev フィールドなし
  - 新 (pro): "相関図を表示" / ⌘+Shift+C / "人物の関係を可視化。" (standard と完全一致)
- `helpTexts.ts` の pro エントリ自体は **温存 (可逆)**。将来 pro 固有の小説家向け表記が必要になった場合、本フォールバック行を外せば復活する
- pro データ一括削除は型定義変更が広範囲に及ぶため見送り、最小変更原則に従い 1 行修正を採用

### PR #120 (人名抽出強化、唯一の機能変更)

**原因切り分け**:
- FE は `ImportTextModal.tsx:299-322` で正しく `characters.new` を render している
- スクショの worldTerms (「絵本/学校/竹馬/空や星」) から子供視点の物語と推察、「お母さん」「先生」「あの子」等の呼称中心テキストである可能性
- 旧 systemInstruction は「キャラクター分析」とのみ指示し、呼称・代名詞・役割語を `characters.new` に積極詰める指示が不在 → AI 側責務不足

**修正**:
- `server/services/analysisService.ts` systemInstruction に「**■ 人物候補の積極抽出（最重要）**」セクションを追加
  - 抽出対象を 4 カテゴリに整理: 固有名詞 / 親族・関係呼称 / 役割・職業呼称 / 物語内で識別可能な代名詞・指示語
  - 判断基準: 「同じ呼称が複数回登場し一貫した個人を指す」+「迷ったら抽出側に倒す」
  - `characters.new` と `extractedDetails.name` の一文字一句一致を明示
  - few-shot guidance: 「お母さん」「先生」「主人公」「あの子」「太郎」「アイリス」「サクラ先輩」を例示
  - `dialogueSamples` は本文に該当セリフがない場合は推測生成可と緩和 (呼称キャラは台詞欠落しやすいため)
- `server/services/analysisService.test.ts` 新規 contract test:
  - systemInstruction 文字列に必要 13 キーワード (積極姿勢 4 / カテゴリ 3 / 同期 2 / few-shot 4) が含まれることを vitest で pin
  - 既存 world 解析指示 / 4 フィールド責務 (summary / detailDescription / memo / dialogueSamples) が改修で破壊されていないことも併せて pin
  - Gemini 実応答は flaky のため unit test しない方針 (contract test pattern)
- **スコープ外 (すべて不変)**: ImportTextModal.tsx, types.ts (AnalysisResult schema), usageConfig.ts (200 sen 不変), 認証ミドルウェア, FE-BE API 契約

## レビュー方式

| PR 規模 | 方式 |
|---|---|
| #116 (6 files, +5/-429) | code-review 3-angle 並列 (CONFIRMED ゼロ) |
| #117-#120 (1-2 files, +3〜+73) | post-pr-review hook 提供チェックリスト手動確認 (small tier) |

`feedback_simplify_vs_review.md` の規律に従い「1-2 ファイル / 30 行未満は /code-review skip 相当」を踏襲。#116 は削除が大量だが実質ロジック変更は HelpModals.tsx 1 ファイルなので 3-angle で十分。

## 起票 Issue (0 件)

本セッションで起票した Issue はゼロ。全 5 件はユーザー直接指示 (CLAUDE.md GitHub Issues §「ユーザーから複数タスクを明示指示された場合のみ個別 Issue 化」基準には該当しない、各要求は独立した小 PR で完結したため Issue 化不要)。

## 残課題 (本セッション外、前セッションから継続)

1. **#113 着手判断**: Phase 1 (Playwright MCP で 36 component の 3 breakpoint screenshot 収集) から開始可能。spec 大規模のためユーザーが「P1 で全体監査」か「個別優先で都度 issue 切る」かを判断
2. **モバイル実機確認 (継続)**: PR #100 / #110-#112 / #114 / #117 / #119 / #120 を iPhone 実機で 1 サイクル
3. **法務確認 (継続)**: 顧問弁護士確認 → md 文言確定 + LEGAL_REVIEW_REQUIRED 一斉削除 PR (M7-β)
4. **#49 [M4 follow-up]**: monitor 継続 (変化なし)
5. **Firebase Auth `popup.closed` polling の COOP console error** — SDK 仕様 (継続)
6. **タッチ操作 / 仮想キーボード挙動** (モバイル実機) — 継続

## 次セッション開始時の状態

- ブランチ: `main` clean (`5493647` = PR #120 マージ後)
- Open Issue: 2 件 (変化なし、本セッション増減ゼロ)
  - #113 [meta][P1] レスポンシブ全体網羅監査 (前セッション起票)
  - #49 [M4 follow-up] PR #48 持越 5 件 (monitor)
- 自動テスト: vitest **497 / 497 PASS** (前 482 → +15: analysisService.test.ts contract pin 15 件)
- 型チェック: `tsc --noEmit` 0 errors
- CI/CD: PR #120 main マージ後の Cloud Run デプロイ `in_progress` (1m13s 経過時点)。次セッション開始時に `gh run list --limit 1` で完了確認

## 次のアクション (推奨順)

1. **本番実機確認 (ユーザー本人)**: https://novel-writer-ramnh3ulya-an.a.run.app/ で 5 PR の動作を 1 サイクル目視
   - **PR #116**: 取扱説明書モーダル → 左サイドバーが「はじめに〜6. AIの性格設定」7 項目で完結
   - **PR #117**: ヘッダー右上が「シンプルモードへ + アバター + サイドバー切替」だけになり、アバター hover で email tooltip 表示
   - **PR #118**: 新規プロジェクト作成 → ナレッジベースが空、既存プロジェクトのヘルプは消えていない
   - **PR #119**: ユーザーモード設定 → プロモード選択 → 任意機能 tooltip が日本語表記
   - **PR #120**: 呼称中心の短編 (「お母さん」「先生」等) をテキストインポート → AI 解析 → 反映プレビューの「登場人物候補」セクションに呼称が表示される
2. **#113 着手判断**: ユーザーと「全体監査 spec を実行するか」「個別観察ベースで都度 issue 化するか」を協議
3. **#120 regression watch**: 固有名詞ありの旧来テキストでも regression なく抽出されているか (本番モニタリング)

## 主要参照

- 関連 PR: **#116** (`513bb82`), **#117** (`e939a87`), **#118** (`ce16d2d`), **#119** (`5579a0b`), **#120** (`5493647`)
- 関連 Issue: なし (本セッション 5 件はすべてユーザー直接指示、Issue 化要件未満)
- 主要修正ファイル:
  - `components/HelpModals.tsx` (sections 7-9 削除 + render 統一)
  - `components/AuthButton.tsx` (header email span 削除 + aria-label 補完)
  - `App.tsx` (ヘルプ自動投入 useEffect 削除)
  - `components/Tooltip.tsx` (pro→standard フォールバック 1 行)
  - `server/services/analysisService.ts` + `analysisService.test.ts` 新規 (呼称・代名詞抽出 prompt + contract test)
  - `manual/07-ui-reference.md` / `08-test-cases.md` / `09-user-acceptance-test.md` 削除
  - `manual/index.md` / `manual/full-documentation.md` (リンク参照除去)

## 知見メモ (本セッションで得た教訓)

### A. 「ユーザー直接指示の連続要求」は impl-plan よりも「小 PR 連続化」が ROI 高い

5 要求のうち 4 件 (B, C, D, manual 削除) は 1 ファイル / 数行レベルの修正で、各々を独立した PR にした方が:
- レビュー単位が小さく blast radius が局所化
- ユーザー番号単位明示認可も「PR # — タイトル (N files, +X/-Y)」要約で判断容易
- main 同期も Fast-forward で衝突なし
- 1 件にバンドルすると revert 単位が荒くなる

ただし機能追加 (要求 A: AI prompt 強化) は 1 ファイル変更でも contract test 同時追加で「regression 防止の砦」を建てる規律は維持 (PR #120 で 15 件追加)。**小規模変更でも「テストで責務を pin する」 + 「Issue 化要件はユーザー指示の triage 基準で判断」 の 2 軸を分けて判定する**

### B. 「画面で見えている問題」の根本原因は必ずしも見えている層にない

要求 A の「登場人物候補が空欄」は一見 FE バグに見えたが、調査の結果 **FE は正しく render している、AI が `characters.new` に詰めていない** という BE/prompt 層の問題だった。`/trace-dataflow` 相当の経路追跡を頭の中で実行 (`ImportTextModal.tsx:299` → `currentAnalysisResult.characters.new` → `analysisApi.ts` → `analysisService.ts` の AI 応答) して原因切り分けしてから着手する規律は今後も維持

スクショ起点の修正依頼では「**見えている層の前 2-3 layer 上流まで読んでから方針提示**」を impl-plan 段階で実行する

### C. helpTexts のような「3 モード対応 data」は data 重複ではなくフォールバックロジックで統一する方が可逆

要求 D で `helpTexts.ts` の pro エントリ全件を standard で上書きする選択肢もあったが、`Tooltip.tsx` の 1 行修正 (`userMode === 'pro' ? 'standard' : userMode`) で同等の UX 効果を実現。data 重複させず、将来 pro 固有表記が必要になったらフォールバック行を外すだけで復活できる。**最小変更原則 + 可逆性の両立** が選べる場合は迷わずロジック側で吸収する

### D. 「初期投入データの削除」は既存ユーザーへの影響をガード文で事前に切り分けてから提案する

要求 C で `App.tsx` の自動投入 useEffect 削除を提案する前に、旧コードに `if (existingKnowledge.length > 0) return;` のガードがあることを確認 → **既存プロジェクトには元々再投入しない設計** だったと特定 → migration 不要・破壊なしを PR description に明記。「破壊性ゼロ」が言える削除は AskUserQuestion で「破壊あり版」と分けて選択肢提示すると認可判断が早い

## Issue Net 変化

- Open Issue 開始時: 2 件 (#113, #49)
- Open Issue 終了時: 2 件 (#113, #49)
- Close 数: 0 件
- 起票数: 0 件
- Net: **0 件** (2 → 2)
- 備考: 本セッション 5 要求はすべてユーザー直接指示で、各々が独立した小 PR で完結したため Issue 化不要 (CLAUDE.md GitHub Issues §「ユーザーから複数タスクを明示指示された場合のみ個別 Issue 化」基準には該当せず、「個別 5 PR で連続マージ」が triage より軽量で適切と判断)。Net 0 だが、5 PR マージ済 + 全要求対応済の実質進捗あり。**rating 5-6 の review agent 提案を機械起票していない** ことも再確認済
