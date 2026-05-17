# Handoff: モバイル feature parity + 見出しバグ修正 + ショートカット課題発見

- Session Date: 2026-05-17
- Owner: yasushi-honda
- Status: ✅ 再開可能（main clean、CI green、Issue #101/#102 が次セッション着手候補）
- Previous handoff: [2026-05-09-login-fix-responsive.md](./2026-05-09-login-fix-responsive.md)

## 今セッションのトリガー

1. ユーザーから「モバイルだとデスクトップと比較してボタンの数が少ない。モバイルのデザイン性を維持、最適化した状態で対応を考えてほしい」依頼（画像 3 枚で現状提示）
2. 同時並行で発見した「H ボタン押下時に右側に余分な `#` が残る」を Issue 化 → 修正
3. PR #100 検証中にショートカットツールチップ重複 (⌘+Shift+C 文字色 vs 相関図) を発見 → Issue 化
4. ユーザー追加指摘「マークダウン記法挿入時の `**テキスト**` placeholder 挙動が不自然」 → Issue 化

## 完了 PR (合計 2 件、本セッションすべて main 反映済)

| PR | 内容 | merge commit | Closes |
|---|---|---|---|
| #99 | fix(editor): heading "#" button no longer wraps selection with trailing "# " | `63f8a50` | #98 |
| #100 | feat(mobile): モバイル版欠落機能 (ログイン / モード切替 / 暗号化エクスポート) を統合 | `4712f61` | — |

## PR #99 要点 (Issue #98)

**症状**: 本文編集中に「H」ボタン or `Ctrl/⌘+H` で見出しマークアップ → `# 選択テキスト# ` のように両端に `# ` が挿入 → レンダリング後「テキスト#」と右端 `#` が残る

**根本原因**: `applyMarkdown(prefix, suffix = prefix, ...)` のデフォルト `suffix = prefix`。`**bold**` / `__underline__` / `{ruby|...}` のような両端挟み型には正しいが、Markdown 見出しは行頭プレフィクスのみのため不適合

**修正**: `components/EditableParagraph.tsx:177` / `:237` で `applyMarkdown('# ', '')` と suffix を明示空に。2 行修正

## PR #100 要点 (モバイル feature parity)

### 統合した 3 機能

| 機能 | 配置先 | 旧状態 |
|---|---|---|
| ログイン / ログアウト | LeftPanel「設定・ツール」直下に CTA バナー (新規 `MobileAuthSection.tsx`) | ❌ モバイルから到達不可（AI 機能必須なのに致命的） |
| 標準⇄シンプルモード切替 | Header BentoMenu「プロジェクト一覧へ」直下 | ❌ 切替手段なし |
| 全データ (.json, 暗号化) | Header BentoMenu「書き出し」最上部 | ❌ M6 PR-D の正規バックアップ経路にモバイルから到達不可 |

### 設計判断

- **ヘッダー 4 アイコン構成** (左パネル / タイトル / Bento / Bot) を完全維持してデザイン性を保持
- **AuthButton 共通化はしない**: AuthButton はデスクトップヘッダー右上の小型アバター + ドロップダウン前提でレイアウト責務が異なる。store API (`authStatus`/`currentUser`/`signInWithGoogle`/`signOut`) のみ共有
- **`selectMobileAuthVariant` を独立ファイル化** (`components/mobileAuthVariant.ts`): CI 環境で `VITE_FIREBASE_*` 不在のため、component から export すると transitive import で firebaseClient まで到達して test が壊れる教訓（CI 1 回 fail → 修正）

### 品質ゲート (全 PR 通過)

| ゲート | 結果 |
|--------|------|
| lint (tsc --noEmit) + test 27 files / 445 tests | ✅ PASS |
| `env -u VITE_FIREBASE_*` で CI 環境模倣 | ✅ PASS |
| `/simplify` 3 並列 (reuse / quality / efficiency) | ✅ 2 件修正 |
| `/safe-refactor` (型 import drift 防止) | ✅ 1 件修正 |
| `/review-pr` 6 並列 (code/test/error/type/comment + 略 simplify) | ✅ Critical 0 / Important 0、low-cost 4 件適用 |
| Playwright 実機検証 mobile 375px + desktop 1440px | ✅ AC-1〜AC-5 全達成 |

## 起票 Issue (2 件、本セッションで発見、次セッション着手候補)

### #101 [P1, bug + enhancement] ショートカット ⌘+Shift+C 重複 + 全網羅調査と直感的再割当

PR #100 検証中、ツールチップで `⌘+Shift+C` が「文字色を適用」(EditableParagraph 編集中) と「相関図を表示」(global useKeybindings) の両方に割当てられていることが目視で判明。Issue 本文に全ショートカット網羅表 (グローバル 22 件 + EditableParagraph 7 件 + モーダル共通) と直感的再割当案 4 件、SSOT 化提案を記載

### #102 [P2, bug + enhancement] マークダウン記法 B/U/H/R: `****` 挿入 + カーソル中央配置 + 全選択時 placeholder 混入バグ修正

ユーザー指摘:
1. 選択なし時 `**テキスト**` placeholder 挿入は不自然 → `****` だけ挿入 + カーソルを prefix と suffix の間に
2. 全選択してショートカットを押しても `**テキスト**` になることがある（selectionRef race 仮説、要 Playwright 再現）

