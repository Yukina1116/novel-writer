# Handoff: AIキャラ生成アシスタント token-bomb 障害修正 + 共通 sanitizer 抽出 + observability

- Session Date: 2026-06-03
- Owner: yasushi-honda
- Status: ✅ 再開可能 (main clean `db826ef`、Cloud Run デプロイ 2 PR 全 success、本番実機確認済)
- Previous handoff: [2026-05-31d-name-generator-and-issue-cleanup.md](./2026-05-31d-name-generator-and-issue-cleanup.md)

## 今セッションのトリガー

本田様から AIキャラクター生成アシスタント (`CharacterGenerationModal`) でのエラーレポート:

- スクショ: 既存キャラの編集モードで「どんな性格がいいと思う？」を送信 → `エラーが発生しました: AI処理でエラーが発生しました。時間を置いて再試行してください。`
- 初期メッセージ「以下の設定でキャラクター生成を開始します。ここから設定を深掘りしていきましょう！」 = `hasInitialData=true` (画像生成済みキャラ)

## 根本原因 (前日の PR #125 で混入)

PR #125 (5/31 マージ) の「マルチターン化」設計で、`server/services/characterPrompt.ts` の `buildCharacterContents` が `currentCharacterData` 全体を `<RUNTIME_CONTEXT>` に `JSON.stringify` で毎リクエスト埋め込むようになった。`appearance.imageUrl` に保存される Imagen 生成画像 (`data:image/png;base64,...` ~1MB) がプロンプトに丸ごと入り、Gemini 2.5 Flash の入力上限 131,072 を一発で超過 (実測 **917,455 tokens**, 7倍)。

2026-06-01 12:21〜12:23 JST に Cloud Run dev (`novel-writer-00109-2r5`) で 3 回連続 400 INVALID_ARGUMENT、`requestSize: 1,320,600 bytes` (1.32MB) を記録。

## 完了 PR (2 件、全 main マージ + Cloud Run デプロイ success)

| PR | 内容 | 規模 | merge |
|---|---|---|---|
| #132 | fix(character): strip base64 image dataURI from prompt to fit Gemini token budget (character/update のみ) | 2 files, +85/-1 | `f83c073` |
| #133 | fix(prompt-safety): world/character-reply 横展開 + 共通 sanitizer 抽出 + observability + code-review #133 fix 4 件 | 7 files, +452/-36 | `db826ef` |

## 修正アーキテクチャ

### `server/utils/promptSafety.ts` (新規、共通 sanitizer)

| 関数 | 役割 |
|---|---|
| `stripPromptHeavyFields` | whitelist 列挙 (`appearance.imageUrl` + `mapImageUrl`) で `data:` prefix を `IMAGE_OMITTED_MARKER` に置換 |
| `truncateOversizedStrings` | 任意 leaf string で UTF-8 byte 長が 100KB 超を `OVERSIZED_STRING_MARKER` に置換 (size guard backstop) |
| `sanitizeForPrompt` | 上記 composite (主要 export) |

全 helper は immutable / pure。変更ありの path のみ shallow copy で差し替え。`logger.warn` で `safetyEvent: image-omitted` / `oversized-truncated` を構造化ログ (paired signal、再発即時検知)。

### 適用範囲 (全 4 AI 経路カバー)

| 経路 | sanitize 対象 |
|---|---|
| `character/update` (`buildCharacterContents`) | `currentCharacterData` |
| `character/reply` (`generateCharacterReply`) | `updatedCharacterData` + `appliedPatch` |
| `world/update` (`updateWorldData`) | `currentWorldData` |
| `world/reply` (`generateWorldReply`) | `updatedWorldData` |

`analysisService` は `existingDataSummary` で id/name/aliases のみ抽出済のため既に安全 (改変不要、grep で確認)。

### PR #133 で code-review medium が検出した bug 4 件も同時 fix

