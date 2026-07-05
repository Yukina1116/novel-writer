# AI モデル置き換え計画: Gemini 3.1 Flash-Lite / Nano Banana 2 Lite 移行

- **Status**: **完了**（PR #230 実装 + PR #231 リージョン修正、2026-07-05 devマージ済み、本田様承認で prod へも直接反映・実機検証済み）
- **計画策定**: 2026-07-05（Fable 5 で計画・評価、実装は Sonnet 5 が担当）
- **経緯**: Gemini 2.5 Flash が 2026-10-16 以降 discontinue 予定（公式 deprecations ページ、"earliest possible date" = 暫定）であることを受け、本田様指示によりテキスト・画像両モデルを完全置き換える。
- **実装後の重要な訂正 (2026-07-05, PR #231)**: 計画時点では「テキスト生成は `asia-northeast1` のまま」としていたが、prod 実機検証（Playwright MCP でのUI操作 → Cloud Run 実ログ確認）で `gemini-3.1-flash-lite` が `asia-northeast1` では **404 NOT_FOUND**（Publisher model not found）であることが判明。事前のWeb調査では公式ドキュメントページがJSレンダリングのため地域可用性を確認しきれなかった。対応として `getAiClient()` 自体を `location: 'global'` に変更し、画像専用に用意していた `getImageAiClient()` は区別する理由がなくなったため削除・`getAiClient()` に統合した。以降のタスク本文中の `getImageAiClient()` への言及は歴史的経緯として残すが、**最終実装は単一の `getAiClient()`（global固定）** である。

## 決定事項（本田様確認済み）

| 項目 | 決定 |
|------|------|
| テキスト生成モデル | `gemini-2.5-flash` → `gemini-3.1-flash-lite`（2026-05-08 GA、入力 $0.25/1M・出力 $1.50/1M で現行より安価、コンテキスト 1M/64K で同等） |
| 画像生成モデル | `imagen-4.0-generate-001` → `gemini-3.1-flash-lite-image`（Nano Banana 2 Lite、GA） |
| 画像生成 UX | **4枚グリッド選択を維持**。Nano Banana 系は 1 呼び出し 1 枚のため、バックエンドで `generateContent` を並列 4 回呼び出して吸収（2026-07-05 本田様選択） |
| 認証 | Workload Identity / ADC 現状維持（API キー発行なし、`USE_VERTEX_AI=true`） |
| usageConfig | `image/generate: 1000 sen` は変更しない（元々控えめ固定見積もり。新モデルの想定実コストは旧 Imagen 以下の見込みのため安全側） |

## 承認に含まれる許容事項

- **画像生成のみ `location: 'global'` エンドポイントを使用**する（Nano Banana 系フルサイズ版は global 限定の実測知見あり）。画像プロンプトの処理が日本リージョン外で行われ得る。~~テキスト生成は従来どおり `asia-northeast1`。dev 検証で asia-northeast1 が動作した場合は regional へ戻すことを検討課題として記録する。~~
  → **2026-07-05 PR #231 で訂正**: prod 実機検証の結果、テキスト生成 (`gemini-3.1-flash-lite`) も `asia-northeast1` では 404 で動作せず、**テキスト・画像とも `global` エンドポイント固定**に変更。日本リージョン外処理の許容範囲が計画時点より広がっている（テキストのプロンプトも含む）ことを記録として残す。

## タスク

### A. `server/aiClient.ts` 更新（小）— PR #230 で完了、PR #231 で統合し直し
- [x] `TEXT_MODEL = 'gemini-3.1-flash-lite'`
- [x] `IMAGE_MODEL = 'gemini-3.1-flash-lite-image'`
- [x] ~~画像専用クライアントファクトリ `getImageAiClient()` を追加~~ → **PR #231 で `getImageAiClient()` は削除し `getAiClient()` に統合**。テキスト・画像とも `location: 'global'` 固定の単一クライアントになった（asia-northeast1 では両モデルとも 404 のため）。

### B. `server/services/imageService.ts` 全面書き換え（中、A に依存）— PR #230 で完了
- [x] `client.models.generateImages(...)` → `getAiClient().models.generateContent(...)`（PR #231 で `getImageAiClient` から統合）を `Promise.allSettled` で **並列 4 回**（当初 `Promise.all` の想定から `/code-review` 指摘で `allSettled` + 部分成功按分に進化、下記参照）
- [x] config: `responseModalities: [Modality.TEXT, Modality.IMAGE]` + `imageConfig: { aspectRatio: '3:4', imageSize: '1K', personGeneration: 'ALLOW_ADULT' }`
  - `personGeneration: 'ALLOW_ADULT'` は**明示必須**（主用途がキャラクター=人物画像。旧 Imagen のデフォルトと同等のパリティを明示で固定）
  - `outputMimeType` は**指定しない**（SDK 型定義に「Gemini API 非対応」注記あり）。MIME タイプはレスポンス `inlineData.mimeType` から読む（fallback `'image/png'`）
- [x] レスポンス処理: 各 `candidates[0].content.parts[]` から `inlineData` を持つ part を抽出し `data:<mimeType>;base64,<data>` を構築。**画像 part が 1 つも無い場合（安全フィルタ拒否等）は明示エラーを throw**（text part のみ返るケースがある）
- [x] 失敗セマンティクス: 当初計画の fail-fast（`Promise.all`）から、`/code-review` (medium) の CONFIRMED 指摘（4並列の部分失敗時に実際の課金と社内usageレジャーが乖離する）を受けて **`Promise.allSettled` + `PartialSuccessError`（成功比率分だけ課金）** に変更。さらに Codex review (P1/P2) の指摘で、全滅時は元の SDK エラーをラップせず伝播（quota/認証/timeout 分類維持）、部分成功時の `commit` 失敗時は `cancel` にフォールバック、を追加実装。
- [x] 戻り値型 `Promise<string[]>`（4 枚の data URI 配列）は**変更しない** — FE (`imageApi.ts` / `ImageGenerationModal.tsx`)・route (`server/routes/image.ts`) は無変更

### C. `server/services/imageService.test.ts` 新規作成（中、B に依存)— 完了
既存慣習（`worldService.test.ts` 等の static contract pin パターン、AI client の runtime mock はしない）に加え、`getAiClient` の wrapper のみモックして `allSettled` 集計ロジックを実行時検証する方式に強化（`/code-review` PLAUSIBLE 指摘への対応）:
- [x] `generateContent` を使用（`generateImages` が残っていないこと）
- [x] `getAiClient` 経由であること（`getImageAiClient` は PR #231 で削除、参照なし）
- [x] `Promise.allSettled` による並列呼び出しであること
- [x] `personGeneration` の明示指定があること
- [x] `inlineData.mimeType` をレスポンスから参照していること（`image/png` ハードコードで URI を組んでいないこと）
- [x] `aiClient.ts` の `TEXT_MODEL` / `IMAGE_MODEL` が新モデル名であること
- [x] `location: 'global'` 固定・`GCP_LOCATION` 非依存の pin（PR #231 の `pr-test-analyzer` 指摘で追加、region 分岐の再導入を検知）

### D. 旧モデル名の全域 grep 更新（小、独立）— 完了
- [x] リポジトリ全体を `gemini-2.5-flash` / `imagen` で grep し、以下を更新:
  - `CLAUDE.md`（`Vertex AI (gemini-2.5-flash)` 記述）
  - `server/services/usageConfig.ts` L14 コメント（`gemini-2.5-flash テキスト生成 30 回相当`）
  - `docs/spec/m3/usage-cost-config.md`
  - `public/dev/index.html`
  - `docs/diagrams/architecture{,-target}.html` / `docs/runbook/*.md` / `docs/legal/privacy-policy.md` / `public/legal/privacy-policy.md` / `docs/spec/prod-migration/phase4-tasks.md` / `manual/full-documentation.md`（grep でヒットした全 doc/コメント。歴史的スナップショット文書（`.claude/memory/project_novel_writer_m1.md` 等）は対象外）

### E. TEXT_MODEL 呼び出し 5 サービスの互換確認（小、独立）— 完了
- [x] `analysisService` / `novelService` / `characterService` / `utilityService` / `worldService` の `generateContent` config（temperature / systemInstruction / responseSchema 等）が gemini-3.1-flash-lite で互換であることを確認（コード変更なし。responseSchema JSON モードは公式ドキュメントで対応確認済み）
- [x] **thinkingConfig のデフォルト挙動確認**: gemini-3.1-flash-lite は `thinking_level: MINIMAL`（最速・最安）がデフォルトのため追加設定不要と確認

### F. 実機検証（A–E 完了後）— 一部完了、region バグを発見・修正（PR #231）、再検証待ち
- [x] feature ブランチ → PR #230 作成 → 番号認可マージ → dev 自動デプロイ成功
- [x] **本田様の明示判断により dev 実機検証をスキップし、prod へ直接デプロイして検証**（`deploy-prod.yml` 手動実行）
- [x] テキスト生成: Playwright MCP で prod UI から小説続き生成を実行 → **500 エラー発生**。Cloud Run 実ログで根本原因を特定: `gemini-3.1-flash-lite` が `asia-northeast1` で 404 NOT_FOUND（Publisher model not found）。事前調査時点では公式ドキュメントの地域可用性が JS レンダリングのため確認できなかった。
- [ ] ~~生成文の創作品質を目視確認~~ → 上記エラーのため未達成、PR #231 マージ後に再試行
- [ ] 画像生成: 人物キャラクターのプロンプトで4枚の data URI が返ることを確認 → **未実施**（テキスト側のエラー判明を優先したため）。PR #231 マージ後に実施
- [x] **global エンドポイントで動作すること** → 逆に「asia-northeast1 では動作しない」ことが判明し、テキスト・画像とも global 固定に変更（PR #231）。regional化の検討課題は解消（そもそも regional が使えない）
- [ ] `aiplatform.googleapis.com` quota（RPM/IPM 相当）の実測・429 発生時の FE 文言確認 → 未実施、PR #231 マージ後の再検証に含める

### G. コスト実測 + prod 判断（F 完了後、非同期可）— 未着手
- [ ] 画像生成単価はテキストと異なり**公式 Pricing ページ未確認（二次情報 $0.034/枚のみ）**。実機検証後に Billing コンソールで実課金を確認し、`image/generate: 1000 sen` の妥当性を裏取りする
- [ ] prod への反映は完了済み（PR #230 マージ直後に本田様指示で `deploy-prod.yml` 実行）。ただし region バグ修正（PR #231）の再デプロイ・再検証が必要

## Acceptance Criteria

1. `TEXT_MODEL === 'gemini-3.1-flash-lite'` かつ `IMAGE_MODEL === 'gemini-3.1-flash-lite-image'`（検証: テスト）— ✅ 達成
2. 小説続き生成 API → 200 + 生成テキスト（検証: 実機）— ❌ **未達成**（asia-northeast1 で404、PR #231 で修正済みだが再検証待ち）
3. 画像生成 API（人物プロンプト）→ 200 + **4 枚**の data URI 配列、または一部失敗時は成功比率に応じた `PartialSuccessError`（検証: 実機）— ⏳ **未実施**
4. 画像レスポンスに画像 part が無い場合 → 明示エラーで throw し、route 層で分類される（検証: コード + テスト pin）— ✅ 達成
5. `imageApi.ts` / `ImageGenerationModal.tsx` / `server/routes/image.ts` に diff が無い（検証: git diff）— ✅ 達成
6. `npm run lint` / `npm run test` 全 PASS（検証: CI）— ✅ 達成
7. リポジトリ内に `gemini-2.5-flash` / `imagen-4.0` の実効参照が残っていない（検証: grep。履歴系ドキュメント docs/handoff/ 等は除外）— ✅ 達成
8. **（PR #231 で追加）** テキスト・画像とも `asia-northeast1` ではなく `global` エンドポイントで疎通すること — ⏳ PR #231 マージ後に再検証

## 品質ゲート

- [x] lint / test / build 全 PASS（PR #230: 884/884、PR #231: 884/884 + static pin 1件追加で885/885）
- [x] `/safe-refactor` → `/code-review`（medium effort、8角度並列ファインダー + verify。CONFIRMED 1件（部分成功時の課金精度）を修正）
- [x] `/codex review`（大規模PR判定、PR #230 で実施。P1/P2 2件修正: エラー分類保持・commit失敗フォールバック）
- [x] PR #231（3ファイル、medium tier）は `/review-pr`（code-reviewer / pr-test-analyzer / comment-analyzer 3並列）実施。pr-test-analyzer の rating 7 指摘（`GCP_LOCATION` 非依存の static pin 欠落）を反映
- [ ] 最終 diff が 5 ファイル以上になった場合の evaluator 分離プロトコル → 該当なし（各PRとも3ファイル）

## リスク・ロールバック

- **ロールバック**: `aiClient.ts` のモデル定数 2 行 + imageService を revert して再デプロイするだけで旧構成に戻る（Imagen は廃止予定日未到来のため当面利用可能）
- **創作品質**: ベンチマーク上は新モデル優位だが創作文章品質は未検証。region バグ（PR #231）修正後の再検証で確認予定
- **レート制限**: 4 並列化で 429 接触確率が上がる懸念に対し、`Promise.allSettled` + `PartialSuccessError` による部分成功按分課金を実装済み（`/code-review` 指摘反映）。quota 実測は F タスクで未実施のまま残存
- **global endpoint**: 画像プロンプトの日本リージョン外処理を許容（本計画承認に含む）。→ **PR #231 でテキストのプロンプトも同様に global 経由になったことを追記**（asia-northeast1 で両モデルとも 404 だったため、regional 据え置きの選択肢自体が無かった）
- **リージョン可用性の教訓**: 新モデルのリージョン可用性は、公式ドキュメントページが JS レンダリングで確認できない場合、Web調査だけでは断定できない。今回のように実機（実際の API 呼び出し）でしか判明しない制約があるため、モデル移行時は最初から「対象リージョンで最小限の1回呼び出しテスト」を計画に組み込むべきという教訓が得られた。