`#101` と `#102` は両方 `components/EditableParagraph.tsx` の `applyMarkdown` を touch するため、修正順序の依存あり (#102 で signature 変更 → #101 で C 撤去 が自然)

## 残課題 (本セッション外)

1. **法務確認 (継続)**: 顧問弁護士確認 → md 文言確定 + LEGAL_REVIEW_REQUIRED + `<!-- TODO -->` 一斉削除 PR (M7-β)
2. **モバイル実機確認**: 本 PR #100 のログイン CTA / モード切替 / 暗号化エクスポートを iPhone 実機で 1 サイクル確認
3. **#101 / #102 着手**: 次セッションで `/impl-plan` から (規模見込み: 中規模、複数ファイル変更、Evaluator 分離プロトコル候補)
4. **Firebase Auth `popup.closed` polling の COOP console error** — 機能影響なし、SDK 仕様 (前セッションからの継続)
5. **タッチ操作 / 仮想キーボード挙動** (モバイル実機) — 前セッションからの継続

## 次セッション開始時の状態

- ブランチ: `main` clean (`4712f61` = PR #100 マージ後)
- Open Issue: 3 件
  - #49 [M4 follow-up] PR #48 持越 5 件（monitor、変化なし）
  - **#101 [P1] ショートカット ⌘+Shift+C 重複**（本セッション起票）
  - **#102 [P2] マークダウン placeholder 改善**（本セッション起票）
- 自動テスト: vitest **445 / 445 PASS** (前 434 → +11: MobileAuthSection.test.ts 4 + Header.bentomenu.test.ts 5 + LeftPanel.mount.test.ts 2)
- 型チェック: `tsc --noEmit` 0 errors
- CI/CD: PR #100 反映の Cloud Run デプロイ完了 (run 25978923192, 3m00s)

## 次のアクション (推奨順)

1. **Issue #102 着手** (P2 だが #101 の前提): `applyMarkdown` signature 変更 + race condition 検証 → 中規模 PR 見込み
2. **Issue #101 着手** (P1、UX 直接影響): #102 で `applyMarkdown` を整理した後、ショートカット再割当 + SSOT 化 → 5+ ファイル変更、Evaluator 分離プロトコル発動候補
3. **モバイル実機確認** (ユーザー判断): iPhone / iPad / 13-inch laptop でログイン → モード切替 → 暗号化エクスポート 1 サイクル
4. **法務確認 (AI 外、MUST、保留継続)**: M7-β リリース判断の前提

## 主要参照

- 関連 PR: **#99, #100** (本セッション)
- 関連 Issue: **#98 (Closed)**, **#101 / #102 (Open)**
- 主要修正ファイル:
  - `components/EditableParagraph.tsx` (H ボタン suffix 修正)
  - `components/MobileAuthSection.tsx` / `components/mobileAuthVariant.ts` (新規)
  - `components/LeftPanel.tsx` / `components/Header.tsx` (モバイル統合)
  - `components/MobileAuthSection.test.ts` / `components/Header.bentomenu.test.ts` / `components/LeftPanel.mount.test.ts` (新規 test)
- CLAUDE.md 更新: 「モバイル feature parity (PR #100)」項追加

## 知見メモ (本セッションで得た教訓)

### A. pure helper の独立ファイル化が CI 互換のため必須

React component から `useStore` 経由で transitive に env-dependent module (firebaseClient) を引っ張るリポジトリでは、**component から pure helper を export して test で import するパターンは CI で壊れる**。
ローカルでは `.env.local` が読まれて PASS、CI では throw → 1 ファイル丸ごと import 失敗。
**対策**: pure helper は最初から store / firebase 依存ゼロの独立ファイルに置く。test 追加時に `env -u VITE_FIREBASE_*` で CI 模倣 verify を回す習慣

### B. モバイル feature parity は「ヘッダー混雑回避」と「CTA 視認性」のトレードオフ

アバターをヘッダーに追加する案もあったが、ヘッダー 4 アイコンが既に密集していたため、LeftPanel に集約する判断。結果として「未ログイン時に LeftPanel を開いた瞬間に最も目立つ CTA」が成立し、AI 機能誘導が自然になった。
**規律**: モバイル UI の機能追加は「既存アイコン数を増やさない」を制約として、別 surface (LeftPanel / BentoMenu) への配置を優先

### C. `applyMarkdown` の placeholder 挙動は UX 課題が複数潜む

H ボタンの両端 # 挿入 (Issue #98 で修正) を発見した流れで、placeholder `テキスト` が本文に残留するリスク (Issue #102)、ショートカット重複 (Issue #101) が芋づる式に判明。**1 つの UX 問題を見つけたら同関数の他の経路も全部見直す**規律を次セッション以降の `/impl-plan` 前段に組み込む

## Issue Net 変化

- Close 数: 1 件 (#98)
- 起票数: 2 件 (#101, #102)
- Net: **-1 件**
- 備考: Net マイナスだが、**両起票ともユーザー明示指示** (CLAUDE.md triage 基準 #5 該当)。#101 は PR #100 検証中の重複発見、#102 はユーザーが PR マージ承認の流れで追加指摘した UX 課題。`/review-pr` agent の rating 5-6 提案を機械的に Issue 化したものは含まれていない (低 rating 提案はすべて「不採用」として PR 内で言語化済み)。**過剰起票ではなく、ユーザー駆動の新規課題発見**として記録
