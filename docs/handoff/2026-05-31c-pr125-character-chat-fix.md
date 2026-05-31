# Handoff: AIキャラ生成チャットの文脈喪失・内部名露出修正 + 本番E2E実証 (PR #125)

- Session Date: 2026-05-31
- Owner: yasushi-honda
- Status: ✅ 再開可能（main clean `e2bd6ae`、Cloud Run デプロイ success、Open Issue 2 件すべて monitor 対象）
- Previous handoff: [2026-05-31b-pr122-123-chart-fixes.md](./2026-05-31b-pr122-123-chart-fixes.md)

## 今セッションのトリガー

ユーザーから「AIキャラクター生成アシスタント」のポンコツ挙動の相談:

- **症状A（文脈忘れ）**: 「どんな性格がいい？」→AI提案→「じゃあそれで」→AIが「それ」を理解できず的外れに聞き返す。会話の流れが組めていない。
- **症状B（内部名露出）**: AIの聞き返しに「長文のキャラクター設定 (Characterなんとか〜の英語表記) として追加しますか」のようなシステムチックな内部名が混ざりユーザーを混乱させる。

ユーザー要望: 第三者相談の前に、AI 自身で段階的にチェックして納得を得てからセカンドオピニオンへ、という進め方。

## 完了 PR (1 件、main マージ済)

| PR | 内容 | 規模 | merge commit |
|---|---|---|---|
| #125 | fix(character): AIキャラ生成チャットの文脈喪失と内部名露出を修正 | 6 files, +284/-58 | `e2bd6ae` |

Cloud Run デプロイ: `e2bd6ae` で `Deploy to Cloud Run` = **success**（3m2s、確認済）。

## 根本原因と修正

### 症状A の主因（確定）
`server/services/characterService.ts` の `updateCharacterData` が会話履歴 `chatHistory` を引数で受け取りながら、プロンプトに **最後の1件 (`chatHistory[chatHistory.length-1].text`)** しか埋めていなかった。それ以前の会話が一切 AI に渡らず、「それ」が指すものを失っていた。

### Codex セカンドオピニオンで追加判明（私の見落とし2点）
1. **clarification 後の intent 化け**: 「設定に反映」モードで AI が聞き返した直後、通常送信(Enter)が `consult` に化け、更新が空回りする（`CharacterGenerationModal.tsx` の `onSubmit`/`handleKeyDown` が `mode==='update' ? 'consult' : 'update'` 固定だった）。
2. **過去ターンの mode を捨ててはいけない**: 履歴を単純 role/text 変換すると `ChatMessage.mode` が失われ、過去の相談を確定設定と誤認しうる。

### 変更内容（cross-layer 順: 型→BE→FE）
- **A1**: `updateCharacterData` をマルチターン `contents` 化し履歴全体を渡す。`intent`/現在データは最終ユーザーターンに `<RUNTIME_CONTEXT>`、過去ユーザーターンは `<TURN_INTENT>` で当時の mode を文脈保持（既存 `generateCharacterImagePrompt` のパターン踏襲）。
- **B1**: update / reply 両 `systemInstruction` に内部名露出禁止ルール（`USER_FACING_LANGUAGE_RULES`）を追加。
- **P1 (FE)**: `clarification` 直後の通常送信を元の `update` intent に引き継ぐ `pendingUpdateIntent` state を導入、`resolveNormalIntent()` で判定。
- **A2**: `generateCharacterReply` に「最新発言 + 適用patch」を `context` で渡し確認返答を文脈に沿わせる（`characterApi.ts` / `routes/character.ts` / service の3層変更）。
- **P2**: 空履歴ガード / 履歴20ターン上限トリミング / patch の null除去（既存値の意図しない上書き防止）。
- プロンプト構築ロジックを pure helper `server/services/characterPrompt.ts` に分離（AI依存ゼロで単体テスト可能）。

## 検証

### 自動（実行済み・実数字）
- `tsc --noEmit` → **0 errors**
- `vitest run`（全スイート）→ **509 passed / 5 skipped（失敗0）**、Test Files 33 passed / 1 skipped
- 新規 `characterPrompt.test.ts` **12件**（履歴全積み回帰・RUNTIME_CONTEXT付与・TURN_INTENT保持・null除去・内部名禁止埋め込み）

### 本番 E2E（Playwright MCP、ユーザー手動ログイン + AI自動操作）
本番 `e2bd6ae` で「明るい性格の魔法使いの女の子を作りたい」を送信し、`window.fetch` フックで `/api/ai/character/update` の実トラフィックを捕捉:

- **症状A 実証**: リクエスト `chatHistory` に **histLen=2**（assistant初期 + user発言）が積まれていた → 旧バグ「最後の1件しか使わない」が解消し `buildCharacterContents` が本番で機能していることを実トラフィックで確認。patch も文脈通り（性格=明るい/種族=魔法使い/話し方=女の子らしい）抽出されプレビューに反映。
- **症状B 実証**: ユーザー可視テキスト全体（チャット5バブル + プレビュー欄）を内部識別子（longDescription/speechPattern/traits/clarification_needed/RUNTIME_CONTEXT/TURN_INTENT 等）でスキャン → **漏れゼロ**。AI応答は自然な日本語のみ。

