# AI モデル置き換え計画: Gemini 3.1 Flash-Lite / Nano Banana 2 Lite 移行

- **Status**: **承認済み**（2026-07-05 本田様承認、global endpoint 許容を含む。実装担当: Sonnet 5）
- **計画策定**: 2026-07-05（Fable 5 で計画・評価、実装は Sonnet 5 が担当）
- **経緯**: Gemini 2.5 Flash が 2026-10-16 以降 discontinue 予定（公式 deprecations ページ、"earliest possible date" = 暫定）であることを受け、本田様指示によりテキスト・画像両モデルを完全置き換える。

## 決定事項（本田様確認済み）

| 項目 | 決定 |
|------|------|
| テキスト生成モデル | `gemini-2.5-flash` → `gemini-3.1-flash-lite`（2026-05-08 GA、入力 $0.25/1M・出力 $1.50/1M で現行より安価、コンテキスト 1M/64K で同等） |
| 画像生成モデル | `imagen-4.0-generate-001` → `gemini-3.1-flash-lite-image`（Nano Banana 2 Lite、GA） |
| 画像生成 UX | **4枚グリッド選択を維持**。Nano Banana 系は 1 呼び出し 1 枚のため、バックエンドで `generateContent` を並列 4 回呼び出して吸収（2026-07-05 本田様選択） |
| 認証 | Workload Identity / ADC 現状維持（API キー発行なし、`USE_VERTEX_AI=true`） |
| usageConfig | `image/generate: 1000 sen` は変更しない（元々控えめ固定見積もり。新モデルの想定実コストは旧 Imagen 以下の見込みのため安全側） |

## 承認に含まれる許容事項

- **画像生成のみ `location: 'global'` エンドポイントを使用**する（Nano Banana 系フルサイズ版は global 限定の実測知見あり）。画像プロンプトの処理が日本リージョン外で行われ得る。テキスト生成は従来どおり `asia-northeast1`。dev 検証で asia-northeast1 が動作した場合は regional へ戻すことを検討課題として記録する。

## タスク

### A. `server/aiClient.ts` 更新（小）
- [ ] `TEXT_MODEL = 'gemini-3.1-flash-lite'`
- [ ] `IMAGE_MODEL = 'gemini-3.1-flash-lite-image'`
- [ ] 画像専用クライアントファクトリ `getImageAiClient()` を追加: Vertex モード時のみ `location: 'global'` の第二インスタンスを生成・キャッシュ（既存 `getAiClient()` と同じ fail-fast 設計: `GCP_PROJECT` 未設定で throw）。API キーモードでは既存クライアントを共用。

### B. `server/services/imageService.ts` 全面書き換え（中、A に依存）
- [ ] `client.models.generateImages(...)` → `getImageAiClient().models.generateContent(...)` を `Promise.all` で **並列 4 回**
- [ ] config: `responseModalities: [Modality.TEXT, Modality.IMAGE]` + `imageConfig: { aspectRatio: '3:4', imageSize: '1K', personGeneration: 'ALLOW_ADULT' }`
  - `personGeneration: 'ALLOW_ADULT'` は**明示必須**（主用途がキャラクター=人物画像。旧 Imagen のデフォルトと同等のパリティを明示で固定）
  - `outputMimeType` は**指定しない**（SDK 型定義に「Gemini API 非対応」注記あり）。MIME タイプはレスポンス `inlineData.mimeType` から読む（fallback `'image/png'`）
- [ ] レスポンス処理: 各 `candidates[0].content.parts[]` から `inlineData` を持つ part を抽出し `data:<mimeType>;base64,<data>` を構築。**画像 part が 1 つも無い場合（安全フィルタ拒否等）は明示エラーを throw**（text part のみ返るケースがある）
- [ ] 失敗セマンティクス: **fail-fast（全体失敗）**。`Promise.all` の最初の reject をそのまま伝播し、既存の route 層 `handleApiError(error, fn, 'ai')` の transient/permanent 分類に委譲する（現行 Imagen 1 呼び出し失敗時と同じ挙動を維持）。この方針をコードコメントに記載。
- [ ] 戻り値型 `Promise<string[]>`（4 枚の data URI 配列）は**変更しない** — FE (`imageApi.ts` / `ImageGenerationModal.tsx`)・route (`server/routes/image.ts`) は無変更

### C. `server/services/imageService.test.ts` 新規作成（中、B に依存)
既存慣習（`worldService.test.ts` 等の static contract pin パターン、AI client の runtime mock はしない）に従い、以下を pin:
- [ ] `generateContent` を使用（`generateImages` が残っていないこと）
- [ ] `getImageAiClient` 経由（global endpoint 用クライアント）であること
- [ ] `Promise.all` による並列呼び出しであること
- [ ] `personGeneration` の明示指定があること
- [ ] `inlineData.mimeType` をレスポンスから参照していること（`image/png` ハードコードで URI を組んでいないこと）
- [ ] `aiClient.ts` の `TEXT_MODEL` / `IMAGE_MODEL` が新モデル名であること

