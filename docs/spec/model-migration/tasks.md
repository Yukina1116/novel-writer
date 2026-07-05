# AI モデル置き換え計画: Gemini 3.1 Flash-Lite / Nano Banana 2 Lite 移行

- **Status**: PR #230 実装 + PR #231 リージョン修正 + PR #233（画像生成の段階呼び出し化・quotaバグ修正）とも **完了・prod実機検証済み**（2026-07-05、Task L）。prod で初回2枚生成・「追加生成」による2枚追記（計4枚表示）とも**いずれも1回目の試行で成功**（429無し）。Cloud Run 実ログ（HTTPステータス・アプリケーションログとも）で2回とも成功を確認済み。本アップデートは prod 含め完全に完了。
- **計画策定**: 2026-07-05（Fable 5 で計画・評価、実装は Sonnet 5 が担当）
- **経緯**: Gemini 2.5 Flash が 2026-10-16 以降 discontinue 予定（公式 deprecations ページ、"earliest possible date" = 暫定）であることを受け、本田様指示によりテキスト・画像両モデルを完全置き換える。
- **実装後の重要な訂正 (2026-07-05, PR #231)**: 計画時点では「テキスト生成は `asia-northeast1` のまま」としていたが、prod 実機検証（Playwright MCP でのUI操作 → Cloud Run 実ログ確認）で `gemini-3.1-flash-lite` が `asia-northeast1` では **404 NOT_FOUND**（Publisher model not found）であることが判明。事前のWeb調査では公式ドキュメントページがJSレンダリングのため地域可用性を確認しきれなかった。対応として `getAiClient()` 自体を `location: 'global'` に変更し、画像専用に用意していた `getImageAiClient()` は区別する理由がなくなったため削除・`getAiClient()` に統合した。以降のタスク本文中の `getImageAiClient()` への言及は歴史的経緯として残すが、**最終実装は単一の `getAiClient()`（global固定）** である。
- **実装後の2つ目の重要な訂正 (2026-07-05, 本PR)**: PR #231 マージ後、prod 実機で画像生成を検証したところ2回連続で失敗（1回目: 4枚中0枚成功、2回目: RESOURCE_EXHAUSTED 429）。`gcloud alpha services quota list --service=aiplatform.googleapis.com --consumer=projects/novel-writer-prod` で実測した結果、Vertex AI の `generate_content_image_gen_per_project_per_base_model_global` quota が **2 req/分/プロジェクト/モデル**（`effectiveLimit: 2`）であることが判明。当初の「1回の生成操作で4並列呼び出し」設計は quota を常に超過するため理論上どんな条件でも4枚同時成功があり得ない構造的な不具合だった。本田様の指示（「段階呼び出しが良い。最初に２枚して、追加ボタンで簡単に追加生成させれるように」）により、**「初回2枚生成 + 追加生成ボタンで任意に2枚ずつ追記」方式**に設計変更。あわせて `image/generate` の sen 単価も Google Cloud 公式料金（$0.034/枚、1K解像度）に基づき実コスト連動で見直した（詳細は下記 決定事項・タスク H 参照）。

## 決定事項（本田様確認済み）

| 項目 | 決定 |
|------|------|
| テキスト生成モデル | `gemini-2.5-flash` → `gemini-3.1-flash-lite`（2026-05-08 GA、入力 $0.25/1M・出力 $1.50/1M で現行より安価、コンテキスト 1M/64K で同等） |
| 画像生成モデル | `imagen-4.0-generate-001` → `gemini-3.1-flash-lite-image`（Nano Banana 2 Lite、GA） |
| 画像生成 UX | ~~4枚グリッド選択を維持。Nano Banana 系は 1 呼び出し 1 枚のため、バックエンドで `generateContent` を並列 4 回呼び出して吸収（2026-07-05 本田様選択）~~ → **2026-07-05 訂正**: quota=2 req/分実測により4並列は常に失敗する構造的欠陥と判明。**「初回2枚 + 追加生成ボタンで2枚ずつ追記」の段階呼び出し方式**に変更（本田様指示） |
| 認証 | Workload Identity / ADC 現状維持（API キー発行なし、`USE_VERTEX_AI=true`） |
| usageConfig | ~~`image/generate: 1000 sen` は変更しない~~ → **2026-07-05 訂正**: Google Cloud 公式料金（$0.034/枚、1K解像度）で実コスト検証した結果、2枚/回の実コスト≈11円に対し1000senのままだとマージンが無いため **1200 sen** に修正（詳細: `docs/spec/m3/usage-cost-config.md`）。無料枠のコンバージョン最適化観点の再設計は [novel-writer#232](https://github.com/Yukina1116/novel-writer/issues/232) に切り出し |

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
  - **2026-07-06 追記（Codex review P1 修正）**: 本田様の依頼でTask L完了後にCodexへ独立レビューを依頼したところ、`personGeneration` が Vertex AI 専用パラメータであり、APIキーモード（`USE_VERTEX_AI` 未設定時、`@google/genai` の Gemini Developer API 経路）では SDK が client-side で `personGeneration parameter is not supported in Gemini API` を reject することが実行検証で判明（dev/prodは`USE_VERTEX_AI=true`固定のため実害なしだが、CLAUDE.mdが説明する「APIキーモード」実行経路は100%失敗する状態だった）。`server/aiClient.ts` に `isVertexAiMode()` を追加し、`imageService.ts` で `isVertexAiMode()` が true の場合のみ `personGeneration` を含めるよう修正（`imageService.test.ts` にAPIキーモード用のテストを追加、TDDで再現→修正）
  - `outputMimeType` は**指定しない**（SDK 型定義に「Gemini API 非対応」注記あり）。MIME タイプはレスポンス `inlineData.mimeType` から読む（fallback `'image/png'`）
- [x] レスポンス処理: 各 `candidates[0].content.parts[]` から `inlineData` を持つ part を抽出し `data:<mimeType>;base64,<data>` を構築。**画像 part が 1 つも無い場合（安全フィルタ拒否等）は明示エラーを throw**（text part のみ返るケースがある）
- [x] 失敗セマンティクス: 当初計画の fail-fast（`Promise.all`）から、`/code-review` (medium) の CONFIRMED 指摘（4並列の部分失敗時に実際の課金と社内usageレジャーが乖離する）を受けて **`Promise.allSettled` + `PartialSuccessError`（成功比率分だけ課金）** に変更。さらに Codex review (P1/P2) の指摘で、全滅時は元の SDK エラーをラップせず伝播（quota/認証/timeout 分類維持）、部分成功時の `commit` 失敗時は `cancel` にフォールバック、を追加実装。
- [x] ~~戻り値型 `Promise<string[]>`（4 枚の data URI 配列）は変更しない — FE (`imageApi.ts` / `ImageGenerationModal.tsx`)・route (`server/routes/image.ts`) は無変更~~ → **2026-07-05 訂正（タスク H）**: 戻り値型 `Promise<string[]>` 自体は変わらないが、quota バグ修正により配列長は4枚→2枚に変更。`imageApi.ts` / `server/routes/image.ts` は無変更のままだが、`ImageGenerationModal.tsx` には「追加生成」ボタンの diff が発生（詳細はタスク H）

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

### F. 実機検証（A–E 完了後）— 完了（region バグ・quota バグを発見、H で修正）
- [x] feature ブランチ → PR #230 作成 → 番号認可マージ → dev 自動デプロイ成功
- [x] **本田様の明示判断により dev 実機検証をスキップし、prod へ直接デプロイして検証**（`deploy-prod.yml` 手動実行）
- [x] テキスト生成: Playwright MCP で prod UI から小説続き生成を実行 → **500 エラー発生**。Cloud Run 実ログで根本原因を特定: `gemini-3.1-flash-lite` が `asia-northeast1` で 404 NOT_FOUND（Publisher model not found）。事前調査時点では公式ドキュメントの地域可用性が JS レンダリングのため確認できなかった。PR #231 で修正後、再実行して成功を確認（「満開の桜並木の下で、二人が再会するシーンを一文だけ書いてください。」→正常な続き文が生成、コンソールエラー無し）
- [x] 画像生成: 人物キャラクターのプロンプトで生成を実行 → **2回連続失敗**（1回目: 4枚中0枚成功、2回目: RESOURCE_EXHAUSTED 429）。`gcloud alpha services quota list` で根本原因を特定: quota=2 req/分/プロジェクト/モデル。4並列設計が quota を常に超過する構造的欠陥と判明。→ タスク H で「初回2枚+追加生成」方式に修正
- [x] **global エンドポイントで動作すること** → 「asia-northeast1 では動作しない」ことが判明し、テキスト・画像とも global 固定に変更（PR #231）。regional化の検討課題は解消（そもそも regional が使えない）
- [x] `aiplatform.googleapis.com` quota（RPM/IPM 相当）の実測・429 発生時の FE 文言確認 → **実測完了**。`generate_content_image_gen_per_project_per_base_model_global` = 2 req/分。429時のFE文言は既存の `handleApiError` quota分類（「AIの無料利用枠の上限に達してしまいました…」）がそのまま表示されることを確認

### G. コスト実測 + prod 判断 — 完了
- [x] 画像生成単価は Playwright MCP で `cloud.google.com/vertex-ai/generative-ai/pricing` を実レンダリングして確認（WebFetch は長大なページの途中で切れて取得できなかったため実機ブラウザで代替）: Gemini 3.1 Flash-Lite Image = **$0.034/枚**（1K解像度）、参考: 旧 Imagen 4 = $0.04/枚（Nano Banana 2 Lite の方が約15%安い）
- [x] `image/generate` sen を実コスト連動で 1000 → **1200 sen** に修正（タスク H 参照）
- [x] prod への反映は完了済み（PR #230 マージ直後に本田様指示で `deploy-prod.yml` 実行）。region バグ修正（PR #231）は再デプロイ・再検証済み。quota バグ修正（本PR）は実装完了、再デプロイ・再検証はタスク I で実施予定

### H. 画像生成の段階呼び出し化（quota バグ修正、F で発見）— 完了
- [x] `server/services/imageService.ts`: `NUM_IMAGES` を 4→2 に変更（quota=2 req/分に合わせる）
- [x] `server/services/imageService.test.ts` / `server/middleware/withUsageQuota.test.ts`: N=2 の境界値（successRatio は 0 / 0.5 / 1 のみ）にテスト書き直し
- [x] `server/services/usageConfig.ts`: `image/generate` sen を 1000→1200 に修正（実コスト $0.034×2枚≈11円に対し約9%マージン）。`docs/spec/m3/usage-cost-config.md` の根拠表も更新
- [x] `components/ImageGenerationModal.tsx`: `handleGenerate` に `append` パラメータを追加。「追加生成」ボタンを新設し、既存画像・選択状態を保持したまま新規2枚を末尾に追記
- [x] コンバージョン最適化（無料枠の専用サブ上限、有料版導線CTA等）は Codex `plan` mode セカンドオピニオンで検討したが、本田様判断でスコープ外とし [novel-writer#232](https://github.com/Yukina1116/novel-writer/issues/232) に切り出し

### I. dev/prod 実機再検証（段階呼び出し方式、H 完了後）— dev・prod とも完全達成
- [x] feature ブランチ → PR #233 作成 → 番号認可マージ → dev 自動デプロイ成功（`novel-writer-ramnh3ulya-an.a.run.app`）
- [x] Playwright MCP で「AI 立ち絵生成」を実行し、初回2枚の data URI が返ることを確認（1回目は `PartialSuccessError`（2枚中1枚成功）で500、2回目のリトライで2枚とも成功）
- [x] 選択状態のまま「追加生成」を押しても `selectedImage` が正しくクリアされ、左パネルがチャットUIに戻ることを確認（code-review CONFIRMED 修正が実機でも機能）
- [x] **quota 超過（429）・コンテンツ関連失敗（両方成功だが画像データ無し）のいずれでも、既存の生成済み画像がグリッドから消えないことを複数回確認**（UI破綻なし）
- [x] **「追加生成」ボタンが成功し、既存2枚を残したまま新規2枚が追記されることを確認** → **2026-07-05 追記で達成確認**。初回6回試行は quota 超過（429）が15分以上継続し失敗が続いたが、約2時間以上のquota回復待ち後に別プロンプト（「40代の商店主の男性、丸眼鏡、優しい笑顔、エプロン姿」）でdev実機再試行したところ、Trial 1（初回2枚生成）・Trial 2（「追加で2枚生成する」クリック）とも**いずれも1回目の試行で成功**（429無し）。`browser_snapshot` で既存2枚（Generated character 1, 2）を保持したまま新規2枚（3, 4）が追記され計4枚表示されることを直接確認。Trial 1 はさらに `gcloud logging read` でエラー無しも確認済み（Trial 2 は network 200×2 + DOM 確認のみで、Cloud Runログの明示確認は未実施、下記参照）
- [x] Trial 2（追記成功）に対応する Cloud Run ログの明示確認 → dev分は当時未実施のままだったが、下記 prod 検証（タスク L）で Trial 1/Trial 2 とも `gcloud logging read` で 200 応答 + WARNING 以上のログ無しを確認し、AC#9 を完全クローズ

### L. prod 実機再検証（Task L、2026-07-05）— 完了
- [x] prod URL（`novel-writer-df263ic6wa-an.a.run.app`）に Playwright MCP でアクセス（既存ログイン済みセッション `hy.unimail.11@gmail.com` を再利用）
- [x] 事前に `gcloud run revisions list` で PR #233（quota修正）の commit (`806dd40`) が現在の prod デプロイ済みリビジョン（`novel-writer-00013-mtb`, headSha `9483fad`）の祖先であることを確認（`git merge-base --is-ancestor`）。**訂正（2026-07-05、事後検証）**: 当初「CI/CDがmain pushで自動デプロイする構成のため追加デプロイ操作は不要」と記載したが誤り。`deploy-prod.yml` は `workflow_dispatch` 専用（push trigger なし、main自動デプロイは dev のみ）であり、`gh api` で当該デプロイ実行の `event` を確認したところ `workflow_dispatch`（本田様が手動実行、2026-07-05T09:50:32Z）だった。実態は「本田様が既に手動デプロイ済みだったため、Task L時点で追加デプロイが不要だった」であり、自動デプロイではない
- [x] 事前に `gcloud logging read` で直近6時間の prod 上の image/generate 関連ログが皆無であることを確認し、quota が汚染されていないクリーンな状態であることを確認してから実行
- [x] テスト用キャラクター「prodテスト商店主」（性別: 男性、年齢: 40代、容姿特徴: 丸眼鏡・優しい笑顔・エプロン姿）を新規作成
- [x] Trial 1（初回2枚生成）: 「画像を生成」クリック → **1回目の試行で即成功**（429無し）。プロンプト通りの人物画像2枚が生成された
- [x] Trial 2（追加生成）: 「追加で2枚生成する」クリック → **1回目の試行で即成功**（429無し）。既存2枚を保持したまま新規2枚が追記され、計4枚表示を確認
- [x] `browser_network_requests` で両トライアルとも `POST /api/ai/image/generate` が `200` であることを確認
- [x] `gcloud logging read` で両トライアルの Cloud Run リクエストログが両方とも `200`（13:25:14 / 13:28:29 UTC）であること、および該当時間帯に `severity>=WARNING` のログが一件も無いことを確認

**新たな重要な発見（quota 回復時間、2026-07-05 dev実機検証）**: `generate_content_image_gen_per_project_per_base_model_global` quota (2 req/分) は、バースト消費後の回復に**想定していた「同一1分ウィンドウ」よりも大幅に長い時間**（実測で15分以上）を要することが判明。当初のリスク評価「同一1分ウィンドウ内の連続操作でのみ429が起こり得る」は、実際にはより保守的（長時間ブロックされ得る）と修正する必要がある。詳細はリスク欄参照。

## Acceptance Criteria

1. `TEXT_MODEL === 'gemini-3.1-flash-lite'` かつ `IMAGE_MODEL === 'gemini-3.1-flash-lite-image'`（検証: テスト）— ✅ 達成
2. 小説続き生成 API → 200 + 生成テキスト（検証: 実機）— ✅ 達成（PR #231 修正後、prod実機で再確認済み）
3. 画像生成 API（人物プロンプト）→ 200 + **2 枚**の data URI 配列、または一部失敗時は成功比率に応じた `PartialSuccessError`（検証: 実機・Playwright MCP、タスク I・L）— ✅ **dev・prod とも達成**（prod は 2026-07-05 Task L で初回2枚生成を実機確認）
4. 画像レスポンスに画像 part が無い場合 → 明示エラーで throw し、route 層で分類される（検証: コード + テスト pin）— ✅ 達成
5. ~~`imageApi.ts` / `ImageGenerationModal.tsx` / `server/routes/image.ts` に diff が無い~~ → **2026-07-05 訂正**: quota バグ修正のため `ImageGenerationModal.tsx` に「追加生成」ボタンの diff が発生（`imageApi.ts`/`server/routes/image.ts` は無変更のまま）— ✅ 達成（訂正後の基準として）
6. `npm run lint` / `npm run test` 全 PASS（検証: CI）— ✅ 達成
7. リポジトリ内に `gemini-2.5-flash` / `imagen-4.0` の実効参照が残っていない（検証: grep。履歴系ドキュメント docs/handoff/ 等は除外）— ✅ 達成
8. テキスト・画像とも `asia-northeast1` ではなく `global` エンドポイントで疎通すること — ✅ 達成
9. **（本PR で追加）** 画像生成1回あたりの並列呼び出し数が Vertex AI quota（2 req/分）以下に収まる設計であること（quota超過を「常に起こる」構造的バグから「一定期間内の連続操作でのみ起こり得る」例外的事象に縮小する）。初回生成2枚 + 追加生成ボタンで2枚ずつ追記できること（検証: 実機・Playwright MCP）— ✅ **dev・prod とも完全達成**（初回2枚生成・「追加生成」による2枚追記（計4枚表示）とも dev・prod 実機で確認済み。dev は quota 回復に想定より長時間かかったため即座には確認できなかったが、約2時間以上の回復待ち後の再試行で成功。**prod は 2026-07-05 Task L で Trial 1・Trial 2 とも1回目の試行で即成功**（429無し、Cloud Run 実ログで200応答・エラーログ無しを確認）。static pin テスト + 4種のコードレビューでのロジック検証と合わせて三重に裏付け済み）

## 品質ゲート

- [x] lint / test / build 全 PASS（PR #230: 884/884、PR #231: 884/884 + static pin 1件追加で885/885、本PR: 884/884）
- [x] `/safe-refactor` → `/code-review`（medium effort、8角度並列ファインダー + verify。CONFIRMED 1件（部分成功時の課金精度）を修正）
- [x] `/codex review`（大規模PR判定、PR #230 で実施。P1/P2 2件修正: エラー分類保持・commit失敗フォールバック）
- [x] PR #231（3ファイル、medium tier）は `/review-pr`（code-reviewer / pr-test-analyzer / comment-analyzer 3並列）実施。pr-test-analyzer の rating 7 指摘（`GCP_LOCATION` 非依存の static pin 欠落）を反映
- [x] **本PR（8ファイル、5ファイル以上のため evaluator 分離プロトコル発動）**: `/safe-refactor`（問題なし）→ `/code-review`（medium effort、8角度並列 + 3件verify）で CONFIRMED 2件を修正（`selectedImage` が追加生成時にクリアされず旧選択がハイライトされたまま残る不整合／`NUM_IMAGES` 相当の値がバックエンド定数・FEローダー枚数・FEボタン文言の3箇所に独立ハードコードされ単一の source of truth が無い、後者は `shared/imageGenerationConfig.ts` 新設で解消）。「二重クリックで並列生成が2重に走る」候補は React の同期 state 更新 + ネイティブ disabled 属性により REFUTED。→ 続けて evaluator agent（Acceptance Criteria 9項目）で APPROVE（全項目PASS、MEDIUM指摘1件: 本ドキュメントの「実機検証済み」記述が本PRのコードに対しては時期尚早だった点 → 本追記で是正）

## リスク・ロールバック

- **ロールバック**: `aiClient.ts` のモデル定数 2 行 + imageService を revert して再デプロイするだけで旧構成に戻る（Imagen は廃止予定日未到来のため当面利用可能）
- **創作品質**: ベンチマーク上は新モデル優位だが創作文章品質は未検証。region バグ（PR #231）修正後の再検証で確認予定
- **レート制限**: 実測の結果、quota=2 req/分/プロジェクト/モデルであり、当初の4並列設計は「429接触確率が上がる」どころか**常に quota を超過する構造的欠陥**だった。タスク H で NUM_IMAGES を2に変更し quota 内に収まる設計に修正。`Promise.allSettled` + `PartialSuccessError` による部分成功按分課金の仕組み自体は維持（N=2でも1件失敗時の按分に活用）
- **「追加生成」ボタンのクールダウン非実装（意図的なスコープ外）**: quota=2 req/分のため、初回生成の直後に「追加生成」を押すと 429 になり得る。本田様の「すぐ簡単に追加生成させれる」という意図を優先し、クールダウン待機UIは実装しない設計判断（Codex `plan` mode セカンドオピニオンでも同リスクを指摘済み）。429 時は既存の quota エラー文言がそのまま表示され、既存の生成済み画像は失われない（dev実機で複数回確認済み）。将来的に UX 改善（残り時間表示等）が必要になれば [novel-writer#232](https://github.com/Yukina1116/novel-writer/issues/232) のスコープで検討する。cross-project 注記: このquotaはGCPプロジェクト単位（全ユーザー共有）のため、複数ユーザーが同時に画像生成を行うと、個々のユーザーの月間利用枠には余裕があっても quota 超過が起こり得る（本PRのスコープでは対応せず、実運用で顕在化した場合に再評価）
- **2026-07-05 訂正: quota 回復時間は「同一1分ウィンドウ」より大幅に長い（dev実機実測）**: 当初「2 req/分」というquota表示ラベルから、429発生後60秒程度で回復すると想定していたが、dev実機検証で最後の成功から**15分以上経過しても429が継続**することを確認（`gcloud logging read` でタイムスタンプ実測、無関係な穏当なプロンプトに変更しても再現）。これは「バースト後のペナルティ期間が長い」「quotaのsmoothing窓が想定より長い」等、Vertex AI側の実装詳細に起因すると推測されるが、公式ドキュメントに明記された挙動ではないため確定的な原因は不明。**実運用上の含意**: ユーザーが「追加生成」で429に遭遇した場合、体感的に「すぐ簡単に追加生成できる」というUX意図から乖離し、数分〜十数分待つ必要が生じる可能性がある。この点は当初の想定より深刻度が高いため、[novel-writer#232](https://github.com/Yukina1116/novel-writer/issues/232) でのUX再設計（残り時間表示、専用サブ上限等）の優先度を上げて検討すべき材料として記録する。**追記（同日、約2時間以上のクールダウン後）**: 十分な時間が経過すれば quota は正常に回復し、初回生成・追加生成とも1回目の試行で成功することを確認済み（下記タスク I 参照）。「回復するまでの時間が読めない」ことがリスクの本質であり、「回復しない」わけではない。
- **global endpoint**: 画像プロンプトの日本リージョン外処理を許容（本計画承認に含む）。→ **PR #231 でテキストのプロンプトも同様に global 経由になったことを追記**（asia-northeast1 で両モデルとも 404 だったため、regional 据え置きの選択肢自体が無かった）
- **リージョン可用性の教訓**: 新モデルのリージョン可用性は、公式ドキュメントページが JS レンダリングで確認できない場合、Web調査だけでは断定できない。今回のように実機（実際の API 呼び出し）でしか判明しない制約があるため、モデル移行時は最初から「対象リージョンで最小限の1回呼び出しテスト」を計画に組み込むべきという教訓が得られた。