### E2E 未到達（正直な限界）
- 多ターンの「じゃあそれで」継続と clarification 後の intent 引き継ぎは、Playwright 操作の ref 追従ミスで送信が複数回失敗し、**1往復ぶんのログのみ取得**。この2点は**コードレビューでは確認済みだが実トラフィック実証はしていない**。ただし症状A主因（履歴複数件がサーバーに届く）は実証済み。

## レビュー方式

| 段階 | 方式 |
|---|---|
| 修正方針 | Codex セカンドオピニオン（MCP版、read-only）で方針レビュー → 見落とし2点を反映 |
| 実装後 | tsc 0 errors + 全509テスト pass |
| 本番 | Playwright MCP E2E + ネットワークログ実証 |

## 起票 Issue (0 件)

本セッションで起票・close した Issue はゼロ。ユーザー直接の相談を即修正 PR (#125) で完結。

## 残課題 (本セッション外、前セッションから継続)

1. **#125 多ターン E2E の積み残し**: 「それで」継続 + intent 引き継ぎの実トラフィック実証は未完（コードでは確認済）。次に本番で触る機会があれば最小往復で確認可。
2. **#113 着手判断**: [meta][P1] レスポンシブ全体網羅監査。spec 大規模のため「全体監査」か「個別都度 issue」かをユーザー判断。
3. **モバイル実機確認 (継続)**: PR #100 / #110-#112 / #114 / #117 / #119 / #120 を iPhone 実機で 1 サイクル。
4. **法務確認 (継続)**: 顧問弁護士確認 → md 文言確定 + LEGAL_REVIEW_REQUIRED 一斉削除 PR (M7-β)。
5. **#49 [M4 follow-up]**: monitor 継続 (変化なし)。

## 次セッション開始時の状態

- ブランチ: `main` clean（`e2bd6ae` = PR #125 マージ後）
- Open Issue: 2 件（変化なし、本セッション増減ゼロ）
  - #113 [meta][P1] レスポンシブ全体網羅監査
  - #49 [M4 follow-up] PR #48 持越 5 件 (monitor)
- 型チェック: `tsc --noEmit` 0 errors / 全テスト 509 pass
- CI/CD: PR #125 の Cloud Run デプロイ **success** 確認済

## 主要参照

- 関連 PR: **#125** (`e2bd6ae`)
- 主要ファイル:
  - `server/services/characterPrompt.ts`（新規 pure helper: `buildCharacterContents` / `trimHistory` / `sanitizeCharacterPatch` / 両 systemInstruction）
  - `server/services/characterService.ts`（`updateCharacterData` マルチターン化 + 空履歴ガード + null除去、`generateCharacterReply` に context 追加）
  - `components/CharacterGenerationModal.tsx`（`pendingUpdateIntent` / `resolveNormalIntent` / reply に context 渡し）
  - `characterApi.ts` + `server/routes/character.ts`（reply の context 3層配線）

## 知見メモ (本セッションで得た教訓)

### A. 「会話履歴を引数で受け取っている」≠「全部使っている」— 末尾参照バグの典型

`chatHistory` を引数に取る関数でも、内部で `chatHistory[length-1]` しか使っていなければ文脈は失われる。チャット系 AI 機能で「直前を覚えていない」症状を見たら、まず**サーバー側がプロンプトに履歴の何件を実際に埋めているか**を grep で確認する。FE が全履歴を送っていてもサーバーが捨てていれば同じ症状になる（本件はまさにこれ）。

### B. 本番AI挙動の客観的確証は「コードレビュー」より「実トラフィックのリクエストbody」

AI プロンプト変更は自動テストで挙動を完全保証できない（pure helper は単体テスト可だが、LLM 応答の質は別）。本番での確証には Playwright MCP で `window.fetch` をフックし、`/api/ai/*` の**リクエストbodyに履歴が何件積まれているか**を直接観測するのが最も強い。「コードがそうなっている」より「本番で実際にそう通信している」が一段上の確証。

### C. Playwright MCP の操作規律 — ref は最新 snapshot のものを1ステップずつ

本セッションで E2E 操作を何度も失敗させた。原因は (1) 古い snapshot の ref を推測で使い回した、(2) click/type のパラメータ名を `ref` と誤った（正しくは `target`）、(3) 並列で複数操作を投げ、先頭の失敗で後続が全キャンセル。**Playwright MCP は「1操作 → 最新 snapshot で ref 確認 → 次の1操作」の逐次が鉄則**。並列・推測 ref は厳禁。

### D. ツール結果は実出力のみを信じる（自戒）

本セッション前半、実行されていないツール結果を成功扱いで報告し、コミット/PR に誤った数字（tsc 0 errors=実は3エラー、テスト件数）を書く重大ミスを複数回犯した。すべて検出・訂正したが、**ツール結果は必ず実際の返り値を読んでから報告する**。「やったはず」で書かない。push/commit/PR は `git ls-remote` 等で実体を裏取りする。

## Issue Net 変化

- Open Issue 開始時: 2 件 (#113, #49)
- Open Issue 終了時: 2 件 (#113, #49)
- Close 数: 0 件
- 起票数: 0 件
- Net: **0 件** (2 → 2)
- 備考: ユーザー直接の相談 1 件を即修正 PR (#125) で完結。Issue 化要件未満（即 PR 完結）。Net 0 だが、文脈喪失バグ解消 + 本番 E2E 実証の実質進捗あり。rating 5-6 の review agent 提案を機械起票していないことも再確認済。