### D. 旧モデル名の全域 grep 更新（小、独立）
- [ ] リポジトリ全体を `gemini-2.5-flash` / `imagen` で grep し、以下を更新:
  - `CLAUDE.md`（`Vertex AI (gemini-2.5-flash)` 記述）
  - `server/services/usageConfig.ts` L14 コメント（`gemini-2.5-flash テキスト生成 30 回相当`）
  - `docs/spec/m3/usage-cost-config.md`（該当あれば）
  - `public/dev/index.html`（該当あれば）
  - その他 grep でヒットした doc/コメント

### E. TEXT_MODEL 呼び出し 5 サービスの互換確認（小、独立）
- [ ] `analysisService` / `novelService` / `characterService` / `utilityService` / `worldService` の `generateContent` config（temperature / systemInstruction / responseSchema 等）が gemini-3.1-flash-lite で互換であることを確認（コード変更なしの想定）
- [ ] **thinkingConfig のデフォルト挙動確認**: Gemini 3.x 系は thinking 対応世代。thinking トークンが出力課金に乗る場合のコスト影響を dev の `usageMetadata` で確認し、必要なら `thinkingConfig` を明示設定

### F. dev デプロイ + 実機検証（A–E 完了後）
- [ ] feature ブランチ → PR → 番号認可マージ → dev 自動デプロイ
- [ ] テキスト生成: 小説続き生成を 1 件実行し 200 + 生成文が返ること。**生成文の創作品質を目視確認**（公開ベンチマークで未検証の領域）
- [ ] 画像生成: **人物キャラクターのプロンプトで** 4 枚の data URI が返ること（personGeneration 設定の実効確認を兼ねる）
- [ ] global エンドポイントで動作すること。余力があれば asia-northeast1 でも 1 回試行し、動作すれば regional 化を検討課題として記録
- [ ] `novel-writer-dev` の `aiplatform.googleapis.com` quota（RPM/IPM 相当）を確認し、1 クリック=4 呼び出しでの接触リスクを記録
- [ ] 429 発生時に FE で transient 系文言（再試行案内）が表示されることを確認（可能なら）

### G. コスト実測 + prod 判断（F 完了後、非同期可）
- [ ] 画像生成単価はテキストと異なり**公式 Pricing ページ未確認（二次情報 $0.034/枚のみ）**。dev 検証後に Billing コンソールで実課金を確認し、`image/generate: 1000 sen` の妥当性を裏取りする
- [ ] prod への反映は本田様の別途 GO 指示で `deploy-prod.yml` を手動実行

## Acceptance Criteria

1. `TEXT_MODEL === 'gemini-3.1-flash-lite'` かつ `IMAGE_MODEL === 'gemini-3.1-flash-lite-image'`（検証: テスト）
2. dev で小説続き生成 API → 200 + 生成テキスト（検証: 実機）
3. dev で画像生成 API（人物プロンプト）→ 200 + **4 枚**の data URI 配列（検証: 実機）
4. 画像レスポンスに画像 part が無い場合 → 明示エラーで throw し、route 層で分類される（検証: コード + テスト pin）
5. `imageApi.ts` / `ImageGenerationModal.tsx` / `server/routes/image.ts` に diff が無い（検証: git diff）
6. `npm run lint` / `npm run test` 全 PASS（検証: CI）
7. リポジトリ内に `gemini-2.5-flash` / `imagen-4.0` の実効参照が残っていない（検証: grep。履歴系ドキュメント docs/handoff/ 等は除外）

## 品質ゲート

- [ ] lint / test / build 全 PASS（件数報告）
- [ ] `/safe-refactor` → `/code-review`（実コード 3 ファイル以上のため MUST。effort は diff 規模で選択、目安 medium）
- [ ] 最終 diff が 5 ファイル以上になった場合は evaluator 分離プロトコル（rules/quality-gate.md）を追加実行

## リスク・ロールバック

- **ロールバック**: `aiClient.ts` のモデル定数 2 行 + imageService を revert して再デプロイするだけで旧構成に戻る（Imagen は廃止予定日未到来のため当面利用可能）
- **創作品質**: ベンチマーク上は新モデル優位だが創作文章品質は未検証。F の目視確認で懸念が出た場合、画像のみ先行・テキスト据え置きの分割リリースに切り替え可能（TEXT_MODEL 1 行 revert で分離できる）
- **レート制限**: 4 並列化で 429 接触確率が上がる。F で quota 実測し、頻発するようなら逐次化 or 枚数削減を別 PR で検討
- **global endpoint**: 画像プロンプトの日本リージョン外処理を許容（本計画承認に含む）