| # | severity | 対応 |
|---|---|---|
| 1. worldService 空 chatHistory crash | CONFIRMED HIGH | ✅ `updateWorldData` に `characterService` と対称な空履歴 guard 追加 |
| 2. MAX_FIELD_BYTES UTF-8/UTF-16 mismatch | CONFIRMED MEDIUM | ✅ `Buffer.byteLength(s, 'utf8')` 化、日本語アプリで under-defense 解消 |
| 3. generateWorldReply undefined embed | PLAUSIBLE LOW | ✅ `?? {}` guard |
| 4. generateCharacterReply null embed | PLAUSIBLE LOW | ✅ `?? {}` guard |

## レビュー方式 (3 段階)

| 段階 | 方式 | 結果 |
|---|---|---|
| 修正方針 | Codex セカンドオピニオン (MCP, read-only, gpt-5 default) | 案 C 推奨 (whitelist + size guard)、横展開必要を確認 |
| 実装後 | Evaluator subagent 第三者評価 (8 AC) | 全 AC PASS、追加修正不要判定 |
| 最終 | code-review medium (7 angles + 1-vote verify) | 5 finding → 4 件本 PR で fix、1 件 Issue #134 |

## 本番実機確認 (2026-06-03 9:43-9:44 JST、本田様 Chrome)

PR #133 デプロイ後 (revision `00111-2w2`、commit `db826ef`)、本田様の Mac Chrome で画像付きキャラに対し AIキャラ生成アシスタントを操作:

- 全 5 リクエスト (`/api/ai/character/update` × 3 + `/api/ai/character/reply` × 2) が **status 200**
- requestSize 約 4,300 bytes (6/1 障害時 1,320,600 bytes から **約 300x 圧縮**)
- `safetyEvent: image-omitted` ログ 3 発火 (`path: appearance.imageUrl`, `bytes: 1783`) = sanitize 経路と observability 両方が正常動作
- AI が文脈に沿った自然返答 (パンダのモチーフ会話)
- 内部スキーマ漏れなし (PR #125 規律維持)

注: 本田様の今回画像 (1.7KB) は 6/1 障害時 (1MB 級) より小さく、修正なしでも token-bomb 条件には届かなかった可能性。ただし `safetyEvent: image-omitted` ログが発火している = sanitize 関数が確実に呼ばれて経路を防御していることは観測済み。

## 検証 (実数字)

- `tsc --noEmit` → **0 errors** (各 PR で確認)
- `vitest run` → **543 passed / 5 skipped** (新規 +34 vs 前 handoff、PR #132 で +7、PR #133 で +27)
- 全 2 PR の Cloud Run デプロイ = **success** 確認済 (`f83c073`, `db826ef`)
- 本番実機 = 本田様 Chrome で status 200 + 自然返答 + observability ログ 3 発火

## 起票 Issue (1 件)

| Issue | ラベル | 内容 |
|---|---|---|
| #134 | enhancement | promptSafety の whitelist register-or-forget リスク (content-based 検出への移行、size guard backstop あり緊急性 LOW) |

triage 基準は borderline (rating PLAUSIBLE LOW)。PR コメント追記でも代替可能だったが、本田様判断材料として独立 Issue 化 (将来の altitude 改善議論として open 維持)。

## 残課題 (本セッション外・継続)

1. **#134 enhancement**: content-based dataURI 検出 + aiClient.ts 層での自動 sanitize wrapper (size guard が backstop するため緊急性 LOW、設計議論)
2. **モバイル実機確認 (継続)**: PR #128-#130 のレスポンシブ修正 (前 handoff からの継続)
3. **法務確認 (継続)**: 顧問弁護士確認 → `public/legal/*.md` 文言確定 + LEGAL_REVIEW_REQUIRED 一斉削除 PR (M7-β)
4. **#125 多ターン E2E**: 「それで」継続 + intent 引き継ぎの実トラフィック実証 (前 handoff からの継続、本セッションで部分的に Playwright + Chrome で確認)
5. **authSlice flaky**: monitor 継続 (前 handoff からの継続)
6. **GlobalSearch placeholder (受容済 L2)**: 前 handoff からの継続

## 次セッション開始時の状態

- ブランチ: `main` clean (`db826ef` = PR #133 マージ後)
- Open Issue: **1 件** (#134 enhancement、LOW 緊急性)
- 型チェック: `tsc --noEmit` 0 errors / 全テスト 543 pass
- CI/CD: 全 2 PR Cloud Run デプロイ **success** 確認済
- 本番実機: 本田様 Chrome で動作確認済 (token-bomb 防御発火 + status 200)
- 環境: dev サーバ停止済 / ゾンビ Node プロセス 0

## 知見メモ (本セッションで得た教訓)

### A. 「テキスト操作なのに画像が原因」— UI 操作と内部送信データのギャップ

本田様視点では「テキストで相談しただけ」だが、内部では `currentCharacterData` (画像 base64 を含む既存キャラ全データ) が毎リクエストに同梱される設計だった。**UI 操作だけでバグ原因を推測すると、内部送信データの実態を見逃す**。現場メッセージ画像 + handoff/LATEST.md + 過去 PR body を必ず先に grep (memory: `feedback_field_voice_context_first`)。本セッション初期に私はログ仮説に飛びついて handoff を読まず、本田様の指摘 (「最近の bugfix が上手く出来てなかったのでは？」) で初めて PR #125 が真因混入と判明した。

### B. 単一フィールドの本番障害でも横展開リスクを必ず Codex で確認

PR #132 (character/update 単独) の後、Codex セカンドオピニオンで「world/update + world/reply に同種パターン」「character/reply に未対策経路」を即時指摘された。横展開は本田様の Q1-Q3 質問で明示判断を仰ぐ形式が機能 (Codex の各 Q に対し 1-2 文 judgment 取得)。Codex を最初の PR と並行で走らせる規律 (memory: `feedback_destructive_migration_codex_review` の延長) を hot fix にも適用。

### C. observability (paired signal) は本番障害修正の標準セット

silent fail を許容する sanitize 設計に対し、`logger.warn` で構造化ログ (`safetyEvent` / `path` / `bytes`) を必ず添える。本番 Cloud Logging で `jsonPayload.safetyEvent="image-omitted"` 検索すれば発火を即時観測可能。本田様 Chrome 実機テスト時にもこの観測ログで「sanitize が実際に走った」事実が裏付けされた (memory: `feedback_silent_fail_paired_signal`)。

### D. UTF-8 byte 計測の重要性 (日本語アプリで `String.length` は罠)

`String.length` は UTF-16 code unit ベース。日本語 BMP は 1 unit = 3 bytes、emoji surrogate pair は 2 units = 4 bytes。MAX_FIELD_BYTES = 100,000 を `String.length` で比較すると、日本語テキストは実 UTF-8 で 300KB まで素通し (under-defense)、絵文字は 2x 厳しく評価。本プロジェクトは日本語小説執筆アプリのため `Buffer.byteLength(s, 'utf8')` 必須。code-review medium effort の 7 angles 並列 (Angle A/E/F/G が同時に検出) で気付けた構造的 finding。

### E. code-review medium effort の 1-vote verify は 3-state 判定が機能

CONFIRMED HIGH (worldService 空 chatHistory crash) と CONFIRMED MEDIUM (UTF-8 mismatch) は merge 前に必ず fix、PLAUSIBLE LOW (null/undefined embed) も同 PR で対称化 (asymmetry 解消)、PLAUSIBLE LOW altitude (whitelist register-or-forget) は別 Issue 化、と判定別に scope 分離。machine-graded triage が逐次判断ノイズを削減。

## Issue Net 変化

- Open Issue 開始時: 0 件
- Open Issue 終了時: **1 件** (#134)
- Close 数: 0 件
- 起票数: 1 件 (#134)
- Net: **+1 件** (0 → 1)
- 備考: 本セッション主目的は本番障害修正で達成 (2 PR マージ + Cloud Run デプロイ success + 本番実機確認)。Issue #134 は code-review altitude finding (size guard backstop で緊急性 LOW、設計議論) の triage borderline。PR コメント追記で代替可能だったが、本田様判断材料の独立 enhancement として open 維持。rating 5-6 の review agent 提案の機械的起票はなし。
